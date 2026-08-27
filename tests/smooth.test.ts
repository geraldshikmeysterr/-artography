import { describe, it, expect } from 'vitest';
import { dedupe, chaikin, smoothStroke, closeStrokeToRing } from '../src/geometry/smooth';

describe('dedupe', () => {
  it('drops points closer than the threshold', () => {
    expect(dedupe([[0, 0], [0.5, 0], [5, 0], [5.2, 0], [10, 0]], 1))
      .toEqual([[0, 0], [5, 0], [10, 0]]);
  });

  it('always keeps the first point', () => {
    expect(dedupe([[3, 3]], 1)).toEqual([[3, 3]]);
  });

  it('returns nothing for an empty input', () => {
    expect(dedupe([], 1)).toEqual([]);
  });
});

describe('chaikin', () => {
  it('replaces each interior corner with two cut points', () => {
    const result = chaikin([[0, 0], [10, 0], [10, 10]], 1, false);
    expect(result[0]).toEqual([0, 0]);
    expect(result[result.length - 1]).toEqual([10, 10]);
    expect(result).toContainEqual([2.5, 0]);
    expect(result).toContainEqual([7.5, 0]);
  });

  it('keeps a closed ring closed', () => {
    const ring = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    const result = chaikin(ring, 2, true);
    expect(result[0]).toEqual(result[result.length - 1]);
  });

  it('never grows a two-point line', () => {
    expect(chaikin([[0, 0], [1, 1]], 3, false)).toEqual([[0, 0], [1, 1]]);
  });
});

describe('closeStrokeToRing', () => {
  it('returns a closed ring of at least four points', () => {
    const stroke = [[0, 0], [20, 1], [21, 20], [1, 19], [1, 4]];
    const ring = closeStrokeToRing(stroke, 1)!;
    expect(ring).not.toBeNull();
    expect(ring.length).toBeGreaterThanOrEqual(4);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('rejects a stroke too short to enclose anything', () => {
    expect(closeStrokeToRing([[0, 0], [1, 0]], 1)).toBeNull();
  });
});

describe('smoothStroke', () => {
  it('keeps endpoints and does not close the line', () => {
    const result = smoothStroke([[0, 0], [50, 5], [100, 0]], 1);
    expect(result[0]).toEqual([0, 0]);
    expect(result[result.length - 1]).toEqual([100, 0]);
    expect(result[0]).not.toEqual(result[result.length - 1]);
  });

  it('survives a single-point stroke', () => {
    expect(smoothStroke([[4, 4]], 1)).toEqual([[4, 4]]);
  });
});
