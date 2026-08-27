import { describe, it, expect } from 'vitest';
import {
  chunkKey, parseChunkKey, worldToChunk, worldToCell, chunkOrigin, chunkRange, cellIndex,
} from '../src/map/terrain/chunkMath';
import { CHUNK_WORLD, CELL_SIZE, CHUNK_CELLS } from '../src/map/terrain/constants';

describe('chunk addressing', () => {
  it('round-trips a chunk key', () => {
    expect(parseChunkKey(chunkKey(-3, 7))).toEqual({ cx: -3, cy: 7 });
  });

  it('maps world coordinates to a chunk', () => {
    expect(worldToChunk(0, 0)).toEqual({ cx: 0, cy: 0 });
    expect(worldToChunk(CHUNK_WORLD - 1, 0)).toEqual({ cx: 0, cy: 0 });
    expect(worldToChunk(CHUNK_WORLD, 0)).toEqual({ cx: 1, cy: 0 });
  });

  it('handles negative world coordinates without an off-by-one', () => {
    expect(worldToChunk(-1, -1)).toEqual({ cx: -1, cy: -1 });
    expect(worldToChunk(-CHUNK_WORLD, 0)).toEqual({ cx: -1, cy: 0 });
    expect(worldToChunk(-CHUNK_WORLD - 1, 0)).toEqual({ cx: -2, cy: 0 });
  });

  it('maps world coordinates to a cell inside a chunk', () => {
    expect(worldToCell(0, 0)).toEqual({ cx: 0, cy: 0, ix: 0, iy: 0 });
    expect(worldToCell(CELL_SIZE * 3 + 1, CELL_SIZE * 5 + 7))
      .toEqual({ cx: 0, cy: 0, ix: 3, iy: 5 });
    const negative = worldToCell(-1, -1);
    expect(negative.cx).toBe(-1);
    expect(negative.ix).toBe(CHUNK_CELLS - 1);
    expect(negative.iy).toBe(CHUNK_CELLS - 1);
  });

  it('reports the world origin of a chunk', () => {
    expect(chunkOrigin(2, -1)).toEqual({ x: 2 * CHUNK_WORLD, y: -CHUNK_WORLD });
  });

  it('lists the chunk range covering a viewport with a margin', () => {
    expect(chunkRange([0, 0, CHUNK_WORLD * 2 - 1, CHUNK_WORLD - 1], 0))
      .toEqual({ minCX: 0, maxCX: 1, minCY: 0, maxCY: 0 });
    expect(chunkRange([0, 0, 1, 1], 1))
      .toEqual({ minCX: -1, maxCX: 1, minCY: -1, maxCY: 1 });
  });

  it('indexes cells row-major', () => {
    expect(cellIndex(0, 0)).toBe(0);
    expect(cellIndex(3, 2)).toBe(2 * CHUNK_CELLS + 3);
  });
});
