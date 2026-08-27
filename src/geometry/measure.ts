import type { PolygonGeometry, LineGeometry } from '../data/types';

export type Bounds = [number, number, number, number];

/** Знаковая площадь кольца по формуле шнурков: положительная против часовой. */
export function ringArea(ring: number[][]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
  }
  return sum / 2;
}

function polygonsOf(geometry: PolygonGeometry): number[][][][] {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

export function polygonArea(geometry: PolygonGeometry): number {
  let total = 0;
  for (const polygon of polygonsOf(geometry)) {
    if (polygon.length === 0) continue;
    total += Math.abs(ringArea(polygon[0]));
    for (let i = 1; i < polygon.length; i++) total -= Math.abs(ringArea(polygon[i]));
  }
  return total;
}

export function polylineLength(coords: number[][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
  }
  return total;
}

export function geometryBBox(geometry: PolygonGeometry | LineGeometry): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const visit = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  if (geometry.type === 'LineString') {
    for (const [x, y] of geometry.coordinates) visit(x, y);
  } else {
    for (const polygon of polygonsOf(geometry)) {
      for (const ring of polygon) for (const [x, y] of ring) visit(x, y);
    }
  }
  return [minX, minY, maxX, maxY];
}

/** Центроид по площади: устойчив для многочастных регионов. */
export function geometryCentroid(geometry: PolygonGeometry): { x: number; y: number } {
  let cx = 0, cy = 0, total = 0;
  for (const polygon of polygonsOf(geometry)) {
    const ring = polygon[0];
    if (!ring || ring.length < 2) continue;
    const area = Math.abs(ringArea(ring));
    let sx = 0, sy = 0;
    for (let i = 0; i < ring.length - 1; i++) { sx += ring[i][0]; sy += ring[i][1]; }
    const n = Math.max(ring.length - 1, 1);
    cx += (sx / n) * area;
    cy += (sy / n) * area;
    total += area;
  }
  if (total === 0) {
    const [minX, minY, maxX, maxY] = geometryBBox(geometry);
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  }
  return { x: cx / total, y: cy / total };
}
