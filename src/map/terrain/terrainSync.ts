import { create } from 'zustand';
import { getSupabase } from '../../data/supabase';
import { ENV } from '../../env';
import { bytesToBase64, base64ToBytes } from '../../data/base64';
import { deserializeHeights, serializeChunk, type ChunkStore } from './chunkStore';
import { chunkKey } from './chunkMath';
import type { TerrainLayer } from './terrainLayer';

/** Идентификатор вкладки: по нему Realtime отличает эхо собственной записи. */
export const CLIENT_ID = crypto.randomUUID();

/** ТЗ §5.5: батч раз в секунду, а не поток мазков. */
const FLUSH_INTERVAL_MS = 1000;

/** Код RLS-отказа Postgres. Повторять такую запись бессмысленно. */
const FORBIDDEN = '42501';

export interface ChunkRange {
  minCX: number; maxCX: number; minCY: number; maxCY: number;
}

interface SyncStatus {
  /** Заполняется, когда сохранять нельзя: нет прав или сеть недоступна. */
  error: string | null;
  savedAt: number | null;
  setError(error: string | null): void;
  markSaved(): void;
}

export const useSyncStatus = create<SyncStatus>((set) => ({
  error: null,
  savedAt: null,
  setError: (error) => set({ error }),
  markSaved: () => set({ error: null, savedAt: Date.now() }),
}));

export interface TerrainSync {
  ensureLoaded(range: ChunkRange): Promise<void>;
  reload(cx: number, cy: number): Promise<void>;
  flush(): Promise<void>;
  start(): void;
  stop(): void;
}

export function createTerrainSync(store: ChunkStore, layer: TerrainLayer): TerrainSync {
  const requested = new Set<string>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let flushing = false;
  let writesDisabled = false;

  function apply(cx: number, cy: number, base64: string) {
    store.load(cx, cy, deserializeHeights(base64ToBytes(base64)));
    layer.invalidate(cx, cy);
  }

  async function ensureLoaded(range: ChunkRange) {
    const missing: string[] = [];
    for (let cy = range.minCY; cy <= range.maxCY; cy++) {
      for (let cx = range.minCX; cx <= range.maxCX; cx++) {
        const key = chunkKey(cx, cy);
        if (!requested.has(key)) { requested.add(key); missing.push(key); }
      }
    }
    if (missing.length === 0) return;

    const { data, error } = await getSupabase().rpc('fetch_chunks', {
      p_map_id: ENV.mapId,
      p_min_x: range.minCX, p_max_x: range.maxCX,
      p_min_y: range.minCY, p_max_y: range.maxCY,
    });
    if (error) {
      // Диапазон не загрузился — разрешаем повторную попытку позже.
      for (const key of missing) requested.delete(key);
      throw new Error(error.message);
    }
    for (const row of data ?? []) apply(row.chunk_x, row.chunk_y, row.heights_b64);
  }

  async function reload(cx: number, cy: number) {
    const { data, error } = await getSupabase().rpc('fetch_chunks', {
      p_map_id: ENV.mapId, p_min_x: cx, p_max_x: cx, p_min_y: cy, p_max_y: cy,
    });
    if (error) throw new Error(error.message);
    const row = (data ?? [])[0];
    if (row) apply(row.chunk_x, row.chunk_y, row.heights_b64);
  }

  async function flush() {
    if (flushing || writesDisabled || !store.hasDirty()) return;
    flushing = true;
    // ТЗ §5.5: уходят только реально изменившиеся чанки, бинарно.
    const chunks = store.takeDirty();
    try {
      const payload = chunks.map((chunk) => ({
        x: chunk.cx, y: chunk.cy, d: bytesToBase64(serializeChunk(chunk)),
      }));
      const { error } = await getSupabase().rpc('save_chunks', {
        p_map_id: ENV.mapId, p_chunks: payload, p_client_id: CLIENT_ID,
      });
      if (error) {
        const forbidden = error.code === FORBIDDEN || /forbidden/i.test(error.message);
        if (forbidden) {
          // Права не появятся сами — прекращаем попытки, чтобы не долбить БД.
          writesDisabled = true;
          useSyncStatus.getState().setError('Изменения рельефа не сохраняются: нет прав на редактирование');
          return;
        }
        throw new Error(error.message);
      }
      useSyncStatus.getState().markSaved();
    } catch (cause) {
      // Сетевая ошибка — правки не теряем, вернём в грязные и повторим.
      for (const chunk of chunks) store.markDirty(chunk.cx, chunk.cy);
      useSyncStatus.getState().setError('Не удалось сохранить рельеф, повторяю');
      console.error('terrain flush failed', cause);
    } finally {
      flushing = false;
    }
  }

  return {
    ensureLoaded,
    reload,
    flush,
    start() { timer ??= setInterval(() => void flush(), FLUSH_INTERVAL_MS); },
    stop() { if (timer) { clearInterval(timer); timer = null; } },
  };
}
