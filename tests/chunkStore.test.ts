import { describe, it, expect } from 'vitest';
import {
  createChunkStore, serializeChunk, deserializeHeights,
} from '../src/map/terrain/chunkStore';
import { CHUNK_CELLS, CELL_SIZE } from '../src/map/terrain/constants';
import { cellIndex } from '../src/map/terrain/chunkMath';

describe('chunk store', () => {
  it('creates a zero-filled chunk on demand', () => {
    const store = createChunkStore();
    const chunk = store.ensure(0, 0);
    expect(chunk.heights).toHaveLength(CHUNK_CELLS * CHUNK_CELLS);
    expect(chunk.heights.every((h) => h === 0)).toBe(true);
  });

  it('returns the same chunk instance for the same coordinates', () => {
    const store = createChunkStore();
    expect(store.ensure(1, 2)).toBe(store.ensure(1, 2));
  });

  it('samples zero where no chunk exists', () => {
    expect(createChunkStore().sampleHeight(99999, 99999)).toBe(0);
  });

  it('samples the stored height at a cell centre', () => {
    const store = createChunkStore();
    store.ensure(0, 0).heights.fill(120);
    expect(store.sampleHeight(CELL_SIZE * 4 + CELL_SIZE / 2, CELL_SIZE * 4 + CELL_SIZE / 2))
      .toBeCloseTo(120, 5);
  });

  it('interpolates between neighbouring cells', () => {
    const store = createChunkStore();
    const chunk = store.ensure(0, 0);
    chunk.heights[cellIndex(0, 0)] = 0;
    chunk.heights[cellIndex(1, 0)] = 100;
    // Ровно между центрами ячеек (0,0) и (1,0).
    expect(store.sampleHeight(CELL_SIZE, CELL_SIZE / 2)).toBeCloseTo(50, 4);
  });

  it('tracks dirty chunks and clears them when taken', () => {
    const store = createChunkStore();
    store.ensure(0, 0);
    store.markDirty(0, 0);
    store.markDirty(0, 0);
    expect(store.hasDirty()).toBe(true);
    expect(store.takeDirty().map((c) => [c.cx, c.cy])).toEqual([[0, 0]]);
    expect(store.hasDirty()).toBe(false);
  });

  it('evicts chunks outside the range but keeps dirty ones', () => {
    const store = createChunkStore();
    store.ensure(0, 0);
    store.ensure(50, 50);
    store.markDirty(50, 50);
    expect(store.evictOutside({ minCX: -1, maxCX: 1, minCY: -1, maxCY: 1 })).toEqual([]);
    store.takeDirty();
    expect(store.evictOutside({ minCX: -1, maxCX: 1, minCY: -1, maxCY: 1 })).toEqual(['50,50']);
    expect(store.has(50, 50)).toBe(false);
  });

  it('round-trips a chunk through Int16 little-endian bytes', () => {
    const store = createChunkStore();
    const chunk = store.ensure(0, 0);
    chunk.heights[0] = -2048;
    chunk.heights[1] = 2047;
    chunk.heights[2] = 3.7;
    const bytes = serializeChunk(chunk);
    expect(bytes).toHaveLength(CHUNK_CELLS * CHUNK_CELLS * 2);
    const restored = deserializeHeights(bytes);
    expect(restored[0]).toBe(-2048);
    expect(restored[1]).toBe(2047);
    expect(restored[2]).toBe(4);
  });

  it('clamps out-of-range heights during serialisation', () => {
    const store = createChunkStore();
    const chunk = store.ensure(0, 0);
    chunk.heights[0] = 99999;
    chunk.heights[1] = -99999;
    const restored = deserializeHeights(serializeChunk(chunk));
    expect(restored[0]).toBe(2047);
    expect(restored[1]).toBe(-2048);
  });

  it('loads heights from Int16 data and bumps the revision', () => {
    const store = createChunkStore();
    const before = store.ensure(3, 3).revision;
    const data = new Int16Array(CHUNK_CELLS * CHUNK_CELLS).fill(77);
    const chunk = store.load(3, 3, data);
    expect(chunk.heights[0]).toBe(77);
    expect(chunk.revision).toBeGreaterThan(before);
  });

  it('samples across a chunk boundary using the neighbouring chunk', () => {
    const store = createChunkStore();
    store.ensure(0, 0).heights.fill(10);
    store.ensure(1, 0).heights.fill(20);
    const seam = CHUNK_CELLS * CELL_SIZE;   // граница между чанками 0 и 1
    expect(store.sampleHeight(seam, CELL_SIZE / 2)).toBeCloseTo(15, 4);
  });
});
