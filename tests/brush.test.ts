import { describe, it, expect } from 'vitest';
import { falloff, stampBrush, smoothBrush, paintStroke } from '../src/map/terrain/brush';
import { createChunkStore } from '../src/map/terrain/chunkStore';
import { CELL_SIZE, CHUNK_WORLD, HEIGHT_MAX, HEIGHT_MIN } from '../src/map/terrain/constants';
import { cellIndex, worldToCell } from '../src/map/terrain/chunkMath';

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

describe('smoothBrush', () => {
  const spikeStore = () => {
    const store = createChunkStore();
    const chunk = store.ensure(0, 0);
    chunk.heights.fill(100);
    chunk.heights[cellIndex(20, 20)] = 900;   // резкий пик
    return store;
  };

  it('pulls a spike down towards its neighbours', () => {
    const store = spikeStore();
    const centre = CELL_SIZE * 20 + CELL_SIZE / 2;
    smoothBrush(store, centre, centre, CELL_SIZE * 6, 1);
    const peak = store.get(0, 0)!.heights[cellIndex(20, 20)];
    expect(peak).toBeLessThan(900);
    expect(peak).toBeGreaterThan(100);
  });

  it('converges towards the local average, never past it', () => {
    const store = spikeStore();
    const centre = CELL_SIZE * 20 + CELL_SIZE / 2;
    for (let i = 0; i < 40; i++) smoothBrush(store, centre, centre, CELL_SIZE * 6, 1);
    const peak = store.get(0, 0)!.heights[cellIndex(20, 20)];
    expect(peak).toBeGreaterThanOrEqual(100);
    expect(peak).toBeLessThan(200);
  });

  it('leaves already flat terrain untouched', () => {
    const store = createChunkStore();
    store.ensure(0, 0).heights.fill(250);
    const centre = CELL_SIZE * 20 + CELL_SIZE / 2;
    smoothBrush(store, centre, centre, CELL_SIZE * 6, 1);
    expect(store.get(0, 0)!.heights[cellIndex(20, 20)]).toBeCloseTo(250, 3);
  });

  it('marks the touched chunk dirty', () => {
    const store = spikeStore();
    store.takeDirty();
    smoothBrush(store, CELL_SIZE * 20, CELL_SIZE * 20, CELL_SIZE * 6, 1);
    expect(store.takeDirty().map((c) => [c.cx, c.cy])).toEqual([[0, 0]]);
  });

  it('smooths across a chunk boundary using the neighbour', () => {
    const store = createChunkStore();
    store.ensure(0, 0).heights.fill(0);
    store.ensure(1, 0).heights.fill(800);
    const seam = CHUNK_WORLD;
    smoothBrush(store, seam, CHUNK_WORLD / 2, CELL_SIZE * 8, 1);
    // Последняя ячейка левого чанка должна подтянуться вверх к соседу.
    const left = store.get(0, 0)!.heights[cellIndex(63, 31)];
    expect(left).toBeGreaterThan(0);
  });

  // Жалоба «сглаживание слишком слабое» была про фиксированное ядро 3x3:
  // крупную форму оно почти не трогало. Ядро теперь растёт с радиусом.
  // Мерим крутизну склона на краю плато: внутри однородной области среднее
  // равно ей самой, и сглаживать там нечего.
  const plateau = () => {
    const store = createChunkStore();
    const chunk = store.ensure(0, 0);
    for (let iy = 12; iy < 32; iy++) {
      for (let ix = 12; ix < 32; ix++) chunk.heights[cellIndex(ix, iy)] = 800;
    }
    return store;
  };
  /** Перепад через край плато — прямая мера «резкого угла». */
  const edgeDrop = (store: ReturnType<typeof createChunkStore>) => {
    const h = store.get(0, 0)!.heights;
    return h[cellIndex(13, 22)] - h[cellIndex(11, 22)];
  };

  it('softens a sharp plateau edge in a single application', () => {
    const store = plateau();
    const before = edgeDrop(store);
    expect(before).toBe(800);

    smoothBrush(store, CELL_SIZE * 12, CELL_SIZE * 22, CELL_SIZE * 20, 1);
    expect(edgeDrop(store)).toBeLessThan(before * 0.5);
  });

  it('softens more with a wider brush', () => {
    const narrow = plateau();
    smoothBrush(narrow, CELL_SIZE * 12, CELL_SIZE * 22, CELL_SIZE * 6, 1);
    const wide = plateau();
    smoothBrush(wide, CELL_SIZE * 12, CELL_SIZE * 22, CELL_SIZE * 20, 1);

    expect(edgeDrop(wide)).toBeLessThan(edgeDrop(narrow));
  });

  it('does nothing for a zero radius or zero amount', () => {
    const store = spikeStore();
    store.takeDirty();
    smoothBrush(store, 100, 100, 0, 1);
    smoothBrush(store, 100, 100, 50, 0);
    expect(store.hasDirty()).toBe(false);
  });
});

describe('paintStroke', () => {
  const settings = { radius: CELL_SIZE * 4, strength: 100, mode: 'raise' as const };

  it('applies while the pointer stays still', () => {
    const store = createChunkStore();
    const centre = CHUNK_WORLD / 2;
    const at = { x: centre, y: centre };
    paintStroke(store, at, at, 'sculpt', settings, 1);
    const { ix, iy } = worldToCell(centre, centre);
    expect(store.get(0, 0)!.heights[cellIndex(ix, iy)]).toBeGreaterThan(0);
  });

  it('scales the applied amount with elapsed time', () => {
    const centre = CHUNK_WORLD / 2;
    const at = { x: centre, y: centre };
    const { ix, iy } = worldToCell(centre, centre);

    const short = createChunkStore();
    paintStroke(short, at, at, 'sculpt', settings, 0.25);
    const long = createChunkStore();
    paintStroke(long, at, at, 'sculpt', settings, 1);

    expect(long.get(0, 0)!.heights[cellIndex(ix, iy)])
      .toBeCloseTo(short.get(0, 0)!.heights[cellIndex(ix, iy)] * 4, 3);
  });

  it('spreads a moving stroke over the whole path', () => {
    const store = createChunkStore();
    const y = CHUNK_WORLD / 2;
    paintStroke(store, { x: CELL_SIZE * 6, y }, { x: CELL_SIZE * 40, y },
                'sculpt', settings, 1);
    const heights = store.get(0, 0)!.heights;
    const row = worldToCell(0, y).iy;
    for (let ix = 8; ix <= 38; ix++) {
      expect(heights[cellIndex(ix, row)]).toBeGreaterThan(0);
    }
  });

  it('lowers when the mode is lower', () => {
    const store = createChunkStore();
    const centre = CHUNK_WORLD / 2;
    const at = { x: centre, y: centre };
    paintStroke(store, at, at, 'sculpt', { ...settings, mode: 'lower' }, 1);
    const { ix, iy } = worldToCell(centre, centre);
    expect(store.get(0, 0)!.heights[cellIndex(ix, iy)]).toBeLessThan(0);
  });

  it('does nothing for zero elapsed time', () => {
    const store = createChunkStore();
    const at = { x: CHUNK_WORLD / 2, y: CHUNK_WORLD / 2 };
    paintStroke(store, at, at, 'sculpt', settings, 0);
    expect(store.hasDirty()).toBe(false);
  });
});
