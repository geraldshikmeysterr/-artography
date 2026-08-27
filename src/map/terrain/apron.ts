import type { ChunkStore } from './chunkStore';
import { CHUNK_CELLS, TEX_SIZE, APRON } from './constants';
import { cellIndex } from './chunkMath';
import { toHalf } from './half';

export const texIndex = (col: number, row: number): number => row * TEX_SIZE + col;

/**
 * Читает ячейку (ix, iy) чанка (cx, cy), допуская выход за границы:
 * -1 и CHUNK_CELLS уводят в соседний чанк. Если сосед не загружен —
 * повторяем собственный крайний столбец/строку, чтобы не было ступеньки.
 */
function readWithNeighbours(
  store: ChunkStore, cx: number, cy: number, ix: number, iy: number, own: Float32Array,
): number {
  let ncx = cx, ncy = cy, nix = ix, niy = iy;
  if (nix < 0) { nix += CHUNK_CELLS; ncx -= 1; }
  else if (nix >= CHUNK_CELLS) { nix -= CHUNK_CELLS; ncx += 1; }
  if (niy < 0) { niy += CHUNK_CELLS; ncy -= 1; }
  else if (niy >= CHUNK_CELLS) { niy -= CHUNK_CELLS; ncy += 1; }

  if (ncx === cx && ncy === cy) return own[cellIndex(nix, niy)];

  const neighbour = store.get(ncx, ncy);
  if (neighbour) return neighbour.heights[cellIndex(nix, niy)];

  const clampedX = Math.max(0, Math.min(CHUNK_CELLS - 1, ix));
  const clampedY = Math.max(0, Math.min(CHUNK_CELLS - 1, iy));
  return own[cellIndex(clampedX, clampedY)];
}

/**
 * Заполняет буфер TEX_SIZE² значениями Float16: внутренние 64×64 — высоты
 * самого чанка, рамка — высоты соседей. Без фартука fwidth() и центральные
 * разности на границе берут пиксель с другой стороны текстуры, и на стыках
 * появляются разрывы изолиний и полосы освещения.
 */
export function buildChunkTextureData(
  store: ChunkStore, cx: number, cy: number, target: Uint16Array,
): void {
  const own = store.ensure(cx, cy).heights;
  for (let row = 0; row < TEX_SIZE; row++) {
    const iy = row - APRON;
    for (let col = 0; col < TEX_SIZE; col++) {
      const ix = col - APRON;
      const height = (ix >= 0 && ix < CHUNK_CELLS && iy >= 0 && iy < CHUNK_CELLS)
        ? own[cellIndex(ix, iy)]
        : readWithNeighbours(store, cx, cy, ix, iy, own);
      target[texIndex(col, row)] = toHalf(height);
    }
  }
}
