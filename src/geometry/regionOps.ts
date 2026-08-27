import {
  union, difference, unkinkPolygon, polygon, multiPolygon, featureCollection,
} from '@turf/turf';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import type { PolygonGeometry } from '../data/types';
import { polygonArea } from './measure';

/** Куски мельче этого — мусор булевой операции, а не территория. */
export const MIN_PART_AREA = 4;

type PolyFeature = Feature<Polygon | MultiPolygon>;

const toFeature = (geometry: PolygonGeometry): PolyFeature =>
  geometry.type === 'Polygon'
    ? polygon(geometry.coordinates)
    : multiPolygon(geometry.coordinates);

function fromParts(parts: number[][][][]): PolygonGeometry | null {
  if (parts.length === 0) return null;
  return parts.length === 1
    ? { type: 'Polygon', coordinates: parts[0] }
    : { type: 'MultiPolygon', coordinates: parts };
}

/**
 * Выбрасывает куски-мусор, которые оставляет булева операция.
 * Дырки сохраняются: turf уже вернул корректную геометрию, трогать её кольца
 * нельзя. Именно поэтому здесь НЕ вызывается unkinkPolygon — он раскладывает
 * донат на два независимых полигона и дырка превращается в остров.
 */
export function normalize(geometry: PolygonGeometry): PolygonGeometry | null {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const parts = polygons.filter(
    (rings) => polygonArea({ type: 'Polygon', coordinates: rings }) >= MIN_PART_AREA,
  );
  return fromParts(parts);
}

/**
 * Приводит сырое кольцо к корректной геометрии. Здесь unkinkPolygon уместен:
 * росчерк мышью запросто пересекает сам себя, а дырок у него ещё нет.
 */
export function unkinkAndClean(geometry: PolygonGeometry): PolygonGeometry | null {
  const pieces = unkinkPolygon(toFeature(geometry));
  const parts: number[][][][] = [];
  for (const piece of pieces.features) {
    const coords = piece.geometry.coordinates as number[][][];
    if (polygonArea({ type: 'Polygon', coordinates: coords }) >= MIN_PART_AREA) {
      parts.push(coords);
    }
  }
  return fromParts(parts);
}

export function ringToGeometry(ring: number[][]): PolygonGeometry | null {
  if (ring.length < 4) return null;
  const closed = [...ring];
  const [fx, fy] = closed[0];
  const [lx, ly] = closed[closed.length - 1];
  if (fx !== lx || fy !== ly) closed.push([fx, fy]);
  if (closed.length < 4) return null;
  try {
    return unkinkAndClean({ type: 'Polygon', coordinates: [closed] });
  } catch {
    return null;
  }
}

function unionAll(geometries: PolygonGeometry[]): PolygonGeometry | null {
  if (geometries.length === 0) return null;
  // turf 7 требует минимум две геометрии в коллекции.
  if (geometries.length === 1) return geometries[0];
  const merged = union(featureCollection(geometries.map(toFeature)));
  return merged ? (merged.geometry as PolygonGeometry) : null;
}

/** ТЗ §4.1: регионы не пересекаются — новая область режется по чужим границам. */
export function clipAgainstOthers(
  candidate: PolygonGeometry,
  others: PolygonGeometry[],
): PolygonGeometry | null {
  const obstacle = unionAll(others);
  if (!obstacle) return normalize(candidate);
  const cut = difference(featureCollection([toFeature(candidate), toFeature(obstacle)]));
  return cut ? normalize(cut.geometry as PolygonGeometry) : null;
}

/** ТЗ §4.1: примыкает — сливается, не примыкает — регион становится многочастным. */
export function expandRegion(
  existing: PolygonGeometry, addition: PolygonGeometry,
): PolygonGeometry {
  const merged = union(featureCollection([toFeature(existing), toFeature(addition)]));
  const geometry = merged ? (merged.geometry as PolygonGeometry) : existing;
  return normalize(geometry) ?? geometry;
}

/** ТЗ §4.1: распад на части не создаёт новых регионов. */
export function shrinkRegion(
  existing: PolygonGeometry, cut: PolygonGeometry,
): PolygonGeometry | null {
  const rest = difference(featureCollection([toFeature(existing), toFeature(cut)]));
  return rest ? normalize(rest.geometry as PolygonGeometry) : null;
}

/** inner целиком внутри outer, если после вычитания outer от inner ничего не осталось. */
export function containsGeometry(outer: PolygonGeometry, inner: PolygonGeometry): boolean {
  const rest = difference(featureCollection([toFeature(inner), toFeature(outer)]));
  if (!rest) return true;
  return polygonArea(rest.geometry as PolygonGeometry) < MIN_PART_AREA;
}

export interface NewRegionPlacement {
  geometry: PolygonGeometry;
  /** Заполнено, только если это анклав: в этом регионе надо вырезать дырку. */
  carve: { regionId: string; geometry: PolygonGeometry } | null;
}

/**
 * ТЗ §4.1. Обычный случай — обрезка по чужим границам. Если же нарисованное
 * целиком внутри ровно одного региона, обрезка дала бы пустоту и анклав было
 * бы не создать — поэтому вырезаем в охватывающем регионе дырку.
 */
export function placeNewRegion(
  drawn: PolygonGeometry,
  existing: { id: string; geometry: PolygonGeometry }[],
): NewRegionPlacement | null {
  const clipped = clipAgainstOthers(drawn, existing.map((r) => r.geometry));
  if (clipped) return { geometry: clipped, carve: null };

  const hosts = existing.filter((r) => containsGeometry(r.geometry, drawn));
  if (hosts.length !== 1) return null;

  const host = hosts[0];
  const carved = shrinkRegion(host.geometry, drawn);
  if (!carved) return null;

  const geometry = normalize(drawn);
  if (!geometry) return null;

  return { geometry, carve: { regionId: host.id, geometry: carved } };
}
