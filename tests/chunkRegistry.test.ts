import { describe, it, expect } from 'vitest';
import { createChunkRegistry } from '../src/map/terrain/chunkRegistry';
import { createChunkStore } from '../src/map/terrain/chunkStore';
import { chunkKey } from '../src/map/terrain/chunkMath';
import { CHUNK_CELLS } from '../src/map/terrain/constants';

const range = (minCX: number, maxCX: number, minCY: number, maxCY: number) =>
  ({ minCX, maxCX, minCY, maxCY });

describe('chunk registry', () => {
  it('reports every key of a fresh range as missing', () => {
    const registry = createChunkRegistry();
    expect(registry.missing(range(0, 1, 0, 1)).sort())
      .toEqual(['0,0', '0,1', '1,0', '1,1']);
  });

  it('stops reporting keys once they are requested', () => {
    const registry = createChunkRegistry();
    registry.markRequested(registry.missing(range(0, 1, 0, 1)));
    expect(registry.missing(range(0, 1, 0, 1))).toEqual([]);
  });

  it('reports a forgotten key as missing again', () => {
    const registry = createChunkRegistry();
    registry.markRequested(['0,0', '1,0']);
    registry.forget(['0,0']);
    expect(registry.missing(range(0, 1, 0, 0))).toEqual(['0,0']);
  });

  it('only reports keys inside the asked range', () => {
    const registry = createChunkRegistry();
    expect(registry.missing(range(5, 5, 7, 7))).toEqual(['5,7']);
  });
});

// Регрессия на потерю данных: чанк выгружается при отъезде камеры, при
// возврате слой создаёт пустой, и без забывания он никогда не перезагрузится.
describe('eviction keeps the registry honest', () => {
  it('re-requests a chunk that was evicted from the store', () => {
    const store = createChunkStore();
    const registry = createChunkRegistry();
    const visible = range(0, 0, 0, 0);

    // Загрузили чанк с настоящими высотами.
    registry.markRequested(registry.missing(visible));
    store.load(0, 0, new Int16Array(CHUNK_CELLS * CHUNK_CELLS).fill(500));
    expect(registry.missing(visible)).toEqual([]);

    // Камера уехала — чанк выгружен, о нём надо забыть.
    const evicted = store.evictOutside(range(50, 50, 50, 50));
    registry.forget(evicted);

    expect(evicted).toContain(chunkKey(0, 0));
    expect(store.has(0, 0)).toBe(false);
    // Камера вернулась: чанк снова считается незагруженным.
    expect(registry.missing(visible)).toEqual(['0,0']);
  });

  it('never forgets a dirty chunk, because it is never evicted', () => {
    const store = createChunkStore();
    const registry = createChunkRegistry();

    store.ensure(0, 0).heights.fill(300);
    store.markDirty(0, 0);
    registry.markRequested(['0,0']);

    const evicted = store.evictOutside(range(50, 50, 50, 50));
    registry.forget(evicted);

    expect(evicted).toEqual([]);
    expect(store.has(0, 0)).toBe(true);
    expect(registry.has('0,0')).toBe(true);
  });
});
