import { describe, it, expect } from 'vitest';
import { buildChunkTextureData, texIndex } from '../src/map/terrain/apron';
import { createChunkStore } from '../src/map/terrain/chunkStore';
import { TEX_SIZE } from '../src/map/terrain/constants';
import { fromHalf } from '../src/map/terrain/half';
import { cellIndex } from '../src/map/terrain/chunkMath';

const read = (buffer: Uint16Array, col: number, row: number) =>
  fromHalf(buffer[texIndex(col, row)]);

describe('chunk texture data', () => {
  it('places chunk cells in the interior of the texture', () => {
    const store = createChunkStore();
    store.ensure(0, 0).heights[cellIndex(0, 0)] = 42;
    const buffer = new Uint16Array(TEX_SIZE * TEX_SIZE);
    buildChunkTextureData(store, 0, 0, buffer);
    expect(read(buffer, 1, 1)).toBe(42);
  });

  it('fills the apron from the neighbouring chunk', () => {
    const store = createChunkStore();
    store.ensure(0, 0).heights.fill(5);
    store.ensure(-1, 0).heights.fill(9);
    const buffer = new Uint16Array(TEX_SIZE * TEX_SIZE);
    buildChunkTextureData(store, 0, 0, buffer);
    expect(read(buffer, 0, 1)).toBe(9);        // левая колонка фартука
    expect(read(buffer, 1, 1)).toBe(5);
  });

  it('repeats its own edge when the neighbour is not loaded', () => {
    const store = createChunkStore();
    store.ensure(0, 0).heights.fill(5);
    const buffer = new Uint16Array(TEX_SIZE * TEX_SIZE);
    buildChunkTextureData(store, 0, 0, buffer);
    expect(read(buffer, 0, 1)).toBe(5);
    expect(read(buffer, TEX_SIZE - 1, 1)).toBe(5);
  });

  it('fills all four corners of the apron', () => {
    const store = createChunkStore();
    store.ensure(0, 0).heights.fill(1);
    store.ensure(-1, -1).heights.fill(7);
    const buffer = new Uint16Array(TEX_SIZE * TEX_SIZE);
    buildChunkTextureData(store, 0, 0, buffer);
    expect(read(buffer, 0, 0)).toBe(7);
  });

  it('writes every texel', () => {
    const store = createChunkStore();
    store.ensure(0, 0).heights.fill(3);
    const buffer = new Uint16Array(TEX_SIZE * TEX_SIZE).fill(0xffff);
    buildChunkTextureData(store, 0, 0, buffer);
    expect(buffer.every((v) => v !== 0xffff)).toBe(true);
  });
});
