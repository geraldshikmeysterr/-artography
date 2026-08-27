import { CHUNK_CELLS, CELL_SIZE, HEIGHT_MIN, HEIGHT_MAX } from './constants';
import { chunkKey, cellIndex } from './chunkMath';

export interface Chunk {
  cx: number;
  cy: number;
  /** Авторитетные высоты. Float32, чтобы мазки не квантовались при накоплении. */
  heights: Float32Array;
  /** Растёт при каждом изменении — триггер перезаливки в GPU. */
  revision: number;
}

export interface ChunkRangeBox {
  minCX: number; maxCX: number; minCY: number; maxCY: number;
}

export interface ChunkStore {
  get(cx: number, cy: number): Chunk | undefined;
  ensure(cx: number, cy: number): Chunk;
  has(cx: number, cy: number): boolean;
  keys(): IterableIterator<string>;
  size(): number;
  sampleHeight(wx: number, wy: number): number;
  markDirty(cx: number, cy: number): void;
  takeDirty(): Chunk[];
  hasDirty(): boolean;
  evictOutside(range: ChunkRangeBox): string[];
  load(cx: number, cy: number, heights: Int16Array): Chunk;
}

const CELLS = CHUNK_CELLS * CHUNK_CELLS;

export function createChunkStore(): ChunkStore {
  const chunks = new Map<string, Chunk>();
  const dirty = new Set<string>();

  const get = (cx: number, cy: number) => chunks.get(chunkKey(cx, cy));

  function ensure(cx: number, cy: number): Chunk {
    const key = chunkKey(cx, cy);
    let chunk = chunks.get(key);
    if (!chunk) {
      chunk = { cx, cy, heights: new Float32Array(CELLS), revision: 1 };
      chunks.set(key, chunk);
    }
    return chunk;
  }

  /** Читает ячейку, допуская выход за границы чанка — уходит в соседний. */
  function readCell(cx: number, cy: number, ix: number, iy: number): number {
    let ncx = cx, ncy = cy, nix = ix, niy = iy;
    while (nix < 0) { nix += CHUNK_CELLS; ncx -= 1; }
    while (nix >= CHUNK_CELLS) { nix -= CHUNK_CELLS; ncx += 1; }
    while (niy < 0) { niy += CHUNK_CELLS; ncy -= 1; }
    while (niy >= CHUNK_CELLS) { niy -= CHUNK_CELLS; ncy += 1; }
    const chunk = get(ncx, ncy);
    return chunk ? chunk.heights[cellIndex(nix, niy)] : 0;
  }

  /** Билинейная выборка; 0 там, где чанк не загружен. */
  function sampleHeight(wx: number, wy: number): number {
    // Центр ячейки (ix,iy) лежит в мире на (ix + 0.5) * CELL_SIZE.
    const gx = wx / CELL_SIZE - 0.5;
    const gy = wy / CELL_SIZE - 0.5;
    const g0x = Math.floor(gx);
    const g0y = Math.floor(gy);
    const tx = gx - g0x;
    const ty = gy - g0y;

    const cx = Math.floor(g0x / CHUNK_CELLS);
    const cy = Math.floor(g0y / CHUNK_CELLS);
    const ix = g0x - cx * CHUNK_CELLS;
    const iy = g0y - cy * CHUNK_CELLS;

    const h00 = readCell(cx, cy, ix, iy);
    const h10 = readCell(cx, cy, ix + 1, iy);
    const h01 = readCell(cx, cy, ix, iy + 1);
    const h11 = readCell(cx, cy, ix + 1, iy + 1);

    return (h00 * (1 - tx) + h10 * tx) * (1 - ty) + (h01 * (1 - tx) + h11 * tx) * ty;
  }

  return {
    get,
    ensure,
    has: (cx, cy) => chunks.has(chunkKey(cx, cy)),
    keys: () => chunks.keys(),
    size: () => chunks.size,
    sampleHeight,

    markDirty(cx, cy) { dirty.add(chunkKey(cx, cy)); },
    hasDirty: () => dirty.size > 0,

    takeDirty() {
      const result: Chunk[] = [];
      for (const key of dirty) {
        const chunk = chunks.get(key);
        if (chunk) result.push(chunk);
      }
      dirty.clear();
      return result;
    },

    /** Грязные чанки не выгружаются — они ещё не сохранены. */
    evictOutside(range) {
      const evicted: string[] = [];
      for (const key of [...chunks.keys()]) {
        if (dirty.has(key)) continue;
        const chunk = chunks.get(key)!;
        if (chunk.cx < range.minCX || chunk.cx > range.maxCX ||
            chunk.cy < range.minCY || chunk.cy > range.maxCY) {
          chunks.delete(key);
          evicted.push(key);
        }
      }
      return evicted;
    },

    load(cx, cy, heights) {
      const chunk = ensure(cx, cy);
      for (let i = 0; i < CELLS; i++) chunk.heights[i] = heights[i];
      chunk.revision += 1;
      return chunk;
    },
  };
}

/**
 * Int16 little-endian, 8192 байта на чанк (ТЗ §5.2). Int16Array в браузере
 * всегда little-endian на поддерживаемых платформах, DataView не нужен.
 */
export function serializeChunk(chunk: Chunk): Uint8Array {
  const out = new Int16Array(CELLS);
  for (let i = 0; i < CELLS; i++) {
    const rounded = Math.round(chunk.heights[i]);
    out[i] = Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, rounded));
  }
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

export function deserializeHeights(bytes: Uint8Array): Int16Array {
  const copy = bytes.slice();   // выравнивание по 2 байта не гарантировано
  return new Int16Array(copy.buffer, copy.byteOffset, copy.byteLength / 2);
}
