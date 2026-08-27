import { describe, it, expect } from 'vitest';
import { toHalf, fromHalf, floatsToHalfArray } from '../src/map/terrain/half';
import { HEIGHT_MIN, HEIGHT_MAX } from '../src/map/terrain/constants';

describe('float16 encoding', () => {
  it('encodes zero and one to the canonical bit patterns', () => {
    expect(toHalf(0)).toBe(0x0000);
    expect(toHalf(1)).toBe(0x3c00);
    expect(toHalf(-1)).toBe(0xbc00);
  });

  it('round-trips every integer in the terrain height range exactly', () => {
    for (let v = HEIGHT_MIN; v <= HEIGHT_MAX; v++) {
      expect(fromHalf(toHalf(v))).toBe(v);
    }
  });

  it('documents the precision limit just beyond the range', () => {
    expect(fromHalf(toHalf(2049))).not.toBe(2049);
  });

  it('fills a target buffer without allocating', () => {
    const source = new Float32Array([0, 1, -1, 500]);
    const target = new Uint16Array(4);
    floatsToHalfArray(source, target);
    expect(Array.from(target).map(fromHalf)).toEqual([0, 1, -1, 500]);
  });
});
