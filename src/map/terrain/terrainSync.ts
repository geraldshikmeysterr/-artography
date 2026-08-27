import { create } from 'zustand';
import { getSupabase } from '../../data/supabase';
import { ENV } from '../../env';
import { bytesToBase64, base64ToBytes } from '../../data/base64';
import { deserializeHeights, serializeChunk, type ChunkStore, type ChunkRangeBox } from './chunkStore';

import { createChunkRegistry } from './chunkRegistry';
import type { TerrainLayer } from './terrainLayer';

/** Идентификатор вкладки: по нему Realtime отличает эхо собственной записи. */
export const CLIENT_ID = crypto.randomUUID();

/** ТЗ §5.5: батч раз в секунду, а не поток мазков. */
const FLUSH_INTERVAL_MS = 1000;

/** Код RLS-отказа Postgres. Повторять такую запись бессмысленно. */
const FORBIDDEN = '42501';

export type ChunkRange = ChunkRangeBox;

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
  /** Выгружает чанки вне диапазона и забывает их, чтобы перезагрузить потом. */
  evict(range: ChunkRange): void;
  reload(cx: number, cy: number): Promise<void>;
  flush(): Promise<void>;
  start(): void;
  stop(): void;
}

export function createTerrainSync(store: ChunkStore, layer: TerrainLayer): TerrainSync {
  const registry = createChunkRegistry();
  let timer: ReturnType<typeof setInterval> | null = null;
  let flushing = false;
  let writesDisabled = false;

  function apply(cx: number, cy: number, base64: string) {
    // Пользователь уже правит этот чанк — снепшот с сервера затёр бы мазок.
    // ТЗ §11: кто последний записал, тот и победил, и здесь последний — он.
    if (store.isDirty(cx, cy)) return;
    store.load(cx, cy, deserializeHeights(base64ToBytes(base64)));
    layer.invalidate(cx, cy);
  }

  async function ensureLoaded(range: ChunkRange) {
    const missing = registry.missing(range);
    if (missing.length === 0) return;
    registry.markRequested(missing);

    const { data, error } = await getSupabase().rpc('fetch_chunks', {
      p_map_id: ENV.mapId,
      p_min_x: range.minCX, p_max_x: range.maxCX,
      p_min_y: range.minCY, p_max_y: range.maxCY,
    });
    if (error) {
      // Диапазон не загрузился — разрешаем повторную попытку позже.
      registry.forget(missing);
      throw new Error(error.message);
    }
    for (const row of data ?? []) apply(row.chunk_x, row.chunk_y, row.heights_b64);
  }

  /**
   * Выгрузка и забывание идут одной операцией: разъехавшись, они дают
   * пустой чанк, который уже не перезагрузится.
   */
  function evict(range: ChunkRange) {
    registry.forget(store.evictOutside(range));
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
    if (flushing || !store.hasDirty()) return;
    if (writesDisabled) {
      // Сохранить всё равно нельзя, но набор грязных надо опустошать: иначе
      // такие чанки никогда не выгрузятся и память будет расти без предела.
      store.takeDirty();
      return;
    }
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
    evict,
    reload,
    flush,
    start() { timer ??= setInterval(() => void flush(), FLUSH_INTERVAL_MS); },
    stop() { if (timer) { clearInterval(timer); timer = null; } },
  };
}
