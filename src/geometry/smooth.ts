import { simplify, lineString } from '@turf/turf';
import { polylineLength } from './measure';

/** Выкидывает точки ближе minDistance к предыдущей оставленной. */
export function dedupe(points: number[][], minDistance: number): number[][] {
  if (points.length === 0) return [];
  const result = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const last = result[result.length - 1];
    if (Math.hypot(points[i][0] - last[0], points[i][1] - last[1]) >= minDistance) {
      result.push(points[i]);
    }
  }
  return result;
}

/** Сглаживание Чайкина: каждый угол заменяется двумя точками среза. */
export function chaikin(points: number[][], iterations: number, closed: boolean): number[][] {
  let current = points;
  for (let pass = 0; pass < iterations; pass++) {
    if (current.length < 3) return current;
    const next: number[][] = [];
    const open = closed ? current.slice(0, -1) : current;

    if (!closed) next.push(open[0]);
    const segments = closed ? open.length : open.length - 1;
    for (let i = 0; i < segments; i++) {
      const a = open[i];
      const b = open[(i + 1) % open.length];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (!closed) next.push(open[open.length - 1]);
    else next.push(next[0]);

    current = next;
  }
  return current;
}

function simplifyPlanar(points: number[][], tolerance: number): number[][] {
  if (points.length < 3) return points;
  const simplified = simplify(lineString(points), { tolerance, highQuality: false, mutate: false });
  return simplified.geometry.coordinates as number[][];
}

/**
 * Конвейер для незамкнутой линии (дорога). Допуск упрощения ~1.5 экранного
 * пикселя на любом зуме — сглаживание умеренное, деталей не теряет (ТЗ §4.1).
 */
export function smoothStroke(points: number[][], zoom: number): number[][] {
  const cleaned = dedupe(points, 2 / zoom);
  if (cleaned.length < 2) return cleaned;
  return chaikin(simplifyPlanar(cleaned, 1.5 / zoom), 2, false);
}

/** Конвейер для региона: автозамыкание контура в кольцо (ТЗ §4.1). */
export function closeStrokeToRing(points: number[][], zoom: number): number[][] | null {
  const cleaned = dedupe(points, 2 / zoom);
  if (cleaned.length < 3 || polylineLength(cleaned) < 12 / zoom) return null;

  const ring = [...cleaned];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);

  const simplified = simplifyPlanar(ring, 1.5 / zoom);
  if (simplified.length < 4) return null;

  const smoothed = chaikin(simplified, 2, true);
  return smoothed.length >= 4 ? smoothed : null;
}
