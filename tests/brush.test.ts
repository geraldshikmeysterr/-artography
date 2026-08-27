import { describe, it, expect } from 'vitest';
import { falloff, stampBrush, strokeBrush } from '../src/map/terrain/brush';
import { createChunkStore } from '../src/map/terrain/chunkStore';
import { CELL_SIZE, CHUNK_WORLD, HEIGHT_MAX, HEIGHT_MIN } from '../src/map/terrain/constants';
import { cellIndex } from '../src/map/terrain/chunkMath';

describe('falloff', () => {
  it('is 1 at the centre and 0 at the rim', () => {
    expect(falloff(0, 100)).toBe(1);
    expect(falloff(100, 100)).toBe(0);
    expect(falloff(150, 100)).toBe(0);
  });

  it('is smooth and monotonically decreasing', () => {
    expect(falloff(50, 100)).toBeCloseTo(0.5625, 6);
    expect(falloff(25, 100)).toBeGreaterThan(falloff(75, 100));
  });
});

describe('stampBrush', () => {
  const centre = CELL_SIZE * 8 + CELL_SIZE / 2;

  it('raises the centre by the full strength', () => {
    const store = createChunkStore();
    stampBrush(store, centre, centre, { radius: CELL_SIZE * 4, strength: 100, mode: 'raise' });
    expect(store.get(0, 0)!.heights[cellIndex(8, 8)]).toBeCloseTo(100, 4);
  });

  it('lowers when the mode is lower', () => {
    const store = createChunkStore();
    stampBrush(store, centre, centre, { radius: CELL_SIZE * 4, strength: 100, mode: 'lower' });
    expect(store.get(0, 0)!.heights[cellIndex(8, 8)]).toBeCloseTo(-100, 4);
  });

  it('leaves cells outside the radius untouched', () => {
    const store = createChunkStore();
    stampBrush(store, centre, centre, { radius: CELL_SIZE * 2, strength: 100, mode: 'raise' });
    expect(store.get(0, 0)!.heights[cellIndex(30, 30)]).toBe(0);
  });

  it('marks the touched chunk dirty', () => {
    const store = createChunkStore();
    const middle = CHUNK_WORLD / 2;
    stampBrush(store, middle, middle, { radius: 20, strength: 10, mode: 'raise' });
    expect(store.takeDirty().map((c) => [c.cx, c.cy])).toEqual([[0, 0]]);
  });

  it('does not create neighbouring chunks the round brush never reaches', () => {
    const store = createChunkStore();
    const middle = CHUNK_WORLD / 2;
    stampBrush(store, middle, middle, { radius: 20, strength: 10, mode: 'raise' });
    expect(store.size()).toBe(1);
  });

  it('spills into a neighbour only where cells are actually covered', () => {
    const store = createChunkStore();
    // Кисть у самого начала координат достаёт до всех четырёх соседних чанков.
    stampBrush(store, 10, 10, { radius: 20, strength: 10, mode: 'raise' });
    const touched = store.takeDirty().map((c) => `${c.cx},${c.cy}`).sort();
    expect(touched).toEqual(['-1,-1', '-1,0', '0,-1', '0,0']);
  });

  it('spills across a chunk boundary and marks both chunks dirty', () => {
    const store = createChunkStore();
    stampBrush(store, CHUNK_WORLD, CHUNK_WORLD / 2,
      { radius: CELL_SIZE * 6, strength: 50, mode: 'raise' });
    const touched = store.takeDirty().map((c) => `${c.cx},${c.cy}`).sort();
    expect(touched).toContain('0,0');
    expect(touched).toContain('1,0');
  });

  it('clamps to the terrain height range', () => {
    const store = createChunkStore();
    for (let i = 0; i < 200; i++) {
      stampBrush(store, centre, centre, { radius: CELL_SIZE * 3, strength: 500, mode: 'raise' });
    }
    expect(store.get(0, 0)!.heights[cellIndex(8, 8)]).toBe(HEIGHT_MAX);
    for (let i = 0; i < 400; i++) {
      stampBrush(store, centre, centre, { radius: CELL_SIZE * 3, strength: 500, mode: 'lower' });
    }
    expect(store.get(0, 0)!.heights[cellIndex(8, 8)]).toBe(HEIGHT_MIN);
  });

  it('bumps the chunk revision so the GPU texture is refreshed', () => {
    const store = createChunkStore();
    const before = store.ensure(0, 0).revision;
    stampBrush(store, 10, 10, { radius: 20, strength: 10, mode: 'raise' });
    expect(store.get(0, 0)!.revision).toBeGreaterThan(before);
  });

  it('does nothing for a zero radius or zero strength', () => {
    const store = createChunkStore();
    stampBrush(store, 10, 10, { radius: 0, strength: 100, mode: 'raise' });
    stampBrush(store, 10, 10, { radius: 50, strength: 0, mode: 'raise' });
    expect(store.hasDirty()).toBe(false);
  });
});

describe('strokeBrush', () => {
  it('paints a continuous band between two distant points', () => {
    const store = createChunkStore();
    const settings = { radius: CELL_SIZE * 2, strength: 100, mode: 'raise' as const };
    strokeBrush(store, CELL_SIZE * 4, CELL_SIZE * 4, CELL_SIZE * 40, CELL_SIZE * 4, settings);
    const heights = store.get(0, 0)!.heights;
    for (let ix = 5; ix <= 39; ix++) {
      expect(heights[cellIndex(ix, 4)]).toBeGreaterThan(0);
    }
  });
});
