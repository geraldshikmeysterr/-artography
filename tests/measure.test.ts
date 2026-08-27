import { describe, it, expect } from 'vitest';
import {
  ringArea, polygonArea, polylineLength, geometryBBox, geometryCentroid,
} from '../src/geometry/measure';

const square = (x: number, y: number, s: number) => [
  [x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y],
];

describe('measure', () => {
  it('computes signed ring area, positive for counter-clockwise input', () => {
    expect(ringArea(square(0, 0, 10))).toBeCloseTo(100, 9);
    expect(ringArea([...square(0, 0, 10)].reverse())).toBeCloseTo(-100, 9);
  });

  it('subtracts holes from polygon area', () => {
    const geometry = { type: 'Polygon' as const, coordinates: [square(0, 0, 10), square(2, 2, 4)] };
    expect(polygonArea(geometry)).toBeCloseTo(100 - 16, 9);
  });

  it('sums parts of a multipolygon', () => {
    const geometry = {
      type: 'MultiPolygon' as const,
      coordinates: [[square(0, 0, 10)], [square(100, 0, 5)]],
    };
    expect(polygonArea(geometry)).toBeCloseTo(125, 9);
  });

  it('measures polyline length', () => {
    expect(polylineLength([[0, 0], [3, 4], [3, 10]])).toBeCloseTo(11, 9);
  });

  it('computes a bounding box over all parts', () => {
    const geometry = {
      type: 'MultiPolygon' as const,
      coordinates: [[square(0, 0, 10)], [square(-5, 20, 5)]],
    };
    expect(geometryBBox(geometry)).toEqual([-5, 0, 10, 25]);
  });

  it('computes a bounding box for a line', () => {
    expect(geometryBBox({ type: 'LineString', coordinates: [[0, 0], [10, -4]] }))
      .toEqual([0, -4, 10, 0]);
  });

  it('computes an area-weighted centroid', () => {
    const geometry = { type: 'Polygon' as const, coordinates: [square(0, 0, 10)] };
    const c = geometryCentroid(geometry);
    expect(c.x).toBeCloseTo(5, 6);
    expect(c.y).toBeCloseTo(5, 6);
  });

  it('places the centroid of two equal squares between them', () => {
    const geometry = {
      type: 'MultiPolygon' as const,
      coordinates: [[square(0, 0, 10)], [square(100, 0, 10)]],
    };
    expect(geometryCentroid(geometry).x).toBeCloseTo(55, 6);
  });
});
