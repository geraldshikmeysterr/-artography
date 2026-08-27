// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { bytesToBase64, base64ToBytes } from '../src/data/base64';
import { CHUNK_CELLS } from '../src/map/terrain/constants';

describe('base64', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 128, 64]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it('round-trips a full chunk payload', () => {
    const bytes = new Uint8Array(CHUNK_CELLS * CHUNK_CELLS * 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) & 0xff;
    const restored = base64ToBytes(bytesToBase64(bytes));
    expect(restored).toHaveLength(bytes.length);
    expect(restored[8191]).toBe(bytes[8191]);
  });

  it('handles an empty array', () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe('');
    expect(base64ToBytes('')).toHaveLength(0);
  });
});
