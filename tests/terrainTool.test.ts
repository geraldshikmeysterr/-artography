import { describe, it, expect, beforeEach } from 'vitest';
import {
  useTerrainTool, modeForButton, createTerrainPainter,
  MIN_RADIUS, MAX_RADIUS, MIN_STRENGTH, MAX_STRENGTH,
} from '../src/map/terrain/terrainTool';
import { createChunkStore } from '../src/map/terrain/chunkStore';
import { CHUNK_WORLD } from '../src/map/terrain/constants';
import { worldToCell, cellIndex } from '../src/map/terrain/chunkMath';
import type { TerrainLayer } from '../src/map/terrain/terrainLayer';

/** Кисти нужен только store из слоя, остальное для неё неважно. */
const fakeLayer = (store: ReturnType<typeof createChunkStore>) =>
  ({ store } as unknown as TerrainLayer);

const centre = CHUNK_WORLD / 2;
const heightAtCentre = (store: ReturnType<typeof createChunkStore>) => {
  const { ix, iy } = worldToCell(centre, centre);
  return store.get(0, 0)?.heights[cellIndex(ix, iy)] ?? 0;
};

describe('modeForButton', () => {
  it('maps left to lower and right to raise', () => {
    expect(modeForButton(0)).toBe('lower');
    expect(modeForButton(2)).toBe('raise');
  });

  it('leaves the middle button to the camera', () => {
    expect(modeForButton(1)).toBeNull();
  });
});

describe('brush size and strength via wheel', () => {
  beforeEach(() => {
    useTerrainTool.setState({ radius: 120, strength: 220, shape: 'sculpt' });
  });

  it('grows the radius when the wheel turns forwards', () => {
    useTerrainTool.getState().nudgeRadius(1);
    expect(useTerrainTool.getState().radius).toBeGreaterThan(120);
  });

  it('shrinks the radius when the wheel turns backwards', () => {
    useTerrainTool.getState().nudgeRadius(-1);
    expect(useTerrainTool.getState().radius).toBeLessThan(120);
  });

  it('clamps the radius to its range', () => {
    for (let i = 0; i < 200; i++) useTerrainTool.getState().nudgeRadius(1);
    expect(useTerrainTool.getState().radius).toBe(MAX_RADIUS);
    for (let i = 0; i < 400; i++) useTerrainTool.getState().nudgeRadius(-1);
    expect(useTerrainTool.getState().radius).toBe(MIN_RADIUS);
  });

  it('clamps the strength to its range', () => {
    for (let i = 0; i < 200; i++) useTerrainTool.getState().nudgeStrength(1);
    expect(useTerrainTool.getState().strength).toBe(MAX_STRENGTH);
    for (let i = 0; i < 400; i++) useTerrainTool.getState().nudgeStrength(-1);
    expect(useTerrainTool.getState().strength).toBe(MIN_STRENGTH);
  });
});

describe('terrain painter', () => {
  beforeEach(() => {
    useTerrainTool.setState({ radius: 120, strength: 200, shape: 'sculpt', painting: false });
  });

  it('lowers on the left button', () => {
    const store = createChunkStore();
    const painter = createTerrainPainter(fakeLayer(store), () => {});
    expect(painter.begin(0, centre, centre)).toBe(true);
    painter.tick(0.5);
    expect(heightAtCentre(store)).toBeLessThan(0);
    painter.end();
  });

  it('raises on the right button', () => {
    const store = createChunkStore();
    const painter = createTerrainPainter(fakeLayer(store), () => {});
    painter.begin(2, centre, centre);
    painter.tick(0.5);
    expect(heightAtCentre(store)).toBeGreaterThan(0);
    painter.end();
  });

  it('refuses the middle button so the camera keeps it', () => {
    const store = createChunkStore();
    const painter = createTerrainPainter(fakeLayer(store), () => {});
    expect(painter.begin(1, centre, centre)).toBe(false);
    painter.tick(1);
    expect(store.hasDirty()).toBe(false);
  });

  // Главное требование: раньше без движения курсора ничего не происходило.
  it('keeps changing the terrain while the pointer stays still', () => {
    const store = createChunkStore();
    const painter = createTerrainPainter(fakeLayer(store), () => {});
    painter.begin(2, centre, centre);

    painter.tick(0.2);
    const afterFirst = heightAtCentre(store);
    painter.tick(0.2);
    const afterSecond = heightAtCentre(store);

    expect(afterFirst).toBeGreaterThan(0);
    expect(afterSecond).toBeGreaterThan(afterFirst);
    painter.end();
  });

  it('does nothing after the stroke ends', () => {
    const store = createChunkStore();
    const painter = createTerrainPainter(fakeLayer(store), () => {});
    painter.begin(2, centre, centre);
    painter.tick(0.2);
    painter.end();
    const frozen = heightAtCentre(store);
    painter.tick(1);
    expect(heightAtCentre(store)).toBe(frozen);
  });

  it('reports the stroke end exactly once so the batch save fires', () => {
    const store = createChunkStore();
    let ends = 0;
    const painter = createTerrainPainter(fakeLayer(store), () => { ends += 1; });
    painter.begin(2, centre, centre);
    painter.end();
    painter.end();
    expect(ends).toBe(1);
  });

  it('marks painting state for the realtime guard', () => {
    const store = createChunkStore();
    const painter = createTerrainPainter(fakeLayer(store), () => {});
    painter.begin(2, centre, centre);
    expect(useTerrainTool.getState().painting).toBe(true);
    painter.end();
    expect(useTerrainTool.getState().painting).toBe(false);
  });
});
