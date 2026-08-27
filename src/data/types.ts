import type { Polygon, MultiPolygon, LineString } from 'geojson';

export type IconType =
  | 'capital' | 'city' | 'village' | 'fortress' | 'dungeon' | 'cave' | 'resource';

export type RoadType = 'major' | 'minor';

/** Геометрия в плоских мировых координатах, не в градусах. */
export type PolygonGeometry = Polygon | MultiPolygon;
export type LineGeometry = LineString;

export interface RegionEntity {
  id: string;
  name: string;
  geometry: PolygonGeometry;
  stateId: string | null;
  culturalRegionId: string | null;
}

export interface StateEntity {
  id: string;
  name: string;
  color: string;
  discordPostId: string | null;
}

export interface CulturalRegionEntity {
  id: string;
  name: string;
  color: string;
  discordPostId: string | null;
}

export interface PointEntity {
  id: string;
  name: string;
  iconType: IconType;
  x: number;
  y: number;
  discordPostId: string | null;
}

export interface RoadEntity {
  id: string;
  name: string | null;
  roadType: RoadType;
  geometry: LineGeometry;
}

export type MapEntity =
  | RegionEntity | StateEntity | CulturalRegionEntity | PointEntity | RoadEntity;

export type EntityKind = 'region' | 'state' | 'cultural' | 'point' | 'road';

export interface Selection { kind: EntityKind; id: string }
