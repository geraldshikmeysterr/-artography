import { CHUNK_CELLS, CHUNK_WORLD, CELL_SIZE } from './constants';
import type { Bounds } from '../camera';

export interface ChunkCoord { cx: number; cy: number }
export interface CellCoord { cx: number; cy: number; ix: number; iy: number }

export const chunkKey = (cx: number, cy: number): string => `${cx},${cy}`;

export function parseChunkKey(key: string): ChunkCoord {
  const [cx, cy] = key.split(',');
  return { cx: Number(cx), cy: Number(cy) };
}

export function worldToChunk(wx: number, wy: number): ChunkCoord {
  return { cx: Math.floor(wx / CHUNK_WORLD), cy: Math.floor(wy / CHUNK_WORLD) };
}

export function worldToCell(wx: number, wy: number): CellCoord {
  const { cx, cy } = worldToChunk(wx, wy);
  const localX = wx - cx * CHUNK_WORLD;
  const localY = wy - cy * CHUNK_WORLD;
  return {
    cx, cy,
    ix: Math.min(CHUNK_CELLS - 1, Math.floor(localX / CELL_SIZE)),
    iy: Math.min(CHUNK_CELLS - 1, Math.floor(localY / CELL_SIZE)),
  };
}

export const chunkOrigin = (cx: number, cy: number) =>
  ({ x: cx * CHUNK_WORLD, y: cy * CHUNK_WORLD });

export function chunkRange(bounds: Bounds, margin = 1) {
  const [minX, minY, maxX, maxY] = bounds;
  return {
    minCX: Math.floor(minX / CHUNK_WORLD) - margin,
    maxCX: Math.floor(maxX / CHUNK_WORLD) + margin,
    minCY: Math.floor(minY / CHUNK_WORLD) - margin,
    maxCY: Math.floor(maxY / CHUNK_WORLD) + margin,
  };
}

export const cellIndex = (ix: number, iy: number): number => iy * CHUNK_CELLS + ix;

/** Сквозная нумерация ячеек по всему миру → чанк плюс ячейка внутри него. */
export function globalCellToChunk(gx: number, gy: number): CellCoord {
  const cx = Math.floor(gx / CHUNK_CELLS);
  const cy = Math.floor(gy / CHUNK_CELLS);
  return { cx, cy, ix: gx - cx * CHUNK_CELLS, iy: gy - cy * CHUNK_CELLS };
}

/** Мировая координата центра ячейки со сквозным номером gx. */
export const globalCellCentre = (g: number): number => (g + 0.5) * CELL_SIZE;

/** Сквозной номер ячейки, содержащей мировую координату. */
export const worldToGlobalCell = (w: number): number => Math.floor(w / CELL_SIZE);
