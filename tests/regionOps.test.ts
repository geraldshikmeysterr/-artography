import { describe, it, expect } from 'vitest';
import {
  ringToGeometry, clipAgainstOthers, expandRegion, shrinkRegion,
  containsGeometry, placeNewRegion,
} from '../src/geometry/regionOps';
import { polygonArea } from '../src/geometry/measure';
import type { PolygonGeometry } from '../src/data/types';

const box = (x0: number, y0: number, x1: number, y1: number): PolygonGeometry => ({
  type: 'Polygon',
  coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
});

describe('ringToGeometry', () => {
  it('builds a polygon from a closed ring', () => {
    const geometry = ringToGeometry([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]])!;
    expect(polygonArea(geometry)).toBeCloseTo(100, 6);
  });

  it('rejects a degenerate ring', () => {
    expect(ringToGeometry([[0, 0], [1, 0], [0, 0]])).toBeNull();
  });
});

describe('clipAgainstOthers — умные границы', () => {
  it('cuts the overlap out of the new area', () => {
    const clipped = clipAgainstOthers(box(0, 0, 10, 10), [box(5, 0, 15, 10)])!;
    expect(polygonArea(clipped)).toBeCloseTo(50, 6);
  });

  it('leaves a non-overlapping area untouched', () => {
    const clipped = clipAgainstOthers(box(0, 0, 10, 10), [box(100, 100, 110, 110)])!;
    expect(polygonArea(clipped)).toBeCloseTo(100, 6);
  });

  it('returns null when the new area is fully covered', () => {
    expect(clipAgainstOthers(box(2, 2, 4, 4), [box(0, 0, 10, 10)])).toBeNull();
  });

  it('keeps the full area when only touching a neighbour along an edge', () => {
    const clipped = clipAgainstOthers(box(0, 0, 10, 10), [box(10, 0, 20, 10)])!;
    expect(polygonArea(clipped)).toBeCloseTo(100, 6);
    // Общая граница проходит ровно по x = 10 — щели между регионами нет.
    const values = (JSON.stringify(clipped).match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    expect(Math.max(...values)).toBeCloseTo(10, 6);
  });
});

describe('expandRegion', () => {
  it('merges an adjoining area into one polygon', () => {
    const result = expandRegion(box(0, 0, 10, 10), box(10, 0, 20, 10));
    expect(result.type).toBe('Polygon');
    expect(polygonArea(result)).toBeCloseTo(200, 6);
  });

  it('keeps a detached island as a second part of the same region', () => {
    const result = expandRegion(box(0, 0, 10, 10), box(100, 100, 110, 110));
    expect(result.type).toBe('MultiPolygon');
    expect(polygonArea(result)).toBeCloseTo(200, 6);
  });
});

describe('shrinkRegion', () => {
  it('cuts a piece out', () => {
    const result = shrinkRegion(box(0, 0, 10, 10), box(0, 0, 10, 4))!;
    expect(polygonArea(result)).toBeCloseTo(60, 6);
  });

  it('keeps a region that split in two as a single multipart region', () => {
    const result = shrinkRegion(box(0, 0, 30, 10), box(10, -1, 20, 11))!;
    expect(result.type).toBe('MultiPolygon');
    expect(polygonArea(result)).toBeCloseTo(200, 6);
  });

  it('returns null when everything is cut away', () => {
    expect(shrinkRegion(box(2, 2, 4, 4), box(0, 0, 10, 10))).toBeNull();
  });

  // Регрессия: unkinkPolygon раскладывал донат на два независимых полигона,
  // и дырка превращалась в остров — площадь складывалась вместо вычитания.
  it('preserves a hole instead of turning it into an island', () => {
    const donut = shrinkRegion(box(0, 0, 100, 100), box(40, 40, 60, 60))!;
    expect(donut.type).toBe('Polygon');
    expect(donut.coordinates as number[][][]).toHaveLength(2);
    expect(polygonArea(donut)).toBeCloseTo(9600, 6);
  });
});

describe('containsGeometry', () => {
  it('detects full containment', () => {
    expect(containsGeometry(box(0, 0, 100, 100), box(40, 40, 60, 60))).toBe(true);
  });
  it('rejects partial overlap', () => {
    expect(containsGeometry(box(0, 0, 100, 100), box(90, 90, 110, 110))).toBe(false);
  });
});

describe('placeNewRegion — правило анклава', () => {
  it('clips normally when the drawing overlaps a neighbour partially', () => {
    const placement = placeNewRegion(box(0, 0, 10, 10), [{ id: 'a', geometry: box(5, 0, 15, 10) }])!;
    expect(placement.carve).toBeNull();
    expect(polygonArea(placement.geometry)).toBeCloseTo(50, 6);
  });

  it('carves a hole when the drawing lies entirely inside exactly one region', () => {
    const placement = placeNewRegion(
      box(40, 40, 60, 60), [{ id: 'outer', geometry: box(0, 0, 100, 100) }],
    )!;
    expect(placement.carve).not.toBeNull();
    expect(placement.carve!.regionId).toBe('outer');
    expect(polygonArea(placement.geometry)).toBeCloseTo(400, 6);
    expect(polygonArea(placement.carve!.geometry)).toBeCloseTo(10000 - 400, 6);
  });

  it('returns null when no single region encloses the drawing', () => {
    expect(placeNewRegion(box(40, 40, 60, 60), [
      { id: 'a', geometry: box(0, 0, 50, 100) },
      { id: 'b', geometry: box(50, 0, 100, 100) },
    ])).toBeNull();
  });

  it('creates a plain region when nothing else exists', () => {
    const placement = placeNewRegion(box(0, 0, 10, 10), [])!;
    expect(placement.carve).toBeNull();
    expect(polygonArea(placement.geometry)).toBeCloseTo(100, 6);
  });
});
