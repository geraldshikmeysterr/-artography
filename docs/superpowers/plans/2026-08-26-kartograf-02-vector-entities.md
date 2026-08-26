# Картограф — План 02: Векторные сущности Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Полный векторный редактор карты: регионы с умными границами и расширением/уменьшением, государства, культурные регионы, три режима отображения, точечные объекты, дороги, панели и модальные формы, поиск с долётом камеры.

**Architecture:** Вся геометрия — GeoJSON в плоских мировых координатах, операции через turf.js (polyclip). Геометрические функции вынесены в чистый модуль `src/geometry/` и покрыты юнит-тестами без Pixi и без сети. Сущности живут в отдельном Zustand-слайсе (`src/state/entities.ts`), который наполняется из Supabase через тонкий репозиторий (`src/data/repository.ts`). Pixi-слои — «тупые» рендереры: подписываются на слайс и перерисовывают `Graphics`. Инструменты рисования — конечный автомат на pointer-событиях (`src/map/tools/`), левая кнопка принадлежит только им.

**Tech Stack:** `@turf/turf` 7, PixiJS 8, Zustand 5, React 19, Vitest 3.

**Spec:** [`docs/KARTOGRAF_SPEC.md`](../../KARTOGRAF_SPEC.md) — разделы 3, 4, 6, 7 (без мостов), 9, 10, 14 (пункты 3–6, 10).

**Предшествует:** План 01 должен быть выполнен полностью.

---

## Global Constraints

- Регионы **не могут пересекаться**. Новая область автоматически обрезается по границам существующих; общая граница — единая, без щелей и нахлёстов. (ТЗ §4.1)
- Регион может состоять из нескольких полигонов (архипелаг) и содержать анклав другого региона — это свойство геометрии, отдельных режимов не требует. (ТЗ §4.1)
- **Правило анклава.** «Не пересекаются» и «регион может быть целиком внутри другого» из ТЗ §4.1 совместимы только одним способом: у охватывающего региона появляется дырка. Поэтому если нарисованная область целиком лежит внутри **ровно одного** существующего региона, редактор автоматически вырезает в нём отверстие и создаёт в нём новый регион — анклав получается одним жестом. Во всех остальных случаях работает обычная обрезка. Без этого правила рисование внутри существующего региона давало бы пустоту, и анклав нельзя было бы создать вообще.
- У обычного региона **нет** своего цвета и **нет** Discord-поста. (ТЗ §4.1)
- Регион принадлежит максимум одному государству и максимум одному культурному региону. (ТЗ §4.2, §4.3)
- Ровно шесть инструментов в панели, в этом порядке: **Новый регион · Новый объект · Новое государство · Культурный регион · Рельеф (кисть) · Дорога**. Ничего лишнего. (ТЗ §10)
- Инструмент «Дорога» переключает крупная/малая по повторному клику, с визуальным индикатором — точки рядом с текстом. (ТЗ §10)
- Три режима отображения: Государства · Культурные регионы · Регионы. Точечные объекты, дороги, мосты и рельеф видны во всех трёх одинаково. (ТЗ §4.4)
- Клик-выбор объекта работает всегда, независимо от активного инструмента; отдельного режима «Обзор» нет. (ТЗ §10)
- Никаких `prompt()`/`alert()`/`confirm()` — только встроенные модальные формы. (ТЗ §10)
- Типы точечных объектов ровно эти семь: `capital`, `city`, `village`, `fortress`, `dungeon`, `cave`, `resource`. Иконки — векторные, без внешних картинок. (ТЗ §6)
- Дороги двух типов: `major` (крупная) и `minor` (малая), визуально различимы толщиной и цветом. (ТЗ §7)
- Все изменения пишутся в Supabase сразу, без ручного сохранения. (ТЗ §11)

**Ловушка turf 7:** `union`, `difference`, `intersect` принимают **FeatureCollection**, а не два аргумента: `union(featureCollection([a, b]))`. Функции `area` и `length` в turf геодезические — для плоских мировых координат использовать собственные `polygonArea` и `polylineLength` из `src/geometry/measure.ts`.

---

## File Structure

```
src/
├─ data/
│  ├─ types.ts             Типы сущностей + маппинг строк БД ↔ доменных объектов
│  └─ repository.ts        CRUD-обёртки над Supabase для всех пяти сущностей
├─ state/
│  └─ entities.ts          Zustand-слайс: карты сущностей, selection, loadAll()
├─ geometry/
│  ├─ measure.ts           Плоские площадь/длина/bbox/центроид (юнит-тесты)
│  ├─ smooth.ts            Чайкин + упрощение + автозамыкание (юнит-тесты)
│  └─ regionOps.ts         Умные границы, расширить, уменьшить (юнит-тесты)
├─ map/
│  ├─ hitTest.ts           Поиск сущности под курсором в мировых координатах
│  ├─ regionsLayer.ts      Заливки/границы регионов + подписи
│  ├─ roadsLayer.ts        Линии дорог двух типов
│  ├─ pointsLayer.ts       Иконки, LOD, подписи, перетаскивание
│  ├─ colors.ts            regionFill(): цвет региона в текущем режиме
│  ├─ icons.ts             Векторная отрисовка семи типов иконок
│  └─ tools/
│     ├─ freehand.ts       Захват мышиного росчерка в мировой полилинии
│     ├─ regionTool.ts     Новый регион / расширить / уменьшить
│     ├─ pointTool.ts      Постановка и перетаскивание точечных объектов
│     └─ roadTool.ts       Рисование дороги
└─ ui/
   ├─ Modal.tsx            Базовое модальное окно + поля формы
   ├─ Toolbar.tsx          Шесть инструментов, индикатор типа дороги
   ├─ ModeSwitch.tsx       Три режима отображения
   ├─ ObjectPanel.tsx      Контекстные действия выбранного объекта
   └─ SearchBox.tsx        Поиск по названию + долёт камеры
tests/
├─ measure.test.ts  smooth.test.ts  regionOps.test.ts
├─ colors.test.ts   hitTest.test.ts  repository.test.ts
```

---

## Task 1: Типы сущностей и репозиторий Supabase

**Files:**
- Create: `src/data/types.ts`, `src/data/repository.ts`
- Test: `tests/repository.test.ts`

**Interfaces:**
- Consumes: `getSupabase()` из `src/data/supabase.ts`; `ENV.mapId`.
- Produces:

```ts
export type IconType = 'capital'|'city'|'village'|'fortress'|'dungeon'|'cave'|'resource';
export type RoadType = 'major' | 'minor';
export type PolygonGeometry = GeoJSON.Polygon | GeoJSON.MultiPolygon;

export interface RegionEntity { id: string; name: string; geometry: PolygonGeometry;
  stateId: string | null; culturalRegionId: string | null }
export interface StateEntity { id: string; name: string; color: string; discordPostId: string | null }
export interface CulturalRegionEntity { id: string; name: string; color: string; discordPostId: string | null }
export interface PointEntity { id: string; name: string; iconType: IconType; x: number; y: number;
  discordPostId: string | null }
export interface RoadEntity { id: string; name: string | null; roadType: RoadType;
  geometry: GeoJSON.LineString }
export type MapEntity = RegionEntity | StateEntity | CulturalRegionEntity | PointEntity | RoadEntity;
export type EntityKind = 'region' | 'state' | 'cultural' | 'point' | 'road';
export interface Selection { kind: EntityKind; id: string }
```

- `repository.loadAll(): Promise<{ regions, states, culturalRegions, points, roads, seaLevel }>`
- `repository.createRegion(input: { name: string; geometry: PolygonGeometry }): Promise<RegionEntity>`
- `repository.updateRegion(id: string, patch: Partial<Pick<RegionEntity,'name'|'geometry'|'stateId'|'culturalRegionId'>>): Promise<void>`
- `repository.deleteRegion(id: string): Promise<void>`
- аналогичные тройки `createState/updateState/deleteState`,
  `createCulturalRegion/updateCulturalRegion/deleteCulturalRegion`,
  `createPoint/updatePoint/deletePoint`, `createRoad/updateRoad/deleteRoad`
- `repository.setSeaLevel(value: number): Promise<void>`
- Мапперы `rowToRegion(row)`, `rowToPoint(row)` и т.д. экспортируются отдельно
  — их использует Realtime в Плане 04.

- [ ] **Шаг 1: Написать падающий тест на мапперы**

`tests/repository.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rowToRegion, rowToPoint, rowToRoad, rowToState } from '../src/data/repository';

describe('row mappers', () => {
  it('maps a region row to camelCase domain object', () => {
    const region = rowToRegion({
      id: 'r1', name: 'Долина', geometry: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,0]]] },
      state_id: 's1', cultural_region_id: null,
    });
    expect(region).toEqual({
      id: 'r1', name: 'Долина',
      geometry: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,0]]] },
      stateId: 's1', culturalRegionId: null,
    });
  });

  it('maps a point row', () => {
    expect(rowToPoint({ id: 'p1', name: 'Столица', icon_type: 'capital', x: 10, y: -4, discord_post_id: '99' }))
      .toEqual({ id: 'p1', name: 'Столица', iconType: 'capital', x: 10, y: -4, discordPostId: '99' });
  });

  it('maps a road row', () => {
    expect(rowToRoad({ id: 'd1', name: null, road_type: 'minor',
      geometry: { type: 'LineString', coordinates: [[0,0],[5,5]] } }))
      .toEqual({ id: 'd1', name: null, roadType: 'minor',
        geometry: { type: 'LineString', coordinates: [[0,0],[5,5]] } });
  });

  it('maps a state row', () => {
    expect(rowToState({ id: 's1', name: 'Аркадия', color: '#8ab4f8', discord_post_id: null }))
      .toEqual({ id: 's1', name: 'Аркадия', color: '#8ab4f8', discordPostId: null });
  });
});
```

- [ ] **Шаг 2: Прогнать тест — падает**

Run: `npm test -- tests/repository.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать `src/data/types.ts`**

Содержимое — блок типов из раздела **Interfaces** выше, дословно.

- [ ] **Шаг 4: Реализовать `src/data/repository.ts`**

```ts
import { getSupabase } from './supabase';
import { ENV } from '../env';
import type {
  RegionEntity, StateEntity, CulturalRegionEntity, PointEntity, RoadEntity,
  PolygonGeometry, IconType, RoadType,
} from './types';

type Row = Record<string, any>;

export const rowToRegion = (r: Row): RegionEntity => ({
  id: r.id, name: r.name, geometry: r.geometry as PolygonGeometry,
  stateId: r.state_id ?? null, culturalRegionId: r.cultural_region_id ?? null,
});
export const rowToState = (r: Row): StateEntity => ({
  id: r.id, name: r.name, color: r.color, discordPostId: r.discord_post_id ?? null,
});
export const rowToCultural = (r: Row): CulturalRegionEntity => rowToState(r);
export const rowToPoint = (r: Row): PointEntity => ({
  id: r.id, name: r.name, iconType: r.icon_type as IconType,
  x: r.x, y: r.y, discordPostId: r.discord_post_id ?? null,
});
export const rowToRoad = (r: Row): RoadEntity => ({
  id: r.id, name: r.name ?? null, roadType: r.road_type as RoadType,
  geometry: r.geometry as GeoJSON.LineString,
});

const db = () => getSupabase();
const mapFilter = () => ({ map_id: ENV.mapId });

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export async function loadAll() {
  const [regions, states, culturalRegions, points, roads, maps] = await Promise.all([
    db().from('regions').select('*').eq('map_id', ENV.mapId),
    db().from('states').select('*').eq('map_id', ENV.mapId),
    db().from('cultural_regions').select('*').eq('map_id', ENV.mapId),
    db().from('point_objects').select('*').eq('map_id', ENV.mapId),
    db().from('roads').select('*').eq('map_id', ENV.mapId),
    db().from('maps').select('sea_level').eq('id', ENV.mapId).single(),
  ]);
  return {
    regions: unwrap(regions).map(rowToRegion),
    states: unwrap(states).map(rowToState),
    culturalRegions: unwrap(culturalRegions).map(rowToCultural),
    points: unwrap(points).map(rowToPoint),
    roads: unwrap(roads).map(rowToRoad),
    seaLevel: unwrap(maps).sea_level as number,
  };
}

export async function createRegion(input: { name: string; geometry: PolygonGeometry }) {
  const result = await db().from('regions')
    .insert({ ...mapFilter(), name: input.name, geometry: input.geometry })
    .select().single();
  return rowToRegion(unwrap(result));
}

export async function updateRegion(
  id: string,
  patch: Partial<Pick<RegionEntity, 'name' | 'geometry' | 'stateId' | 'culturalRegionId'>>,
) {
  const row: Row = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.geometry !== undefined) row.geometry = patch.geometry;
  if (patch.stateId !== undefined) row.state_id = patch.stateId;
  if (patch.culturalRegionId !== undefined) row.cultural_region_id = patch.culturalRegionId;
  unwrap(await db().from('regions').update(row).eq('id', id).select('id'));
}

export async function deleteRegion(id: string) {
  unwrap(await db().from('regions').delete().eq('id', id).select('id'));
}

export async function createState(input: { name: string; color: string; discordPostId: string | null }) {
  const result = await db().from('states')
    .insert({ ...mapFilter(), name: input.name, color: input.color, discord_post_id: input.discordPostId })
    .select().single();
  return rowToState(unwrap(result));
}

export async function updateState(id: string, patch: Partial<Omit<StateEntity, 'id'>>) {
  const row: Row = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.discordPostId !== undefined) row.discord_post_id = patch.discordPostId;
  unwrap(await db().from('states').update(row).eq('id', id).select('id'));
}

export async function deleteState(id: string) {
  unwrap(await db().from('states').delete().eq('id', id).select('id'));
}

export async function createCulturalRegion(input: { name: string; color: string; discordPostId: string | null }) {
  const result = await db().from('cultural_regions')
    .insert({ ...mapFilter(), name: input.name, color: input.color, discord_post_id: input.discordPostId })
    .select().single();
  return rowToCultural(unwrap(result));
}

export async function updateCulturalRegion(id: string, patch: Partial<Omit<CulturalRegionEntity, 'id'>>) {
  const row: Row = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.discordPostId !== undefined) row.discord_post_id = patch.discordPostId;
  unwrap(await db().from('cultural_regions').update(row).eq('id', id).select('id'));
}

export async function deleteCulturalRegion(id: string) {
  unwrap(await db().from('cultural_regions').delete().eq('id', id).select('id'));
}

export async function createPoint(input: { name: string; iconType: IconType; x: number; y: number; discordPostId: string | null }) {
  const result = await db().from('point_objects')
    .insert({ ...mapFilter(), name: input.name, icon_type: input.iconType,
              x: input.x, y: input.y, discord_post_id: input.discordPostId })
    .select().single();
  return rowToPoint(unwrap(result));
}

export async function updatePoint(id: string, patch: Partial<Omit<PointEntity, 'id'>>) {
  const row: Row = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.iconType !== undefined) row.icon_type = patch.iconType;
  if (patch.x !== undefined) row.x = patch.x;
  if (patch.y !== undefined) row.y = patch.y;
  if (patch.discordPostId !== undefined) row.discord_post_id = patch.discordPostId;
  unwrap(await db().from('point_objects').update(row).eq('id', id).select('id'));
}

export async function deletePoint(id: string) {
  unwrap(await db().from('point_objects').delete().eq('id', id).select('id'));
}

export async function createRoad(input: { name: string | null; roadType: RoadType; geometry: GeoJSON.LineString }) {
  const result = await db().from('roads')
    .insert({ ...mapFilter(), name: input.name, road_type: input.roadType, geometry: input.geometry })
    .select().single();
  return rowToRoad(unwrap(result));
}

export async function updateRoad(id: string, patch: Partial<Omit<RoadEntity, 'id'>>) {
  const row: Row = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.roadType !== undefined) row.road_type = patch.roadType;
  if (patch.geometry !== undefined) row.geometry = patch.geometry;
  unwrap(await db().from('roads').update(row).eq('id', id).select('id'));
}

export async function deleteRoad(id: string) {
  unwrap(await db().from('roads').delete().eq('id', id).select('id'));
}

export async function setSeaLevel(value: number) {
  unwrap(await db().from('maps').update({ sea_level: value }).eq('id', ENV.mapId).select('id'));
}
```

- [ ] **Шаг 5: Прогнать тест — проходит**

Run: `npm test -- tests/repository.test.ts`
Expected: PASS, 4 теста.

- [ ] **Шаг 6: Коммит**

```bash
git add src/data tests/repository.test.ts
git commit -m "feat: entity types and Supabase repository for map entities"
```

---

## Task 2: Плоская геометрия — измерения

**Files:**
- Create: `src/geometry/measure.ts`
- Test: `tests/measure.test.ts`

**Interfaces:**
- Consumes: `PolygonGeometry` из `src/data/types.ts`.
- Produces:
  - `ringArea(ring: number[][]): number` — знаковая площадь по формуле шнурков.
  - `polygonArea(geometry: PolygonGeometry): number` — сумма внешних колец минус дырки, всегда ≥ 0.
  - `polylineLength(coords: number[][]): number`
  - `geometryBBox(geometry: PolygonGeometry | GeoJSON.LineString): [number,number,number,number]`
  - `geometryCentroid(geometry: PolygonGeometry): { x: number; y: number }` — центроид по площади, устойчив для мультиполигонов.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/measure.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ringArea, polygonArea, polylineLength, geometryBBox, geometryCentroid } from '../src/geometry/measure';

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
```

- [ ] **Шаг 2: Прогнать — падает**

Run: `npm test -- tests/measure.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать `src/geometry/measure.ts`**

```ts
import type { PolygonGeometry } from '../data/types';

export type Bounds = [number, number, number, number];

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

export function geometryBBox(geometry: PolygonGeometry | GeoJSON.LineString): Bounds {
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

export function geometryCentroid(geometry: PolygonGeometry): { x: number; y: number } {
  let cx = 0, cy = 0, total = 0;
  for (const polygon of polygonsOf(geometry)) {
    const ring = polygon[0];
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
```

- [ ] **Шаг 4: Прогнать — проходит**

Run: `npm test -- tests/measure.test.ts`
Expected: PASS, 7 тестов.

- [ ] **Шаг 5: Коммит**

```bash
git add src/geometry/measure.ts tests/measure.test.ts
git commit -m "feat: planar geometry measurements for world-space GeoJSON"
```

---

## Task 3: Сглаживание и замыкание росчерка

**Files:**
- Create: `src/geometry/smooth.ts`
- Test: `tests/smooth.test.ts`

**Interfaces:**
- Consumes: `polylineLength` из `measure.ts`; `simplify` из `@turf/turf`.
- Produces:
  - `dedupe(points: number[][], minDistance: number): number[][]` — выкидывает точки ближе `minDistance` к предыдущей.
  - `chaikin(points: number[][], iterations: number, closed: boolean): number[][]` — сглаживание срезанием углов.
  - `smoothStroke(points: number[][], zoom: number): number[][]` — конвейер для незамкнутой линии (дорога): dedupe → simplify → chaikin(2, false).
  - `closeStrokeToRing(points: number[][], zoom: number): number[][] | null` — конвейер для региона: dedupe → автозамыкание → simplify → chaikin(2, true) → гарантированно замкнутое кольцо ≥ 4 точек; `null`, если росчерк слишком короткий.

Сглаживание «умеренное — деталей не теряет» (ТЗ §4.1): два прохода Чайкина
и допуск упрощения `1.5 / zoom` мировых единиц, то есть примерно 1.5 экранных
пикселя на любом зуме.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/smooth.test.ts`:

```ts
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
});
```

- [ ] **Шаг 2: Прогнать — падает**

Run: `npm test -- tests/smooth.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать `src/geometry/smooth.ts`**

```ts
import { simplify, lineString } from '@turf/turf';
import { polylineLength } from './measure';

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

export function smoothStroke(points: number[][], zoom: number): number[][] {
  const cleaned = dedupe(points, 2 / zoom);
  if (cleaned.length < 2) return cleaned;
  return chaikin(simplifyPlanar(cleaned, 1.5 / zoom), 2, false);
}

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
```

- [ ] **Шаг 4: Прогнать — проходит**

Run: `npm test -- tests/smooth.test.ts`
Expected: PASS, 8 тестов.

- [ ] **Шаг 5: Коммит**

```bash
git add src/geometry/smooth.ts tests/smooth.test.ts
git commit -m "feat: Chaikin smoothing, simplification and stroke auto-closing"
```

---

## Task 4: Умные границы, расширение и уменьшение региона

**Files:**
- Create: `src/geometry/regionOps.ts`
- Test: `tests/regionOps.test.ts`

**Interfaces:**
- Consumes: `polygonArea` из `measure.ts`; `union`, `difference`, `unkinkPolygon`, `polygon`, `multiPolygon`, `featureCollection` из `@turf/turf`.
- Produces:
  - `MIN_PART_AREA = 4` — мировые единицы², куски меньше считаются мусором клиппинга.
  - `ringToGeometry(ring: number[][]): PolygonGeometry | null` — кольцо → полигон, самопересечения разрезаются `unkinkPolygon`, мусорные куски отбрасываются.
  - `clipAgainstOthers(candidate: PolygonGeometry, others: PolygonGeometry[]): PolygonGeometry | null` — умные границы (ТЗ §4.1): вычитает объединение всех прочих регионов.
  - `expandRegion(existing: PolygonGeometry, addition: PolygonGeometry): PolygonGeometry` — объединение; несоприкасающиеся части дают MultiPolygon (ТЗ §4.1, архипелаг).
  - `shrinkRegion(existing: PolygonGeometry, cut: PolygonGeometry): PolygonGeometry | null` — вычитание; распад на части остаётся одним регионом; `null`, если вырезали всё.
  - `normalize(geometry: PolygonGeometry): PolygonGeometry | null` — общий пост-обработчик: unkink + отбрасывание кусков < `MIN_PART_AREA`.
  - `containsGeometry(outer: PolygonGeometry, inner: PolygonGeometry): boolean` — `inner` целиком внутри `outer`.
  - `placeNewRegion(drawn: PolygonGeometry, existing: { id: string; geometry: PolygonGeometry }[]): NewRegionPlacement | null` — реализует правило анклава:

```ts
export interface NewRegionPlacement {
  /** Геометрия создаваемого региона. */
  geometry: PolygonGeometry;
  /** Заполнено, только если это анклав: в этом регионе надо вырезать дырку. */
  carve: { regionId: string; geometry: PolygonGeometry } | null;
}
```

- [ ] **Шаг 1: Написать падающие тесты**

`tests/regionOps.test.ts`:

```ts
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
    const xs = (JSON.stringify(clipped).match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    expect(Math.max(...xs)).toBeCloseTo(10, 6);
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
    const placement = placeNewRegion(box(40, 40, 60, 60), [{ id: 'outer', geometry: box(0, 0, 100, 100) }])!;
    expect(placement.carve).not.toBeNull();
    expect(placement.carve!.regionId).toBe('outer');
    expect(polygonArea(placement.geometry)).toBeCloseTo(400, 6);
    // В охватывающем регионе стало на 400 единиц площади меньше.
    expect(polygonArea(placement.carve!.geometry)).toBeCloseTo(10000 - 400, 6);
  });

  it('does not carve when the drawing is inside two overlapping candidates', () => {
    // Регионы не пересекаются по инварианту, поэтому «внутри двух» невозможно;
    // проверяем, что при пустом результате обрезки и отсутствии единственного
    // охватывающего региона placeNewRegion возвращает null, а не мусор.
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
});
```

- [ ] **Шаг 2: Прогнать — падает**

Run: `npm test -- tests/regionOps.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать `src/geometry/regionOps.ts`**

```ts
import {
  union, difference, unkinkPolygon, polygon, multiPolygon, featureCollection,
} from '@turf/turf';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import type { PolygonGeometry } from '../data/types';
import { polygonArea } from './measure';

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

/** unkink + выбросить куски-мусор, которые оставляет булева операция. */
export function normalize(geometry: PolygonGeometry): PolygonGeometry | null {
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
    return normalize({ type: 'Polygon', coordinates: [closed] });
  } catch {
    return null;
  }
}

function unionAll(geometries: PolygonGeometry[]): PolygonGeometry | null {
  if (geometries.length === 0) return null;
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
export function expandRegion(existing: PolygonGeometry, addition: PolygonGeometry): PolygonGeometry {
  const merged = union(featureCollection([toFeature(existing), toFeature(addition)]));
  const geometry = merged ? (merged.geometry as PolygonGeometry) : existing;
  return normalize(geometry) ?? geometry;
}

/** ТЗ §4.1: распад на части не создаёт новых регионов. */
export function shrinkRegion(existing: PolygonGeometry, cut: PolygonGeometry): PolygonGeometry | null {
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
```

- [ ] **Шаг 4: Прогнать — проходит**

Run: `npm test -- tests/regionOps.test.ts`
Expected: PASS, 15 тестов.

Если turf 7 в установленной версии ругается на сигнатуру `union`/`difference`
— проверить актуальную сигнатуру через Context7 (`/turfjs/turf`, запрос
«turf 7 union difference featureCollection signature») и поправить только
вызовы, не логику.

- [ ] **Шаг 5: Коммит**

```bash
git add src/geometry/regionOps.ts tests/regionOps.test.ts
git commit -m "feat: smart region borders with clipping, expand and shrink operations"
```

---

## Task 5: Слайс сущностей и загрузка карты

**Files:**
- Create: `src/state/entities.ts`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: `repository`, типы из `src/data/types.ts`.
- Produces: `useEntities` — Zustand-стор:

```ts
interface EntitiesState {
  regions: Map<string, RegionEntity>;
  states: Map<string, StateEntity>;
  culturalRegions: Map<string, CulturalRegionEntity>;
  points: Map<string, PointEntity>;
  roads: Map<string, RoadEntity>;
  seaLevel: number;
  selection: Selection | null;
  loaded: boolean;
  loadAll(): Promise<void>;
  upsert(kind: EntityKind, entity: MapEntity): void;   // используется Realtime в Плане 04
  remove(kind: EntityKind, id: string): void;
  select(selection: Selection | null): void;
  setSeaLevel(value: number): void;
}
```

`upsert`/`remove` заменяют соответствующую `Map` новым экземпляром, чтобы
подписки Zustand и Pixi-слои видели изменение ссылки.

- [ ] **Шаг 1: Реализовать `src/state/entities.ts`**

```ts
import { create } from 'zustand';
import * as repository from '../data/repository';
import type {
  RegionEntity, StateEntity, CulturalRegionEntity, PointEntity, RoadEntity,
  MapEntity, EntityKind, Selection,
} from '../data/types';

const KIND_TO_FIELD = {
  region: 'regions', state: 'states', cultural: 'culturalRegions',
  point: 'points', road: 'roads',
} as const;

interface EntitiesState {
  regions: Map<string, RegionEntity>;
  states: Map<string, StateEntity>;
  culturalRegions: Map<string, CulturalRegionEntity>;
  points: Map<string, PointEntity>;
  roads: Map<string, RoadEntity>;
  seaLevel: number;
  selection: Selection | null;
  loaded: boolean;
  loadAll(): Promise<void>;
  upsert(kind: EntityKind, entity: MapEntity): void;
  remove(kind: EntityKind, id: string): void;
  select(selection: Selection | null): void;
  setSeaLevel(value: number): void;
}

const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((i) => [i.id, i]));

export const useEntities = create<EntitiesState>((set, get) => ({
  regions: new Map(), states: new Map(), culturalRegions: new Map(),
  points: new Map(), roads: new Map(),
  seaLevel: 0, selection: null, loaded: false,

  async loadAll() {
    const data = await repository.loadAll();
    set({
      regions: byId(data.regions),
      states: byId(data.states),
      culturalRegions: byId(data.culturalRegions),
      points: byId(data.points),
      roads: byId(data.roads),
      seaLevel: data.seaLevel,
      loaded: true,
    });
  },

  upsert(kind, entity) {
    const field = KIND_TO_FIELD[kind];
    const next = new Map(get()[field] as Map<string, MapEntity>);
    next.set(entity.id, entity);
    set({ [field]: next } as unknown as Partial<EntitiesState>);
  },

  remove(kind, id) {
    const field = KIND_TO_FIELD[kind];
    const next = new Map(get()[field] as Map<string, MapEntity>);
    next.delete(id);
    const selection = get().selection;
    set({
      [field]: next,
      selection: selection && selection.kind === kind && selection.id === id ? null : selection,
    } as unknown as Partial<EntitiesState>);
  },

  select: (selection) => set({ selection }),
  setSeaLevel: (seaLevel) => set({ seaLevel }),
}));
```

- [ ] **Шаг 2: Загружать карту после установки сессии**

В `src/main.tsx`, после `setSession`:

```ts
void startSession().then(async (session) => {
  useAppStore.getState().setSession(session);
  await useEntities.getState().loadAll();
});
```

- [ ] **Шаг 3: Проверить сборку**

Run: `npm run build`
Expected: успех.

- [ ] **Шаг 4: Коммит**

```bash
git add src/state/entities.ts src/main.tsx
git commit -m "feat: entities store loading the full map from Supabase"
```

---

## Task 6: Цвета регионов и три режима отображения

**Files:**
- Create: `src/map/colors.ts`
- Test: `tests/colors.test.ts`

**Interfaces:**
- Consumes: `RegionEntity`, `StateEntity`, `CulturalRegionEntity`, `DisplayMode`.
- Produces:
  - `hexToNumber(hex: string): number`
  - `interface RegionStyle { fill: number | null; fillAlpha: number; stroke: number; strokeAlpha: number }`
  - `regionStyle(region, mode, states, culturalRegions): RegionStyle`
  - `NEUTRAL_STROKE = 0x5a6b80`

Правила (ТЗ §4.2, §4.4): в режиме `states` — полупрозрачная заливка цветом
государства, граница тем же цветом; в режиме `cultural` — то же по
культурному региону; в режиме `regions` — заливки нет, только нейтральная
граница. Регион без государства/культуры в соответствующем режиме
отображается как в режиме `regions`.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/colors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { regionStyle, hexToNumber, NEUTRAL_STROKE } from '../src/map/colors';
import type { RegionEntity, StateEntity, CulturalRegionEntity } from '../src/data/types';

const region = (over: Partial<RegionEntity> = {}): RegionEntity => ({
  id: 'r', name: 'R', geometry: { type: 'Polygon', coordinates: [] },
  stateId: null, culturalRegionId: null, ...over,
});
const states = new Map<string, StateEntity>([
  ['s1', { id: 's1', name: 'Аркадия', color: '#8ab4f8', discordPostId: null }],
]);
const culturals = new Map<string, CulturalRegionEntity>([
  ['c1', { id: 'c1', name: 'Север', color: '#f8b48a', discordPostId: null }],
]);

describe('hexToNumber', () => {
  it('parses #rrggbb', () => expect(hexToNumber('#8ab4f8')).toBe(0x8ab4f8));
  it('parses without the hash', () => expect(hexToNumber('8ab4f8')).toBe(0x8ab4f8));
});

describe('regionStyle', () => {
  it('fills by state colour in state mode', () => {
    const style = regionStyle(region({ stateId: 's1' }), 'states', states, culturals);
    expect(style.fill).toBe(0x8ab4f8);
    expect(style.stroke).toBe(0x8ab4f8);
    expect(style.fillAlpha).toBeGreaterThan(0);
    expect(style.fillAlpha).toBeLessThan(1);
  });

  it('fills by cultural colour in cultural mode', () => {
    const style = regionStyle(region({ culturalRegionId: 'c1' }), 'cultural', states, culturals);
    expect(style.fill).toBe(0xf8b48a);
  });

  it('ignores state colour when in cultural mode', () => {
    const style = regionStyle(region({ stateId: 's1' }), 'cultural', states, culturals);
    expect(style.fill).toBeNull();
    expect(style.stroke).toBe(NEUTRAL_STROKE);
  });

  it('draws borders only in region mode', () => {
    const style = regionStyle(region({ stateId: 's1' }), 'regions', states, culturals);
    expect(style.fill).toBeNull();
    expect(style.stroke).toBe(NEUTRAL_STROKE);
  });

  it('falls back to neutral for an unassigned region', () => {
    expect(regionStyle(region(), 'states', states, culturals).fill).toBeNull();
  });
});
```

- [ ] **Шаг 2: Прогнать — падает**

Run: `npm test -- tests/colors.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать `src/map/colors.ts`**

```ts
import type { RegionEntity, StateEntity, CulturalRegionEntity } from '../data/types';
import type { DisplayMode } from '../state/store';

export const NEUTRAL_STROKE = 0x5a6b80;
const FILL_ALPHA = 0.32;

export function hexToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

export interface RegionStyle {
  fill: number | null;
  fillAlpha: number;
  stroke: number;
  strokeAlpha: number;
}

export function regionStyle(
  region: RegionEntity,
  mode: DisplayMode,
  states: Map<string, StateEntity>,
  culturalRegions: Map<string, CulturalRegionEntity>,
): RegionStyle {
  const owner =
    mode === 'states' ? (region.stateId ? states.get(region.stateId) : undefined)
    : mode === 'cultural' ? (region.culturalRegionId ? culturalRegions.get(region.culturalRegionId) : undefined)
    : undefined;

  if (!owner) {
    return { fill: null, fillAlpha: 0, stroke: NEUTRAL_STROKE, strokeAlpha: 0.85 };
  }
  const color = hexToNumber(owner.color);
  return { fill: color, fillAlpha: FILL_ALPHA, stroke: color, strokeAlpha: 1 };
}
```

- [ ] **Шаг 4: Прогнать — проходит**

Run: `npm test -- tests/colors.test.ts`
Expected: PASS, 7 тестов.

- [ ] **Шаг 5: Коммит**

```bash
git add src/map/colors.ts tests/colors.test.ts
git commit -m "feat: region styling for the three display modes"
```

---

## Task 7: Слой регионов и попадание курсором

**Files:**
- Create: `src/map/regionsLayer.ts`, `src/map/hitTest.ts`
- Modify: `src/map/MapCanvas.tsx`
- Test: `tests/hitTest.test.ts`

**Interfaces:**
- Consumes: `regionStyle`, `geometryCentroid`, `geometryBBox`, `useEntities`, `useAppStore`.
- Produces:
  - `createRegionsLayer(): { view: Container; update(camera, viewport): void }` — рисует все регионы текущего режима + подписи имён.
  - `pointInGeometry(geometry: PolygonGeometry, x: number, y: number): boolean`
  - `hitTestRegion(x, y, regions): string | null` — при вложенности возвращает **самый маленький по площади** регион (анклав выигрывает у охватывающего, ТЗ §4.1).
  - `hitTestPoint(x, y, points, zoom): string | null` — радиус попадания 14 экранных пикселей.
  - `hitTestRoad(x, y, roads, zoom): string | null` — расстояние до сегмента ≤ 8 экранных пикселей.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/hitTest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pointInGeometry, hitTestRegion, hitTestPoint, hitTestRoad } from '../src/map/hitTest';
import type { RegionEntity, PointEntity, RoadEntity, PolygonGeometry } from '../src/data/types';

const box = (x0: number, y0: number, x1: number, y1: number): PolygonGeometry => ({
  type: 'Polygon',
  coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
});
const region = (id: string, geometry: PolygonGeometry): RegionEntity =>
  ({ id, name: id, geometry, stateId: null, culturalRegionId: null });

describe('pointInGeometry', () => {
  it('detects a point inside', () => expect(pointInGeometry(box(0, 0, 10, 10), 5, 5)).toBe(true));
  it('detects a point outside', () => expect(pointInGeometry(box(0, 0, 10, 10), 15, 5)).toBe(false));
  it('handles multipolygons', () => {
    const geometry: PolygonGeometry = {
      type: 'MultiPolygon',
      coordinates: [box(0, 0, 10, 10).coordinates as number[][][], box(100, 0, 110, 10).coordinates as number[][][]],
    };
    expect(pointInGeometry(geometry, 105, 5)).toBe(true);
  });
});

describe('hitTestRegion', () => {
  it('returns the enclave, not the surrounding region', () => {
    const regions = new Map([
      ['outer', region('outer', box(0, 0, 100, 100))],
      ['enclave', region('enclave', box(40, 40, 60, 60))],
    ]);
    expect(hitTestRegion(50, 50, regions)).toBe('enclave');
  });

  it('returns null outside everything', () => {
    expect(hitTestRegion(500, 500, new Map([['a', region('a', box(0, 0, 10, 10))]]))).toBeNull();
  });
});

describe('hitTestPoint', () => {
  const points = new Map<string, PointEntity>([
    ['p', { id: 'p', name: 'Город', iconType: 'city', x: 100, y: 100, discordPostId: null }],
  ]);
  it('hits within 14 screen pixels', () => {
    expect(hitTestPoint(105, 100, points, 1)).toBe('p');
  });
  it('misses beyond the radius', () => {
    expect(hitTestPoint(140, 100, points, 1)).toBeNull();
  });
  it('scales the radius with zoom', () => {
    expect(hitTestPoint(102, 100, points, 0.1)).toBe('p');
  });
});

describe('hitTestRoad', () => {
  const roads = new Map<string, RoadEntity>([
    ['d', { id: 'd', name: null, roadType: 'major',
            geometry: { type: 'LineString', coordinates: [[0, 0], [100, 0]] } }],
  ]);
  it('hits close to the line', () => expect(hitTestRoad(50, 3, roads, 1)).toBe('d'));
  it('misses far from the line', () => expect(hitTestRoad(50, 40, roads, 1)).toBeNull());
});
```

- [ ] **Шаг 2: Прогнать — падает**

Run: `npm test -- tests/hitTest.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать `src/map/hitTest.ts`**

```ts
import { booleanPointInPolygon, point as turfPoint, polygon, multiPolygon } from '@turf/turf';
import type { PolygonGeometry, RegionEntity, PointEntity, RoadEntity } from '../data/types';
import { polygonArea } from '../geometry/measure';

export const POINT_HIT_RADIUS_PX = 14;
export const ROAD_HIT_RADIUS_PX = 8;

export function pointInGeometry(geometry: PolygonGeometry, x: number, y: number): boolean {
  if (!geometry.coordinates.length) return false;
  const feature = geometry.type === 'Polygon'
    ? polygon(geometry.coordinates)
    : multiPolygon(geometry.coordinates);
  return booleanPointInPolygon(turfPoint([x, y]), feature);
}

/** При вложенности выигрывает самый маленький регион — анклав, а не оболочка. */
export function hitTestRegion(x: number, y: number, regions: Map<string, RegionEntity>): string | null {
  let bestId: string | null = null;
  let bestArea = Infinity;
  for (const region of regions.values()) {
    if (!pointInGeometry(region.geometry, x, y)) continue;
    const area = polygonArea(region.geometry);
    if (area < bestArea) { bestArea = area; bestId = region.id; }
  }
  return bestId;
}

export function hitTestPoint(
  x: number, y: number, points: Map<string, PointEntity>, zoom: number,
): string | null {
  const radius = POINT_HIT_RADIUS_PX / zoom;
  let bestId: string | null = null;
  let bestDistance = radius;
  for (const p of points.values()) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= bestDistance) { bestDistance = d; bestId = p.id; }
  }
  return bestId;
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function hitTestRoad(
  x: number, y: number, roads: Map<string, RoadEntity>, zoom: number,
): string | null {
  const radius = ROAD_HIT_RADIUS_PX / zoom;
  let bestId: string | null = null;
  let bestDistance = radius;
  for (const road of roads.values()) {
    const coords = road.geometry.coordinates;
    for (let i = 1; i < coords.length; i++) {
      const d = distanceToSegment(x, y, coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
      if (d <= bestDistance) { bestDistance = d; bestId = road.id; }
    }
  }
  return bestId;
}
```

- [ ] **Шаг 4: Прогнать — проходит**

Run: `npm test -- tests/hitTest.test.ts`
Expected: PASS, 10 тестов.

- [ ] **Шаг 5: Реализовать `src/map/regionsLayer.ts`**

```ts
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { Camera, Viewport } from './camera';
import { useEntities } from '../state/entities';
import { useAppStore } from '../state/store';
import { regionStyle } from './colors';
import { geometryCentroid, geometryBBox } from '../geometry/measure';
import { visibleWorldBounds } from './camera';
import type { PolygonGeometry } from '../data/types';

const LABEL_STYLE = new TextStyle({
  fill: 0xd8e2ee, fontSize: 13, fontFamily: 'Segoe UI, system-ui, sans-serif',
  stroke: { color: 0x0d1117, width: 3 },
});

function tracePolygon(g: Graphics, geometry: PolygonGeometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const rings of polygons) {
    for (const ring of rings) {
      if (ring.length < 2) continue;
      g.moveTo(ring[0][0], ring[0][1]);
      for (let i = 1; i < ring.length; i++) g.lineTo(ring[i][0], ring[i][1]);
      g.closePath();
    }
  }
}

export function createRegionsLayer() {
  const view = new Container();
  const shapes = new Graphics();
  const labels = new Container();
  view.addChild(shapes, labels);

  function update(camera: Camera, viewport: Viewport) {
    const { regions, states, culturalRegions, selection } = useEntities.getState();
    const mode = useAppStore.getState().displayMode;
    const [minX, minY, maxX, maxY] = visibleWorldBounds(camera, viewport);

    shapes.clear();
    labels.removeChildren().forEach((child) => child.destroy());

    for (const region of regions.values()) {
      const [rMinX, rMinY, rMaxX, rMaxY] = geometryBBox(region.geometry);
      if (rMaxX < minX || rMinX > maxX || rMaxY < minY || rMinY > maxY) continue;  // culling

      const style = regionStyle(region, mode, states, culturalRegions);
      const selected = selection?.kind === 'region' && selection.id === region.id;

      tracePolygon(shapes, region.geometry);
      if (style.fill !== null) shapes.fill({ color: style.fill, alpha: style.fillAlpha });
      shapes.stroke({
        width: (selected ? 3 : 1.5) / camera.zoom,
        color: selected ? 0xffd479 : style.stroke,
        alpha: style.strokeAlpha,
      });

      if (camera.zoom > 0.25) {
        const centre = geometryCentroid(region.geometry);
        const label = new Text({ text: region.name, style: LABEL_STYLE });
        label.anchor.set(0.5);
        label.position.set(centre.x, centre.y);
        label.scale.set(1 / camera.zoom);
        labels.addChild(label);
      }
    }
  }

  return { view, update };
}
```

- [ ] **Шаг 6: Подключить слой в `MapCanvas.tsx`**

Внутри `useEffect` из Плана 01, Task 5, заменить тело на такое (последующие
задачи дописывают сюда свои слои по тому же образцу):

```ts
const grid = createGridLayer();
created.layers.terrain.addChild(grid.view);

const regions = createRegionsLayer();
created.layers.regions.addChild(regions.view);

const redraw = () => {
  const { camera, viewport } = useAppStore.getState();
  applyCamera(created, camera, viewport);
  grid.update(camera, viewport);
  regions.update(camera, viewport);
};

detachInput = attachCameraInput(host);
detachSelection = attachSelection(host);           // добавится в Task 8
const unsubscribeApp = useAppStore.subscribe(redraw);
const unsubscribeEntities = useEntities.subscribe(redraw);
unsubscribe = () => { unsubscribeApp(); unsubscribeEntities(); };
```

Подписка на `useEntities` обязательна: без неё созданный регион не появится
на карте до следующего движения камеры.

- [ ] **Шаг 7: Коммит**

```bash
git add src/map/regionsLayer.ts src/map/hitTest.ts src/map/MapCanvas.tsx tests/hitTest.test.ts
git commit -m "feat: regions layer with display-mode styling, labels, culling and hit testing"
```

---

## Task 8: Захват росчерка левой кнопкой

**Files:**
- Create: `src/map/tools/freehand.ts`
- Modify: `src/map/MapCanvas.tsx`

**Interfaces:**
- Consumes: `screenToWorld` из `camera.ts`; `useAppStore`.
- Produces:

```ts
export interface FreehandHandlers {
  onStart?(worldX: number, worldY: number, event: PointerEvent): void;
  onMove?(worldX: number, worldY: number, points: number[][]): void;
  onFinish(points: number[][], event: PointerEvent): void;
  onCancel?(): void;
}
export function attachFreehand(host: HTMLElement, getHandlers: () => FreehandHandlers | null): () => void;
```

`attachFreehand` слушает только `button === 0`. Пока идёт росчерк —
`Escape` отменяет его (`onCancel`). Точки накапливаются в мировых координатах.
`getHandlers()` возвращает `null`, если активный инструмент не рисующий —
тогда левая кнопка отдаётся выбору объекта.

- [ ] **Шаг 1: Реализовать `src/map/tools/freehand.ts`**

```ts
import { screenToWorld } from '../camera';
import { useAppStore } from '../../state/store';

export interface FreehandHandlers {
  onStart?(worldX: number, worldY: number, event: PointerEvent): void;
  onMove?(worldX: number, worldY: number, points: number[][]): void;
  onFinish(points: number[][], event: PointerEvent): void;
  onCancel?(): void;
}

export function attachFreehand(
  host: HTMLElement,
  getHandlers: () => FreehandHandlers | null,
): () => void {
  let active: FreehandHandlers | null = null;
  let points: number[][] = [];

  const toWorld = (e: PointerEvent) => {
    const rect = host.getBoundingClientRect();
    const { camera, viewport } = useAppStore.getState();
    return screenToWorld(camera, e.clientX - rect.left, e.clientY - rect.top, viewport);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const handlers = getHandlers();
    if (!handlers) return;
    e.preventDefault();
    active = handlers;
    const w = toWorld(e);
    points = [[w.x, w.y]];
    handlers.onStart?.(w.x, w.y, e);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!active) return;
    const w = toWorld(e);
    points.push([w.x, w.y]);
    active.onMove?.(w.x, w.y, points);
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!active) return;
    const handlers = active;
    const captured = points;
    active = null;
    points = [];
    handlers.onFinish(captured, e);
  };

  const cancel = () => {
    if (!active) return;
    active.onCancel?.();
    active = null;
    points = [];
  };

  const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel(); };

  host.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', onKeyDown);

  return () => {
    host.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('keydown', onKeyDown);
  };
}
```

- [ ] **Шаг 2: Добавить выбор объекта кликом (работает при любом инструменте)**

Новый файл `src/map/tools/selection.ts`. ТЗ §10: выбор кликом работает
независимо от активного инструмента, поэтому этот обработчик живёт отдельно
от `attachFreehand` и никогда не отключается.

```ts
import { screenToWorld } from '../camera';
import { useAppStore } from '../../state/store';
import { useEntities } from '../../state/entities';
import { hitTestPoint, hitTestRoad, hitTestRegion } from '../hitTest';

const CLICK_SLOP_PX = 4;   // дальше этого — это был росчерк, а не клик

export function attachSelection(host: HTMLElement): () => void {
  let downX = 0;
  let downY = 0;
  let armed = false;

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    downX = e.clientX;
    downY = e.clientY;
    armed = true;
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!armed || e.button !== 0) return;
    armed = false;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > CLICK_SLOP_PX) return;

    const rect = host.getBoundingClientRect();
    const { camera, viewport } = useAppStore.getState();
    const world = screenToWorld(camera, e.clientX - rect.left, e.clientY - rect.top, viewport);
    const { points, roads, regions, select } = useEntities.getState();

    // Мелкие объекты приоритетнее крупных.
    const pointId = hitTestPoint(world.x, world.y, points, camera.zoom);
    if (pointId) return select({ kind: 'point', id: pointId });

    const roadId = hitTestRoad(world.x, world.y, roads, camera.zoom);
    if (roadId) return select({ kind: 'road', id: roadId });

    const regionId = hitTestRegion(world.x, world.y, regions);
    select(regionId ? { kind: 'region', id: regionId } : null);
  };

  host.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  return () => {
    host.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointerup', onPointerUp);
  };
}
```

Вызвать `attachSelection(host)` в `MapCanvas.tsx` рядом с `attachCameraInput`
и `attachFreehand`, отписку положить в тот же `cleanup`.

- [ ] **Шаг 3: Проверить сборку и закоммитить**

```bash
npm run build
git add src/map/tools/freehand.ts src/map/MapCanvas.tsx
git commit -m "feat: left-button freehand stroke capture and always-on click selection"
```

---

## Task 9: Модальные формы и панель инструментов

**Files:**
- Create: `src/ui/Modal.tsx`, `src/ui/Toolbar.tsx`, `src/ui/ModeSwitch.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useAppStore` (`tool`, `roadType`, `displayMode`, `session.canEdit`).
- Produces:
  - `<Modal title open onClose>{children}</Modal>` — центрированное окно, закрытие по `Escape` и по клику вне.
  - `<TextField label value onChange />`, `<ColorField label value onChange />`, `<SelectField label value options onChange />`, `<ModalActions>`.
  - `<Toolbar />` — ровно шесть кнопок в порядке ТЗ §10; кнопка «Дорога» показывает индикатор из двух точек: активная точка = текущий `roadType`.
  - `<ModeSwitch />` — три режима отображения.
  - Все панели скрывают действия редактирования при `session.canEdit === false` (ТЗ §8.2).

- [ ] **Шаг 1: Реализовать `src/ui/Modal.tsx`**

```tsx
import { useEffect, type ReactNode } from 'react';

const PANEL: React.CSSProperties = {
  background: '#111823', border: '1px solid #263041', borderRadius: 12,
  padding: 20, minWidth: 320, boxShadow: '0 18px 48px rgba(0,0,0,.55)',
};

export function Modal(
  { title, open, onClose, children }:
  { title: string; open: boolean; onClose(): void; children: ReactNode },
) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'absolute', inset: 0, background: 'rgba(4,7,12,.62)',
        display: 'grid', placeItems: 'center', zIndex: 50,
      }}
    >
      <div style={PANEL}>
        <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 600 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, marginTop: 4,
  background: '#0d1117', border: '1px solid #263041', color: '#e6edf3', fontSize: 14,
};

export function TextField(
  { label, value, onChange, placeholder }:
  { label: string; value: string; onChange(v: string): void; placeholder?: string },
) {
  return (
    <label style={{ display: 'block', marginBottom: 12, fontSize: 13, opacity: .85 }}>
      {label}
      <input style={INPUT} value={value} placeholder={placeholder}
             onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function ColorField(
  { label, value, onChange }: { label: string; value: string; onChange(v: string): void },
) {
  return (
    <label style={{ display: 'block', marginBottom: 12, fontSize: 13, opacity: .85 }}>
      {label}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
             style={{ ...INPUT, height: 40, padding: 4 }} />
    </label>
  );
}

export function SelectField(
  { label, value, options, onChange }:
  { label: string; value: string; options: { value: string; label: string }[]; onChange(v: string): void },
) {
  return (
    <label style={{ display: 'block', marginBottom: 12, fontSize: 13, opacity: .85 }}>
      {label}
      <select style={INPUT} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function ModalActions({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>{children}</div>;
}

export function Button(
  { children, onClick, variant = 'default' }:
  { children: ReactNode; onClick(): void; variant?: 'default' | 'primary' | 'danger' },
) {
  const palette = {
    default: { background: '#1a2331', color: '#e6edf3', border: '1px solid #2b3648' },
    primary: { background: '#2f6feb', color: '#fff', border: '1px solid #2f6feb' },
    danger: { background: '#3a1d22', color: '#ff9aa2', border: '1px solid #5c2b33' },
  }[variant];
  return (
    <button onClick={onClick}
            style={{ ...palette, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
      {children}
    </button>
  );
}
```

- [ ] **Шаг 2: Реализовать `src/ui/Toolbar.tsx`**

```tsx
import { useAppStore, type ToolId } from '../state/store';

const TOOLS: { id: ToolId; label: string }[] = [
  { id: 'region',   label: 'Новый регион' },
  { id: 'point',    label: 'Новый объект' },
  { id: 'state',    label: 'Новое государство' },
  { id: 'cultural', label: 'Культурный регион' },
  { id: 'terrain',  label: 'Рельеф' },
  { id: 'road',     label: 'Дорога' },
];

export function Toolbar() {
  const tool = useAppStore((s) => s.tool);
  const roadType = useAppStore((s) => s.roadType);
  const selectTool = useAppStore((s) => s.selectTool);
  const canEdit = useAppStore((s) => s.session?.canEdit ?? false);

  if (!canEdit) return null;

  return (
    <div style={{
      position: 'absolute', left: 12, top: 12, display: 'flex', flexDirection: 'column',
      gap: 6, padding: 8, borderRadius: 12, background: 'rgba(13,17,23,.86)',
      border: '1px solid #263041', zIndex: 20,
    }}>
      {TOOLS.map((t) => (
        <button key={t.id} onClick={() => selectTool(t.id)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 14,
            textAlign: 'left',
            background: tool === t.id ? '#2f6feb' : '#161d29',
            color: tool === t.id ? '#fff' : '#c9d4e2',
            border: '1px solid ' + (tool === t.id ? '#2f6feb' : '#242e3d'),
          }}>
          <span>{t.label}</span>
          {t.id === 'road' && (
            <span style={{ display: 'flex', gap: 4 }} title={roadType === 'major' ? 'Крупная' : 'Малая'}>
              <Dot active={roadType === 'major'} />
              <Dot active={roadType === 'minor'} />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function Dot({ active }: { active: boolean }) {
  return <span style={{
    width: 7, height: 7, borderRadius: '50%',
    background: active ? '#ffd479' : 'rgba(255,255,255,.22)',
  }} />;
}
```

- [ ] **Шаг 3: Реализовать `src/ui/ModeSwitch.tsx`**

```tsx
import { useAppStore, type DisplayMode } from '../state/store';

const MODES: { id: DisplayMode; label: string }[] = [
  { id: 'states',   label: 'Государства' },
  { id: 'cultural', label: 'Культурные регионы' },
  { id: 'regions',  label: 'Регионы' },
];

export function ModeSwitch() {
  const displayMode = useAppStore((s) => s.displayMode);
  const setDisplayMode = useAppStore((s) => s.setDisplayMode);
  return (
    <div style={{
      position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 12,
      display: 'flex', gap: 4, padding: 4, borderRadius: 10,
      background: 'rgba(13,17,23,.86)', border: '1px solid #263041', zIndex: 20,
    }}>
      {MODES.map((m) => (
        <button key={m.id} onClick={() => setDisplayMode(m.id)}
          style={{
            padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 13, border: 'none',
            background: displayMode === m.id ? '#2f6feb' : 'transparent',
            color: displayMode === m.id ? '#fff' : '#a9b7c9',
          }}>
          {m.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Шаг 4: Добавить в `App.tsx`, проверить визуально**

```tsx
export function App() {
  return (
    <>
      <MapCanvas />
      <Toolbar />
      <ModeSwitch />
      <StatusBadge />
    </>
  );
}
```

Run: `npm run dev` — панель инструментов слева, шесть кнопок в порядке ТЗ,
у «Дороги» две точки, повторный клик по ней переключает активную точку;
переключатель режимов сверху по центру.

- [ ] **Шаг 5: Коммит**

```bash
git add src/ui src/App.tsx
git commit -m "feat: modal form primitives, six-tool toolbar and display mode switch"
```

---

## Task 10: Инструмент «Новый регион» с умными границами

**Files:**
- Create: `src/map/tools/regionTool.ts`
- Modify: `src/map/MapCanvas.tsx`, `src/ui/ObjectPanel.tsx` (создаётся в Task 11)

**Interfaces:**
- Consumes: `closeStrokeToRing`, `ringToGeometry`, `clipAgainstOthers`, `expandRegion`, `shrinkRegion`, `repository`, `useEntities`, `useAppStore`.
- Produces:
  - `type RegionAction = { kind: 'create' } | { kind: 'expand'; regionId: string } | { kind: 'shrink'; regionId: string }`
  - `useRegionTool` — Zustand-стор с полем `pending: RegionAction | null` и действием `setPending(action)`, чтобы панель объекта могла перевести инструмент в режим «расширить»/«уменьшить».
  - `makeRegionHandlers(requestName: (defaultName: string) => Promise<string | null>): FreehandHandlers`
  - `previewStroke(points: number[][]): void` — рисует незавершённый росчерк в слое `overlay`.

- [ ] **Шаг 1: Реализовать `src/map/tools/regionTool.ts`**

```ts
import { create } from 'zustand';
import { closeStrokeToRing } from '../../geometry/smooth';
import {
  ringToGeometry, clipAgainstOthers, expandRegion, shrinkRegion, placeNewRegion,
} from '../../geometry/regionOps';
import * as repository from '../../data/repository';
import { useEntities } from '../../state/entities';
import { useAppStore } from '../../state/store';
import type { FreehandHandlers } from './freehand';
import type { PolygonGeometry } from '../../data/types';

export type RegionAction =
  | { kind: 'create' }
  | { kind: 'expand'; regionId: string }
  | { kind: 'shrink'; regionId: string };

interface RegionToolState {
  pending: RegionAction | null;
  setPending(action: RegionAction | null): void;
}

export const useRegionTool = create<RegionToolState>((set) => ({
  pending: null,
  setPending: (pending) => set({ pending }),
}));

function otherGeometries(exceptId: string | null): PolygonGeometry[] {
  const result: PolygonGeometry[] = [];
  for (const region of useEntities.getState().regions.values()) {
    if (region.id !== exceptId) result.push(region.geometry);
  }
  return result;
}

export function makeRegionHandlers(
  requestName: (defaultName: string) => Promise<string | null>,
): FreehandHandlers {
  return {
    async onFinish(points) {
      const { camera } = useAppStore.getState();
      const ring = closeStrokeToRing(points, camera.zoom);
      if (!ring) return;
      const drawn = ringToGeometry(ring);
      if (!drawn) return;

      const action = useRegionTool.getState().pending ?? { kind: 'create' };
      const entities = useEntities.getState();

      if (action.kind === 'create') {
        // ТЗ §4.1: обрезка по чужим границам, а внутри одного региона — анклав.
        const placement = placeNewRegion(
          drawn,
          [...entities.regions.values()].map((r) => ({ id: r.id, geometry: r.geometry })),
        );
        if (!placement) return;

        const name = await requestName('Новый регион');
        if (!name) return;

        if (placement.carve) {
          const host = entities.regions.get(placement.carve.regionId);
          if (host) {
            await repository.updateRegion(host.id, { geometry: placement.carve.geometry });
            entities.upsert('region', { ...host, geometry: placement.carve.geometry });
          }
        }

        const region = await repository.createRegion({ name, geometry: placement.geometry });
        entities.upsert('region', region);
        entities.select({ kind: 'region', id: region.id });
        return;
      }

      const region = entities.regions.get(action.regionId);
      if (!region) return;

      if (action.kind === 'expand') {
        const clipped = clipAgainstOthers(drawn, otherGeometries(region.id));
        if (!clipped) return;
        const geometry = expandRegion(region.geometry, clipped);
        await repository.updateRegion(region.id, { geometry });
        entities.upsert('region', { ...region, geometry });
      } else {
        const geometry = shrinkRegion(region.geometry, drawn);
        if (!geometry) {
          await repository.deleteRegion(region.id);
          entities.remove('region', region.id);
        } else {
          await repository.updateRegion(region.id, { geometry });
          entities.upsert('region', { ...region, geometry });
        }
      }
      useRegionTool.getState().setPending(null);
    },

    onCancel() {
      useRegionTool.getState().setPending(null);
    },
  };
}
```

- [ ] **Шаг 2: Нарисовать превью росчерка**

В `MapCanvas.tsx` завести `Graphics` в слое `overlay` и в `onMove`
перерисовывать текущий росчерк пунктиром `1.5 / zoom`, цвет `0xffd479`;
очищать в `onFinish`/`onCancel`.

- [ ] **Шаг 3: Подключить инструмент через `attachFreehand`**

`getHandlers()` в `MapCanvas.tsx` возвращает обработчики региона, когда
`tool === 'region'` **или** `useRegionTool.getState().pending !== null`.
`requestName` — промис, который открывает `<Modal>` с `<TextField>` и
резолвится по «Создать»/`null` по «Отмена». Реализовать через стор
`useNamePrompt` с полями `{ open, defaultValue, resolve }`.

- [ ] **Шаг 4: Проверить вручную**

Run: `npm run dev`
1. Выбрать «Новый регион», обвести область, ввести имя — регион появляется.
2. Обвести вторую область с нахлёстом на первую — нахлёст обрезается,
   граница общая, щели нет.
3. Обвести область целиком внутри первой — в первой появляется дырка,
   внутри неё создаётся анклав; клик по анклаву выбирает именно анклав,
   клик по «бублику» вокруг — охватывающий регион.
4. Перезагрузить страницу — все регионы на месте (значит, записались в БД).

- [ ] **Шаг 5: Коммит**

```bash
git add src/map/tools/regionTool.ts src/map/MapCanvas.tsx
git commit -m "feat: region drawing tool with smart borders, expand and shrink actions"
```

---

## Task 11: Панель выбранного объекта

**Files:**
- Create: `src/ui/ObjectPanel.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useEntities`, `useAppStore`, `useRegionTool`, `repository`.
- Produces: `<ObjectPanel />` — плавающая панель справа с контекстными
  действиями (ТЗ §10):
  - регион: переименовать, расширить, уменьшить, назначить государство,
    назначить культурный регион, удалить;
  - государство: переименовать, сменить цвет, ID Discord-поста, удалить;
  - культурный регион: то же;
  - точечный объект: переименовать, сменить тип, ID Discord-поста, удалить;
  - дорога: сменить тип (крупная/малая), удалить.

- [ ] **Шаг 1: Реализовать `src/ui/ObjectPanel.tsx`**

Удаление подтверждается **внутри панели** двухшаговой кнопкой
(«Удалить» → «Точно удалить?»), не через `confirm()` (ТЗ §10).
Выпадающие списки групп включают пункт «— не назначено —» со значением `''`,
который пишет `null`.

```tsx
import { useState, type ReactNode } from 'react';
import { useEntities } from '../state/entities';
import { useAppStore } from '../state/store';
import { useRegionTool } from '../map/tools/regionTool';
import * as repository from '../data/repository';
import { TextField, ColorField, SelectField, Button } from './Modal';
import { ICON_LABELS } from '../map/icons';
import type { IconType, RoadType } from '../data/types';

const PANEL: React.CSSProperties = {
  position: 'absolute', right: 12, top: 56, width: 280, padding: 14,
  borderRadius: 12, background: 'rgba(13,17,23,.9)', border: '1px solid #263041',
  zIndex: 30, maxHeight: 'calc(100% - 100px)', overflowY: 'auto',
};

function DeleteButton({ onDelete }: { onDelete(): void }) {
  const [armed, setArmed] = useState(false);
  return (
    <Button variant="danger" onClick={() => (armed ? onDelete() : setArmed(true))}>
      {armed ? 'Точно удалить?' : 'Удалить'}
    </Button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <div style={{ fontSize: 12, opacity: .55, marginBottom: 10 }}>{title}</div>
      {children}
    </>
  );
}

export function ObjectPanel() {
  const selection = useEntities((s) => s.selection);
  const regions = useEntities((s) => s.regions);
  const states = useEntities((s) => s.states);
  const culturalRegions = useEntities((s) => s.culturalRegions);
  const points = useEntities((s) => s.points);
  const roads = useEntities((s) => s.roads);
  const canEdit = useAppStore((s) => s.session?.canEdit ?? false);
  const store = useEntities.getState();

  if (!selection) return null;

  const groupOptions = (items: Map<string, { id: string; name: string }>) => [
    { value: '', label: '— не назначено —' },
    ...[...items.values()].map((i) => ({ value: i.id, label: i.name })),
  ];

  if (selection.kind === 'region') {
    const region = regions.get(selection.id);
    if (!region) return null;
    return (
      <div style={PANEL}>
        <Section title="Регион">
          <TextField label="Название" value={region.name}
            onChange={async (name) => {
              store.upsert('region', { ...region, name });
              await repository.updateRegion(region.id, { name });
            }} />
          {canEdit && (
            <>
              <SelectField label="Государство" value={region.stateId ?? ''}
                options={groupOptions(states)}
                onChange={async (value) => {
                  const stateId = value || null;
                  store.upsert('region', { ...region, stateId });
                  await repository.updateRegion(region.id, { stateId });
                }} />
              <SelectField label="Культурный регион" value={region.culturalRegionId ?? ''}
                options={groupOptions(culturalRegions)}
                onChange={async (value) => {
                  const culturalRegionId = value || null;
                  store.upsert('region', { ...region, culturalRegionId });
                  await repository.updateRegion(region.id, { culturalRegionId });
                }} />
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <Button onClick={() => useRegionTool.getState()
                  .setPending({ kind: 'expand', regionId: region.id })}>Расширить</Button>
                <Button onClick={() => useRegionTool.getState()
                  .setPending({ kind: 'shrink', regionId: region.id })}>Уменьшить</Button>
              </div>
              <DeleteButton onDelete={async () => {
                await repository.deleteRegion(region.id);
                store.remove('region', region.id);
              }} />
            </>
          )}
        </Section>
      </div>
    );
  }

  if (selection.kind === 'state' || selection.kind === 'cultural') {
    const isState = selection.kind === 'state';
    const group = (isState ? states : culturalRegions).get(selection.id);
    if (!group) return null;
    const update = isState ? repository.updateState : repository.updateCulturalRegion;
    const remove = isState ? repository.deleteState : repository.deleteCulturalRegion;
    const patch = async (next: typeof group) => {
      store.upsert(selection.kind, next);
      await update(group.id, next);
    };
    return (
      <div style={PANEL}>
        <Section title={isState ? 'Государство' : 'Культурный регион'}>
          <TextField label="Название" value={group.name}
            onChange={(name) => void patch({ ...group, name })} />
          {canEdit && (
            <>
              <ColorField label="Цвет" value={group.color}
                onChange={(color) => void patch({ ...group, color })} />
              <TextField label="ID Discord-поста" placeholder="необязательно"
                value={group.discordPostId ?? ''}
                onChange={(v) => void patch({ ...group, discordPostId: v || null })} />
              <DeleteButton onDelete={async () => {
                await remove(group.id);
                store.remove(selection.kind, group.id);
              }} />
            </>
          )}
        </Section>
      </div>
    );
  }

  if (selection.kind === 'point') {
    const object = points.get(selection.id);
    if (!object) return null;
    const patch = async (next: typeof object) => {
      store.upsert('point', next);
      await repository.updatePoint(object.id, next);
    };
    return (
      <div style={PANEL}>
        <Section title="Точечный объект">
          <TextField label="Название" value={object.name}
            onChange={(name) => void patch({ ...object, name })} />
          {canEdit && (
            <>
              <SelectField label="Тип" value={object.iconType}
                options={Object.entries(ICON_LABELS).map(([value, label]) => ({ value, label }))}
                onChange={(v) => void patch({ ...object, iconType: v as IconType })} />
              <TextField label="ID Discord-поста" placeholder="необязательно"
                value={object.discordPostId ?? ''}
                onChange={(v) => void patch({ ...object, discordPostId: v || null })} />
              <DeleteButton onDelete={async () => {
                await repository.deletePoint(object.id);
                store.remove('point', object.id);
              }} />
            </>
          )}
        </Section>
      </div>
    );
  }

  const road = roads.get(selection.id);
  if (!road) return null;
  return (
    <div style={PANEL}>
      <Section title="Дорога">
        {canEdit && (
          <>
            <SelectField label="Тип" value={road.roadType}
              options={[{ value: 'major', label: 'Крупная' }, { value: 'minor', label: 'Малая' }]}
              onChange={async (v) => {
                const next = { ...road, roadType: v as RoadType };
                store.upsert('road', next);
                await repository.updateRoad(road.id, { roadType: next.roadType });
              }} />
            <DeleteButton onDelete={async () => {
              await repository.deleteRoad(road.id);
              store.remove('road', road.id);
            }} />
          </>
        )}
      </Section>
    </div>
  );
}
```

Блок описания из Discord-поста добавляется в ветки государства, культурного
региона и точечного объекта в Плане 04, Task 3.

- [ ] **Шаг 2: Добавить `<ObjectPanel />` в `App.tsx`**

- [ ] **Шаг 3: Проверить вручную**

Run: `npm run dev` — выбрать регион, переименовать (имя на карте меняется),
нажать «Уменьшить», обвести кусок — он вырезается; вырезать посередине
длинного региона — регион распадается на две части, но остаётся одним
(в панели по-прежнему один объект).

- [ ] **Шаг 4: Коммит**

```bash
git add src/ui/ObjectPanel.tsx src/App.tsx
git commit -m "feat: contextual object panel with per-type actions"
```

---

## Task 12: Государства и культурные регионы

**Files:**
- Modify: `src/map/MapCanvas.tsx` (инструменты `state` и `cultural`), `src/ui/ObjectPanel.tsx`
- Create: `src/ui/CreateGroupModal.tsx`

**Interfaces:**
- Consumes: `repository.createState`, `repository.createCulturalRegion`, `useEntities`.
- Produces: `<CreateGroupModal kind="state" | "cultural" open onClose />` — форма
  с полями «Название», «Цвет» (палитра произвольного цвета) и «ID Discord-поста
  (необязательно)» (ТЗ §4.2).

- [ ] **Шаг 1: Реализовать модалку создания**

Инструменты «Новое государство» и «Культурный регион» ничего не рисуют на
карте — по выбору они сразу открывают `<CreateGroupModal>`, после создания
инструмент сбрасывается в `'none'`, а созданная сущность выбирается в
панели объекта.

```tsx
import { useState } from 'react';
import { Modal, TextField, ColorField, ModalActions, Button } from './Modal';
import * as repository from '../data/repository';
import { useEntities } from '../state/entities';
import { useAppStore } from '../state/store';

const DEFAULT_COLORS = ['#8ab4f8', '#f8b48a', '#a8e6a1', '#e6a1d8', '#f0d98a', '#8ad8d8'];
const randomColor = () => DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)];

export function CreateGroupModal() {
  const tool = useAppStore((s) => s.tool);
  const selectTool = useAppStore((s) => s.selectTool);
  const [name, setName] = useState('');
  const [color, setColor] = useState(randomColor);
  const [postId, setPostId] = useState('');

  const kind = tool === 'state' ? 'state' : tool === 'cultural' ? 'cultural' : null;
  if (!kind) return null;

  const close = () => {
    setName(''); setColor(randomColor()); setPostId('');
    selectTool(kind);          // повторный выбор снимает инструмент
  };

  const create = async () => {
    if (!name.trim()) return;
    const input = { name: name.trim(), color, discordPostId: postId.trim() || null };
    const entity = kind === 'state'
      ? await repository.createState(input)
      : await repository.createCulturalRegion(input);
    const store = useEntities.getState();
    store.upsert(kind, entity);
    store.select({ kind, id: entity.id });
    close();
  };

  return (
    <Modal open title={kind === 'state' ? 'Новое государство' : 'Новый культурный регион'}
           onClose={close}>
      <TextField label="Название" value={name} onChange={setName} />
      <ColorField label="Цвет" value={color} onChange={setColor} />
      <TextField label="ID Discord-поста" placeholder="необязательно"
                 value={postId} onChange={setPostId} />
      <ModalActions>
        <Button onClick={close}>Отмена</Button>
        <Button variant="primary" onClick={() => void create()}>Создать</Button>
      </ModalActions>
    </Modal>
  );
}
```

Добавить `<CreateGroupModal />` в `App.tsx`.

- [ ] **Шаг 2: Назначение региона в группу**

В `<ObjectPanel />` для выбранного региона — два `<SelectField>`:
«Государство» и «Культурный регион», списки из `useEntities`. Выбор пишет
`repository.updateRegion(id, { stateId })` / `{ culturalRegionId }` и
обновляет стор. Один регион — максимум одно государство и один культурный
регион (ТЗ §4.2, §4.3).

- [ ] **Шаг 3: Проверить три режима**

Run: `npm run dev`
1. Создать государство с ярким цветом, назначить ему два соседних региона.
2. Режим «Государства» — оба региона залиты цветом государства, границы
   тем же цветом, между ними нет щели.
3. Режим «Культурные регионы» — заливка пропала (культура не назначена).
4. Режим «Регионы» — только серые границы и названия.
5. Точечные объекты и дороги (после Task 13–14) видны во всех трёх режимах.

- [ ] **Шаг 4: Коммит**

```bash
git add src/ui/CreateGroupModal.tsx src/ui/ObjectPanel.tsx src/map/MapCanvas.tsx
git commit -m "feat: states and cultural regions with creation modal and region assignment"
```

---

## Task 13: Точечные объекты — иконки, LOD, перетаскивание

**Files:**
- Create: `src/map/icons.ts`, `src/map/pointsLayer.ts`, `src/map/tools/pointTool.ts`
- Modify: `src/map/MapCanvas.tsx`
- Test: `tests/icons.test.ts`

**Interfaces:**
- Consumes: `IconType`, `PointEntity`, `useEntities`, `repository`.
- Produces:
  - `ICON_LABELS: Record<IconType, string>` — русские подписи: столица, город, деревня, крепость, данж, подземелье, ресурс.
  - `drawIcon(g: Graphics, type: IconType, size: number): void` — векторная отрисовка, без внешних картинок (ТЗ §6).
  - `iconLOD(zoom: number): 'dot' | 'icon'` — `'dot'` при `zoom < 0.35`.
  - `labelVisibility(zoom: number): 'always' | 'hover'` — `'always'` при `zoom >= 1.1` (ТЗ §6).
  - `createPointsLayer(): { view: Container; update(camera, viewport): void; setHovered(id: string | null): void }`
  - `makePointHandlers(requestPoint): FreehandHandlers` + перетаскивание существующего объекта левой кнопкой.

Иконки постоянного экранного размера: масштаб контейнера иконки
`1 / camera.zoom`, базовый размер 18 px.

- [ ] **Шаг 1: Написать падающие тесты на LOD**

`tests/icons.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { iconLOD, labelVisibility, ICON_LABELS } from '../src/map/icons';

describe('point object level of detail', () => {
  it('shows a plain dot when zoomed far out', () => expect(iconLOD(0.1)).toBe('dot'));
  it('shows the detailed icon when zoomed in', () => expect(iconLOD(1)).toBe('icon'));
  it('shows labels only when zoomed in', () => {
    expect(labelVisibility(0.5)).toBe('hover');
    expect(labelVisibility(1.5)).toBe('always');
  });
  it('names all seven types in Russian', () => {
    expect(Object.keys(ICON_LABELS)).toEqual(
      ['capital','city','village','fortress','dungeon','cave','resource']);
    expect(ICON_LABELS.capital).toBe('Столица');
    expect(ICON_LABELS.resource).toBe('Ресурс');
  });
});
```

- [ ] **Шаг 2: Прогнать — падает**

Run: `npm test -- tests/icons.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать `src/map/icons.ts`**

```ts
import type { Graphics } from 'pixi.js';
import type { IconType } from '../data/types';

export const ICON_LABELS: Record<IconType, string> = {
  capital: 'Столица', city: 'Город', village: 'Деревня', fortress: 'Крепость',
  dungeon: 'Данж', cave: 'Подземелье', resource: 'Ресурс',
};

export const ICON_COLORS: Record<IconType, number> = {
  capital: 0xffd479, city: 0xe6edf3, village: 0xb6c4d4, fortress: 0xf29b7c,
  dungeon: 0xc08af8, cave: 0x8a9bb5, resource: 0x7cd992,
};

export const DOT_ZOOM_THRESHOLD = 0.35;
export const LABEL_ZOOM_THRESHOLD = 1.1;

export function iconLOD(zoom: number): 'dot' | 'icon' {
  return zoom < DOT_ZOOM_THRESHOLD ? 'dot' : 'icon';
}

export function labelVisibility(zoom: number): 'always' | 'hover' {
  return zoom >= LABEL_ZOOM_THRESHOLD ? 'always' : 'hover';
}

/** Все иконки вписаны в квадрат size×size с центром в (0,0). */
export function drawIcon(g: Graphics, type: IconType, size: number): void {
  const s = size / 2;
  const color = ICON_COLORS[type];

  switch (type) {
    case 'capital':   // звезда
      star(g, 5, s, s * 0.45);
      g.fill({ color });
      break;
    case 'city':      // квадрат с двумя башенками
      g.rect(-s * 0.7, -s * 0.35, s * 1.4, s * 1.05).fill({ color });
      g.rect(-s * 0.6, -s * 0.9, s * 0.35, s * 0.55).fill({ color });
      g.rect(s * 0.25, -s * 0.9, s * 0.35, s * 0.55).fill({ color });
      break;
    case 'village':   // домик
      g.moveTo(0, -s).lineTo(s * 0.85, -s * 0.1).lineTo(-s * 0.85, -s * 0.1).closePath().fill({ color });
      g.rect(-s * 0.55, -s * 0.1, s * 1.1, s * 0.85).fill({ color });
      break;
    case 'fortress':  // зубчатая стена
      g.rect(-s * 0.85, -s * 0.25, s * 1.7, s * 1.0).fill({ color });
      for (let i = 0; i < 3; i++) {
        g.rect(-s * 0.85 + i * s * 0.62, -s * 0.8, s * 0.42, s * 0.55).fill({ color });
      }
      break;
    case 'dungeon':   // ромб с прорезью
      g.moveTo(0, -s).lineTo(s, 0).lineTo(0, s).lineTo(-s, 0).closePath().fill({ color });
      g.rect(-s * 0.14, -s * 0.5, s * 0.28, s * 1.0).fill({ color: 0x0d1117 });
      break;
    case 'cave':      // арка входа
      g.moveTo(-s * 0.9, s * 0.75).lineTo(-s * 0.9, 0)
       .arcTo(-s * 0.9, -s * 0.9, 0, -s * 0.9, s * 0.9)
       .arcTo(s * 0.9, -s * 0.9, s * 0.9, 0, s * 0.9)
       .lineTo(s * 0.9, s * 0.75).closePath().fill({ color });
      break;
    case 'resource':  // кирка-крест
      g.rect(-s * 0.16, -s, s * 0.32, s * 2).fill({ color });
      g.rect(-s, -s * 0.16, s * 2, s * 0.32).fill({ color });
      break;
  }
}

function star(g: Graphics, points: number, outer: number, inner: number) {
  const step = Math.PI / points;
  g.moveTo(0, -outer);
  for (let i = 1; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = i * step - Math.PI / 2;
    g.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  g.closePath();
}
```

- [ ] **Шаг 4: Прогнать — проходит**

Run: `npm test -- tests/icons.test.ts`
Expected: PASS, 4 теста.

- [ ] **Шаг 5: Реализовать `src/map/pointsLayer.ts`**

```ts
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { Camera, Viewport } from './camera';
import { visibleWorldBounds } from './camera';
import { useEntities } from '../state/entities';
import { drawIcon, iconLOD, labelVisibility, ICON_COLORS } from './icons';
import type { IconType } from '../data/types';

const ICON_SIZE = 18;              // экранных пикселей
const LABEL_STYLE = new TextStyle({
  fill: 0xe6edf3, fontSize: 12, fontFamily: 'Segoe UI, system-ui, sans-serif',
  stroke: { color: 0x0d1117, width: 3 },
});

interface PointView {
  container: Container;
  icon: Graphics;
  label: Text;
  drawnAs: string;                 // `${iconType}:${lod}` — когда менять форму
}

export function createPointsLayer() {
  const view = new Container();
  const views = new Map<string, PointView>();
  let hoveredId: string | null = null;

  function makeView(): PointView {
    const container = new Container();
    const icon = new Graphics();
    const label = new Text({ text: '', style: LABEL_STYLE });
    label.anchor.set(0.5, 0);
    label.position.set(0, ICON_SIZE * 0.7);
    container.addChild(icon, label);
    view.addChild(container);
    return { container, icon, label, drawnAs: '' };
  }

  function update(camera: Camera, viewport: Viewport) {
    const { points, selection } = useEntities.getState();
    const [minX, minY, maxX, maxY] = visibleWorldBounds(camera, viewport);
    const lod = iconLOD(camera.zoom);
    const labels = labelVisibility(camera.zoom);
    const margin = ICON_SIZE / camera.zoom;

    for (const [id, pointView] of [...views]) {
      if (!points.has(id)) {
        view.removeChild(pointView.container);
        pointView.container.destroy({ children: true });
        views.delete(id);
      }
    }

    for (const object of points.values()) {
      let pointView = views.get(object.id);
      if (!pointView) { pointView = makeView(); views.set(object.id, pointView); }

      const visible = object.x >= minX - margin && object.x <= maxX + margin
                   && object.y >= minY - margin && object.y <= maxY + margin;
      pointView.container.visible = visible;
      if (!visible) continue;

      pointView.container.position.set(object.x, object.y);
      pointView.container.scale.set(1 / camera.zoom);   // постоянный экранный размер

      const signature = `${object.iconType}:${lod}`;
      if (pointView.drawnAs !== signature) {
        pointView.icon.clear();
        if (lod === 'dot') {
          pointView.icon.circle(0, 0, 3).fill({ color: ICON_COLORS[object.iconType as IconType] });
        } else {
          drawIcon(pointView.icon, object.iconType, ICON_SIZE);
        }
        pointView.drawnAs = signature;
      }

      const selected = selection?.kind === 'point' && selection.id === object.id;
      pointView.icon.alpha = selected ? 1 : 0.92;
      pointView.icon.tint = selected ? 0xffd479 : 0xffffff;

      pointView.label.text = object.name;
      pointView.label.visible = labels === 'always' || hoveredId === object.id || selected;
    }
  }

  return { view, update, setHovered(id: string | null) { hoveredId = id; } };
}
```

- [ ] **Шаг 6: Реализовать `src/map/tools/pointTool.ts`**

Создание — через модалку (ТЗ §10: никаких `prompt`). Перетаскивание работает
при любом активном инструменте, потому что объект «свой» и перехватывает
левую кнопку раньше, чем `attachFreehand` (ТЗ §6).

```ts
import { create } from 'zustand';
import { screenToWorld } from '../camera';
import { useAppStore } from '../../state/store';
import { useEntities } from '../../state/entities';
import { hitTestPoint } from '../hitTest';
import * as repository from '../../data/repository';

interface PointDraftState {
  draft: { x: number; y: number } | null;
  openAt(x: number, y: number): void;
  close(): void;
}

export const usePointDraft = create<PointDraftState>((set) => ({
  draft: null,
  openAt: (x, y) => set({ draft: { x, y } }),
  close: () => set({ draft: null }),
}));

/** true, если событие «съедено» перетаскиванием и росчерк начинать не надо. */
export function attachPointInteractions(host: HTMLElement): () => void {
  let draggingId: string | null = null;
  let moved = false;

  const toWorld = (e: PointerEvent) => {
    const rect = host.getBoundingClientRect();
    const { camera, viewport } = useAppStore.getState();
    return screenToWorld(camera, e.clientX - rect.left, e.clientY - rect.top, viewport);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const { camera } = useAppStore.getState();
    const { points } = useEntities.getState();
    const world = toWorld(e);
    const hit = hitTestPoint(world.x, world.y, points, camera.zoom);

    if (hit && useAppStore.getState().session?.canEdit) {
      draggingId = hit;
      moved = false;
      e.stopPropagation();      // росчерк не начинается
      return;
    }
    if (useAppStore.getState().tool === 'point' && useAppStore.getState().session?.canEdit) {
      usePointDraft.getState().openAt(world.x, world.y);
      e.stopPropagation();
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!draggingId) return;
    moved = true;
    const world = toWorld(e);
    const store = useEntities.getState();
    const object = store.points.get(draggingId);
    if (object) store.upsert('point', { ...object, x: world.x, y: world.y });  // локально
  };

  const onPointerUp = async () => {
    if (!draggingId) return;
    const id = draggingId;
    draggingId = null;
    if (!moved) return;
    const object = useEntities.getState().points.get(id);
    if (object) await repository.updatePoint(id, { x: object.x, y: object.y });
  };

  // capture: true — перехватываем раньше attachFreehand и attachSelection
  host.addEventListener('pointerdown', onPointerDown, { capture: true });
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', () => void onPointerUp());

  return () => {
    host.removeEventListener('pointerdown', onPointerDown, { capture: true } as never);
    window.removeEventListener('pointermove', onPointerMove);
  };
}
```

Модалка `<CreatePointModal />` открывается, когда `usePointDraft().draft !== null`:
поля «Название», «Тип» (`<SelectField>` из `ICON_LABELS`), «ID Discord-поста»
(необязательно); по «Создать» — `repository.createPoint({ ...draft, ... })`,
`upsert('point', …)`, `select({kind:'point', id})`, `close()`.

- [ ] **Шаг 7: Подключить подсветку названия по наведению**

ТЗ §6: на среднем зуме название показывается по наведению. В `MapCanvas.tsx`
навесить на host `pointermove` (throttle до одного вызова на кадр через
`requestAnimationFrame`) и вызывать
`points.setHovered(hitTestPoint(world.x, world.y, entities.points, camera.zoom))`,
затем `redraw()`. Если результат не изменился — `redraw()` не вызывать.

- [ ] **Шаг 8: Проверить вручную**

Run: `npm run dev` — поставить по объекту каждого из семи типов; отдалить
камеру — иконки превращаются в точки; приблизить — появляются подписи;
на среднем зуме подпись появляется по наведению; перетащить объект и
перезагрузить страницу — позиция сохранилась.

- [ ] **Шаг 9: Коммит**

```bash
git add src/map/icons.ts src/map/pointsLayer.ts src/map/tools/pointTool.ts tests/icons.test.ts
git commit -m "feat: point objects with vector icons, zoom LOD, labels and dragging"
```

---

## Task 14: Дороги двух типов

**Files:**
- Create: `src/map/roadsLayer.ts`, `src/map/tools/roadTool.ts`
- Modify: `src/map/MapCanvas.tsx`

**Interfaces:**
- Consumes: `smoothStroke`, `repository.createRoad`, `useAppStore.roadType`.
- Produces:
  - `ROAD_STYLES: Record<RoadType, { width: number; color: number; casing: number | null }>` —
    `major`: ширина 5 экранных px, цвет `0xd8c9a8`, обводка `0x2a2318`;
    `minor`: ширина 2.5 px, цвет `0x9a8f78`, без обводки.
  - `createRoadsLayer(): { view: Container; update(camera, viewport): void }`
  - `makeRoadHandlers(): FreehandHandlers`

Ширина линии в мировых единицах = `width / camera.zoom`, чтобы дорога имела
постоянную толщину на экране.

- [ ] **Шаг 1: Реализовать `src/map/roadsLayer.ts`**

```ts
import { Container, Graphics } from 'pixi.js';
import type { Camera, Viewport } from './camera';
import { visibleWorldBounds } from './camera';
import { geometryBBox } from '../geometry/measure';
import { useEntities } from '../state/entities';
import type { RoadType } from '../data/types';

export const ROAD_STYLES: Record<RoadType, { width: number; color: number; casing: number | null }> = {
  major: { width: 5,   color: 0xd8c9a8, casing: 0x2a2318 },
  minor: { width: 2.5, color: 0x9a8f78, casing: null },
};

export function createRoadsLayer() {
  const view = new Container();
  const casing = new Graphics();
  const surface = new Graphics();
  view.addChild(casing, surface);

  function update(camera: Camera, viewport: Viewport) {
    const { roads, selection } = useEntities.getState();
    const [minX, minY, maxX, maxY] = visibleWorldBounds(camera, viewport);
    casing.clear();
    surface.clear();

    for (const road of roads.values()) {
      const [rMinX, rMinY, rMaxX, rMaxY] = geometryBBox(road.geometry);
      if (rMaxX < minX || rMinX > maxX || rMaxY < minY || rMinY > maxY) continue;

      const coords = road.geometry.coordinates;
      if (coords.length < 2) continue;
      const style = ROAD_STYLES[road.roadType];
      const selected = selection?.kind === 'road' && selection.id === road.id;

      const trace = (g: Graphics) => {
        g.moveTo(coords[0][0], coords[0][1]);
        for (let i = 1; i < coords.length; i++) g.lineTo(coords[i][0], coords[i][1]);
      };

      if (style.casing !== null) {
        trace(casing);
        casing.stroke({ width: (style.width + 2.5) / camera.zoom, color: style.casing, cap: 'round', join: 'round' });
      }
      trace(surface);
      surface.stroke({
        width: style.width / camera.zoom,
        color: selected ? 0xffd479 : style.color,
        cap: 'round', join: 'round',
      });
    }
  }

  return { view, update };
}
```

- [ ] **Шаг 2: Реализовать `src/map/tools/roadTool.ts`**

```ts
import { smoothStroke } from '../../geometry/smooth';
import * as repository from '../../data/repository';
import { useEntities } from '../../state/entities';
import { useAppStore } from '../../state/store';
import type { FreehandHandlers } from './freehand';

export function makeRoadHandlers(): FreehandHandlers {
  return {
    async onFinish(points) {
      const { camera, roadType } = useAppStore.getState();
      const smoothed = smoothStroke(points, camera.zoom);
      if (smoothed.length < 2) return;
      const road = await repository.createRoad({
        name: null,
        roadType,
        geometry: { type: 'LineString', coordinates: smoothed },
      });
      useEntities.getState().upsert('road', road);
    },
  };
}
```

- [ ] **Шаг 3: Проверить вручную**

Run: `npm run dev` — нарисовать крупную дорогу (толстая, с тёмной обводкой),
переключить инструмент повторным кликом на малую, нарисовать вторую (тонкая,
без обводки), пересечь их — обе рисуются нормально. Проверить, что толщина
на экране не меняется при зуме.

- [ ] **Шаг 4: Коммит**

```bash
git add src/map/roadsLayer.ts src/map/tools/roadTool.ts src/map/MapCanvas.tsx
git commit -m "feat: freehand roads with major and minor visual styles"
```

---

## Task 15: Поиск с долётом камеры

**Files:**
- Create: `src/ui/SearchBox.tsx`, `src/map/flyTo.ts`
- Modify: `src/App.tsx`
- Test: `tests/search.test.ts`

**Interfaces:**
- Consumes: `useEntities`, `geometryBBox`, `geometryCentroid`, `fitBounds`, `useAppStore`.
- Produces:
  - `interface SearchHit { kind: EntityKind; id: string; name: string; typeLabel: string }`
  - `searchEntities(query: string, entities): SearchHit[]` — регистронезависимо,
    подстрока, порядок: государства, культурные регионы, регионы, точечные
    объекты, дороги (ТЗ §9); максимум 20 результатов.
  - `flyTo(target: { bbox: Bounds } | { x: number; y: number; zoom: number }, durationMs = 450): void` —
    покадровая анимация камеры через `requestAnimationFrame` с ease-out.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/search.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { searchEntities } from '../src/ui/SearchBox';
import type { RegionEntity, StateEntity, PointEntity } from '../src/data/types';

const entities = {
  states: new Map<string, StateEntity>([
    ['s1', { id: 's1', name: 'Аркадия', color: '#fff', discordPostId: null }],
  ]),
  culturalRegions: new Map(),
  regions: new Map<string, RegionEntity>([
    ['r1', { id: 'r1', name: 'Аркадская долина', geometry: { type: 'Polygon', coordinates: [] },
             stateId: null, culturalRegionId: null }],
  ]),
  points: new Map<string, PointEntity>([
    ['p1', { id: 'p1', name: 'Порт', iconType: 'city', x: 0, y: 0, discordPostId: null }],
  ]),
  roads: new Map(),
};

describe('searchEntities', () => {
  it('matches case-insensitively on a substring', () => {
    const hits = searchEntities('аркад', entities as never);
    expect(hits.map((h) => h.id)).toEqual(['s1', 'r1']);
  });

  it('puts states before regions', () => {
    expect(searchEntities('аркад', entities as never)[0].kind).toBe('state');
  });

  it('returns nothing for an empty query', () => {
    expect(searchEntities('  ', entities as never)).toEqual([]);
  });

  it('finds point objects', () => {
    expect(searchEntities('порт', entities as never)[0].kind).toBe('point');
  });
});
```

- [ ] **Шаг 2: Прогнать — падает**

Run: `npm test -- tests/search.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать `searchEntities` и `<SearchBox />`**

```ts
import type { EntityKind } from '../data/types';

export interface SearchHit { kind: EntityKind; id: string; name: string; typeLabel: string }

interface Searchable {
  states: Map<string, { id: string; name: string }>;
  culturalRegions: Map<string, { id: string; name: string }>;
  regions: Map<string, { id: string; name: string }>;
  points: Map<string, { id: string; name: string }>;
  roads: Map<string, { id: string; name: string | null }>;
}

const MAX_HITS = 20;

// Порядок групп задаёт порядок выдачи (ТЗ §9).
const GROUPS: { kind: EntityKind; field: keyof Searchable; typeLabel: string }[] = [
  { kind: 'state',    field: 'states',          typeLabel: 'Государство' },
  { kind: 'cultural', field: 'culturalRegions', typeLabel: 'Культурный регион' },
  { kind: 'region',   field: 'regions',         typeLabel: 'Регион' },
  { kind: 'point',    field: 'points',          typeLabel: 'Объект' },
  { kind: 'road',     field: 'roads',           typeLabel: 'Дорога' },
];

export function searchEntities(query: string, entities: Searchable): SearchHit[] {
  const needle = query.trim().toLocaleLowerCase('ru');
  if (!needle) return [];

  const hits: SearchHit[] = [];
  for (const group of GROUPS) {
    for (const item of entities[group.field].values()) {
      if (hits.length >= MAX_HITS) return hits;
      const name = item.name;
      if (!name) continue;                       // у дорог имя может быть null
      if (!name.toLocaleLowerCase('ru').includes(needle)) continue;
      hits.push({ kind: group.kind, id: item.id, name, typeLabel: group.typeLabel });
    }
  }
  return hits;
}
```

`<SearchBox />` — поле ввода в правом верхнем углу под бейджем, список
результатов; по выбору: `select({kind, id})` и `flyTo`:
- регион → `fitBounds(geometryBBox(geometry), viewport)`
- государство / культурный регион → `fitBounds` по объединённому bbox всех
  его регионов
- точечный объект → `{ x, y, zoom: max(camera.zoom, 1.5) }`
- дорога → `fitBounds(geometryBBox(geometry), viewport)`

- [ ] **Шаг 4: Реализовать `src/map/flyTo.ts`**

```ts
import { useAppStore } from '../state/store';
import { fitBounds, type Bounds, type Camera } from './camera';

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function flyTo(
  target: { bbox: Bounds } | { x: number; y: number; zoom: number },
  durationMs = 450,
): void {
  const { camera, viewport, setCamera } = useAppStore.getState();
  const destination: Camera = 'bbox' in target
    ? fitBounds(target.bbox, viewport)
    : { x: target.x, y: target.y, zoom: target.zoom };

  const start = performance.now();
  const from = { ...camera };
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / durationMs);
    const k = easeOut(t);
    setCamera({
      x: from.x + (destination.x - from.x) * k,
      y: from.y + (destination.y - from.y) * k,
      // зум интерполируем логарифмически — иначе долёт «дёргается»
      zoom: Math.exp(Math.log(from.zoom) + (Math.log(destination.zoom) - Math.log(from.zoom)) * k),
    });
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
```

- [ ] **Шаг 5: Прогнать тесты — проходят**

Run: `npm test`
Expected: PASS, все тесты плана 01 и 02.

- [ ] **Шаг 6: Проверить вручную**

Run: `npm run dev` — ввести часть названия региона, выбрать результат:
камера плавно долетает, объект вписан в экран и выделен.

- [ ] **Шаг 7: Коммит**

```bash
git add src/ui/SearchBox.tsx src/map/flyTo.ts src/App.tsx tests/search.test.ts
git commit -m "feat: entity search with animated camera fly-to"
```

---

## Definition of Done для Плана 02

- `npm test` зелёный (≥ 55 тестов), `npm run build` без ошибок.
- Регионы: рисуются, сглаживаются, не пересекаются, обрезаются по соседям
  без щелей, расширяются и уменьшаются, поддерживают анклавы и многочастность.
- Государства и культурные регионы создаются с цветом и ID Discord-поста;
  регионы им назначаются; три режима отображения работают как в ТЗ §4.4.
- Семь типов точечных объектов рисуются векторно, LOD и подписи работают,
  объекты перетаскиваются и сохраняются.
- Дороги двух типов рисуются и визуально различимы; переключатель типа —
  повторным кликом с индикатором-точками.
- Поиск находит по названию и долетает камерой.
- Нигде не используются `prompt`/`alert`/`confirm`.
- Пользователь без роли редактора видит карту, но не видит панель
  инструментов и не может изменить ни один объект.
