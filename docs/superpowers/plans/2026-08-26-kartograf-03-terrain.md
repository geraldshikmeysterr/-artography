# Картограф — План 03: Рельеф Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Редактируемая чанковая карта высот с кистью повышения/понижения, GPU-шейдером в стиле топографических изолиний, автоматической водой ниже `sea_level`, подгрузкой чанков по видимой области, батч-сохранением в `bytea` и автоматическими мостами там, где дорога идёт по воде.

**Architecture:** Авторитетные высоты живут на CPU — `Float32Array(64×64)` на чанк в `ChunkStore`. Кисть меняет этот массив; изменённые чанки помечаются грязными, их данные заливаются в GPU-текстуру формата `r16float` размером 66×66 (64 ячейки + однопиксельный «фартук» из соседних чанков, чтобы изолинии и освещение были непрерывны на стыках). Каждый видимый чанк — один `Mesh` с общим fragment-шейдером, который в реальном времени считает изолинии, освещение по градиенту и воду. Раз в секунду и при отпускании кнопки грязные чанки пакуются в Int16 little-endian, кодируются в base64 и отправляются одним RPC-вызовом.

**Tech Stack:** PixiJS 8 (`Mesh`, `Shader`, `GlProgram`, `BufferImageSource`), GLSL ES 3.00, Supabase RPC, Vitest 3.

**Spec:** [`docs/KARTOGRAF_SPEC.md`](../../KARTOGRAF_SPEC.md) — разделы 5 целиком, 7 (мосты), 14 (пункты 7–8).

**Предшествует:** Планы 01 и 02 выполнены полностью.

---

## Global Constraints

- Мир рельефа разбит на **чанки 64×64 ячейки**; подгружаются только чанки в видимой области, остальное не хранится в памяти клиента. (ТЗ §5.2)
- Высота ячейки — **целое число**, хранится в Supabase как `bytea` (Int16 little-endian), **не JSON**. (ТЗ §5.2)
- Глобальный `sea_level` хранится в таблице `maps`; вода рендерится там, где высота ниже него. Отдельных объектов «море»/«озеро» в БД **нет**. (ТЗ §5.2, §5.3)
- Рендер — **fragment-шейдер на GPU**, не CPU-пересчёт: изолинии со сглаживанием через `fwidth()`, мягкое освещение по градиенту высоты, автоматическая вода. Считаются только видимые пиксели экрана. (ТЗ §5.3)
- Кисть — круглая, с настраиваемым радиусом и силой, **мягкие растушёванные края** без ступенек. Пока ЛКМ зажата — рисование полностью локальное, **без обращений к серверу**. (ТЗ §5.4)
- На сервер уходят **только реально изменившиеся чанки**, раз в ~1 секунду и обязательно при отпускании кнопки, бинарно. (ТЗ §5.5)
- Рельеф рисуется **под** всеми векторными слоями и на их логику не влияет. (ТЗ §5.6)
- Мост появляется автоматически там, где дорога проходит по участку с высотой ниже `sea_level`. Расчёт — по высоте рельефа под линией дороги. Вручную мосты не создаются. (ТЗ §5.6, §7)

**Отклонение от ТЗ (осознанное).** ТЗ §5.4/§5.5 описывает кисть, рисующую прямо
в `RenderTexture`, и `readback` текстуры перед отправкой. План делает
наоборот: авторитет — CPU-массив, GPU получает копию только для показа.
Причины: точные целые высоты без квантования при повторных мазках; отсутствие
хрупкого `gl.readPixels` с float-форматами; математика кисти становится
чистой функцией и покрывается тестами. Все наблюдаемые требования ТЗ
сохранены: рисование во время зажатой кнопки локальное, на сервер уходят
только изменившиеся чанки, бинарно, раз в секунду. Шейдер (§5.3) остаётся на
GPU без изменений.

**Диапазон высот:** `[-2048, 2047]`. Верхняя граница выбрана не произвольно:
формат текстуры `r16float` (half float) представляет целые числа точно ровно
до 2048, поэтому в этом диапазоне значение на GPU совпадает с CPU бит в бит.

---

## File Structure

```
src/map/terrain/
├─ constants.ts       Размеры чанка, диапазон высот, шаг изолиний, палитра
├─ chunkMath.ts       Адресация: мир ↔ чанк ↔ ячейка (юнит-тесты)
├─ half.ts            Кодирование Float32 → Float16 (юнит-тесты)
├─ chunkStore.ts      Хранилище высот, грязные чанки, сериализация (юнит-тесты)
├─ brush.ts           Математика кисти (юнит-тесты)
├─ apron.ts           Сборка 66×66 текстурных данных с фартуком (юнит-тесты)
├─ terrain.frag.ts    Исходник фрагментного шейдера строкой
├─ terrainLayer.ts    Mesh на чанк, подгрузка/выгрузка по видимой области
├─ terrainSync.ts     Загрузка чанков из Supabase, батч-сохранение
└─ terrainTool.ts     Инструмент «Рельеф»: обработчики кисти и курсор
src/geometry/
└─ bridges.ts         Вывод мостов из дороги и рельефа (юнит-тесты)
src/map/
└─ bridgesLayer.ts    Отрисовка выведенных мостов
src/ui/
└─ TerrainPanel.tsx   Радиус, сила, режим, уровень моря
tests/
├─ chunkMath.test.ts  half.test.ts  chunkStore.test.ts
├─ brush.test.ts      apron.test.ts  bridges.test.ts  base64.test.ts
```

---

## Task 1: Константы и адресация чанков

**Files:**
- Create: `src/map/terrain/constants.ts`, `src/map/terrain/chunkMath.ts`
- Test: `tests/chunkMath.test.ts`

**Interfaces:**
- Consumes: `Bounds` из `src/map/camera.ts`.
- Produces:

```ts
// constants.ts
export const CHUNK_CELLS = 64;        // ячеек по стороне чанка (ТЗ §5.2)
export const CELL_SIZE = 8;           // мировых единиц на ячейку
export const CHUNK_WORLD = 512;       // CHUNK_CELLS * CELL_SIZE
export const APRON = 1;               // фартук по краю текстуры
export const TEX_SIZE = 66;           // CHUNK_CELLS + 2 * APRON
export const HEIGHT_MIN = -2048;
export const HEIGHT_MAX = 2047;
export const DEFAULT_CONTOUR_STEP = 64;
export const MAJOR_CONTOUR_EVERY = 5;
export const CHUNK_CACHE_LIMIT = 256; // сколько чанков держим в памяти
```

```ts
// chunkMath.ts
export interface ChunkCoord { cx: number; cy: number }
export interface CellCoord { cx: number; cy: number; ix: number; iy: number }
export function chunkKey(cx: number, cy: number): string;
export function parseChunkKey(key: string): ChunkCoord;
export function worldToChunk(wx: number, wy: number): ChunkCoord;
export function worldToCell(wx: number, wy: number): CellCoord;
export function chunkOrigin(cx: number, cy: number): { x: number; y: number };
export function chunkRange(bounds: Bounds, margin?: number):
  { minCX: number; maxCX: number; minCY: number; maxCY: number };
export function cellIndex(ix: number, iy: number): number;   // iy * CHUNK_CELLS + ix
```

- [ ] **Шаг 1: Написать падающие тесты**

`tests/chunkMath.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  chunkKey, parseChunkKey, worldToChunk, worldToCell, chunkOrigin, chunkRange, cellIndex,
} from '../src/map/terrain/chunkMath';
import { CHUNK_WORLD, CELL_SIZE, CHUNK_CELLS } from '../src/map/terrain/constants';

describe('chunk addressing', () => {
  it('round-trips a chunk key', () => {
    expect(parseChunkKey(chunkKey(-3, 7))).toEqual({ cx: -3, cy: 7 });
  });

  it('maps world coordinates to a chunk', () => {
    expect(worldToChunk(0, 0)).toEqual({ cx: 0, cy: 0 });
    expect(worldToChunk(CHUNK_WORLD - 1, 0)).toEqual({ cx: 0, cy: 0 });
    expect(worldToChunk(CHUNK_WORLD, 0)).toEqual({ cx: 1, cy: 0 });
  });

  it('handles negative world coordinates without an off-by-one', () => {
    expect(worldToChunk(-1, -1)).toEqual({ cx: -1, cy: -1 });
    expect(worldToChunk(-CHUNK_WORLD, 0)).toEqual({ cx: -1, cy: 0 });
    expect(worldToChunk(-CHUNK_WORLD - 1, 0)).toEqual({ cx: -2, cy: 0 });
  });

  it('maps world coordinates to a cell inside a chunk', () => {
    expect(worldToCell(0, 0)).toEqual({ cx: 0, cy: 0, ix: 0, iy: 0 });
    expect(worldToCell(CELL_SIZE * 3 + 1, CELL_SIZE * 5 + 7))
      .toEqual({ cx: 0, cy: 0, ix: 3, iy: 5 });
    const negative = worldToCell(-1, -1);
    expect(negative.cx).toBe(-1);
    expect(negative.ix).toBe(CHUNK_CELLS - 1);
    expect(negative.iy).toBe(CHUNK_CELLS - 1);
  });

  it('reports the world origin of a chunk', () => {
    expect(chunkOrigin(2, -1)).toEqual({ x: 2 * CHUNK_WORLD, y: -CHUNK_WORLD });
  });

  it('lists the chunk range covering a viewport with a margin', () => {
    expect(chunkRange([0, 0, CHUNK_WORLD * 2 - 1, CHUNK_WORLD - 1], 0))
      .toEqual({ minCX: 0, maxCX: 1, minCY: 0, maxCY: 0 });
    expect(chunkRange([0, 0, 1, 1], 1))
      .toEqual({ minCX: -1, maxCX: 1, minCY: -1, maxCY: 1 });
  });

  it('indexes cells row-major', () => {
    expect(cellIndex(0, 0)).toBe(0);
    expect(cellIndex(3, 2)).toBe(2 * CHUNK_CELLS + 3);
  });
});
```

- [ ] **Шаг 2: Прогнать — падает**

Run: `npm test -- tests/chunkMath.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать `constants.ts` и `chunkMath.ts`**

`constants.ts` — блок констант из раздела **Interfaces** выше, плюс палитра:

```ts
export const TERRAIN_PALETTE = {
  landLow:      [0.086, 0.114, 0.145] as [number, number, number],
  landHigh:     [0.267, 0.294, 0.318] as [number, number, number],
  waterShallow: [0.094, 0.208, 0.298] as [number, number, number],
  waterDeep:    [0.031, 0.078, 0.137] as [number, number, number],
  line:         [0.639, 0.761, 0.859] as [number, number, number],
};
```

`chunkMath.ts`:

```ts
import { CHUNK_CELLS, CHUNK_WORLD, CELL_SIZE } from './constants';
import type { Bounds } from '../camera';

export interface ChunkCoord { cx: number; cy: number }
export interface CellCoord { cx: number; cy: number; ix: number; iy: number }

export const chunkKey = (cx: number, cy: number): string => `${cx},${cy}`;

export function parseChunkKey(key: string): ChunkCoord {
  const [cx, cy] = key.split(',');
  return { cx: Number(cx), cy: Number(cy) };
}

export function worldToChunk(wx: number, wy: number): ChunkCoord {
  return { cx: Math.floor(wx / CHUNK_WORLD), cy: Math.floor(wy / CHUNK_WORLD) };
}

export function worldToCell(wx: number, wy: number): CellCoord {
  const { cx, cy } = worldToChunk(wx, wy);
  const localX = wx - cx * CHUNK_WORLD;
  const localY = wy - cy * CHUNK_WORLD;
  return {
    cx, cy,
    ix: Math.min(CHUNK_CELLS - 1, Math.floor(localX / CELL_SIZE)),
    iy: Math.min(CHUNK_CELLS - 1, Math.floor(localY / CELL_SIZE)),
  };
}

export const chunkOrigin = (cx: number, cy: number) =>
  ({ x: cx * CHUNK_WORLD, y: cy * CHUNK_WORLD });

export function chunkRange(bounds: Bounds, margin = 1) {
  const [minX, minY, maxX, maxY] = bounds;
  return {
    minCX: Math.floor(minX / CHUNK_WORLD) - margin,
    maxCX: Math.floor(maxX / CHUNK_WORLD) + margin,
    minCY: Math.floor(minY / CHUNK_WORLD) - margin,
    maxCY: Math.floor(maxY / CHUNK_WORLD) + margin,
  };
}

export const cellIndex = (ix: number, iy: number): number => iy * CHUNK_CELLS + ix;
```

- [ ] **Шаг 4: Прогнать — проходит**

Run: `npm test -- tests/chunkMath.test.ts`
Expected: PASS, 7 тестов.

- [ ] **Шаг 5: Коммит**

```bash
git add src/map/terrain/constants.ts src/map/terrain/chunkMath.ts tests/chunkMath.test.ts
git commit -m "feat: terrain constants and chunk/cell addressing math"
```

---

## Task 2: Кодирование в Float16

**Files:**
- Create: `src/map/terrain/half.ts`
- Test: `tests/half.test.ts`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `toHalf(value: number): number` — 16-битное представление в младших битах числа.
  - `fromHalf(bits: number): number` — обратное преобразование (нужно тестам и отладке).
  - `floatsToHalfArray(source: Float32Array, target: Uint16Array): void` — заполнение готового буфера без аллокаций.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/half.test.ts`:

```ts
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
```

- [ ] **Шаг 2: Прогнать — падает**

Run: `npm test -- tests/half.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать `src/map/terrain/half.ts`**

```ts
const floatView = new Float32Array(1);
const intView = new Int32Array(floatView.buffer);

/** Классическое преобразование IEEE-754 binary32 → binary16 с округлением. */
export function toHalf(value: number): number {
  floatView[0] = value;
  const x = intView[0];

  let bits = (x >> 16) & 0x8000;              // знак
  let mantissa = (x >> 12) & 0x07ff;
  const exponent = (x >> 23) & 0xff;

  if (exponent < 103) return bits;            // слишком мало — ноль
  if (exponent > 142) {                       // переполнение — бесконечность
    bits |= 0x7c00;
    bits |= (exponent === 255 ? 0 : 1) && (x & 0x007fffff);
    return bits;
  }
  if (exponent < 113) {                       // денормализованное
    mantissa |= 0x0800;
    bits |= (mantissa >> (114 - exponent)) + ((mantissa >> (113 - exponent)) & 1);
    return bits;
  }
  bits |= ((exponent - 112) << 10) | (mantissa >> 1);
  bits += mantissa & 1;                       // округление к ближайшему
  return bits;
}

export function fromHalf(bits: number): number {
  const sign = (bits & 0x8000) ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const mantissa = bits & 0x03ff;
  if (exponent === 0) return sign * Math.pow(2, -14) * (mantissa / 1024);
  if (exponent === 31) return mantissa ? NaN : sign * Infinity;
  return sign * Math.pow(2, exponent - 15) * (1 + mantissa / 1024);
}

export function floatsToHalfArray(source: Float32Array, target: Uint16Array): void {
  for (let i = 0; i < source.length; i++) target[i] = toHalf(source[i]);
}
```

- [ ] **Шаг 4: Прогнать — проходит**

Run: `npm test -- tests/half.test.ts`
Expected: PASS, 4 теста (включая 4096 проверок round-trip).

- [ ] **Шаг 5: Коммит**

```bash
git add src/map/terrain/half.ts tests/half.test.ts
git commit -m "feat: exact float16 encoding for the terrain height range"
```

---

## Task 3: Хранилище чанков и сериализация

**Files:**
- Create: `src/map/terrain/chunkStore.ts`
- Test: `tests/chunkStore.test.ts`

**Interfaces:**
- Consumes: `chunkMath`, `constants`.
- Produces:

```ts
export interface Chunk {
  cx: number; cy: number;
  heights: Float32Array;   // длина CHUNK_CELLS²
  revision: number;        // растёт при каждом изменении — триггер загрузки в GPU
}
export interface ChunkStore {
  get(cx: number, cy: number): Chunk | undefined;
  ensure(cx: number, cy: number): Chunk;
  has(cx: number, cy: number): boolean;
  keys(): IterableIterator<string>;
  size(): number;
  /** Билинейная выборка высоты в мировых координатах; 0 для отсутствующих чанков. */
  sampleHeight(wx: number, wy: number): number;
  markDirty(cx: number, cy: number): void;
  takeDirty(): Chunk[];        // возвращает и очищает набор грязных
  hasDirty(): boolean;
  evictOutside(range: { minCX: number; maxCX: number; minCY: number; maxCY: number }): string[];
  load(cx: number, cy: number, heights: Int16Array): Chunk;
}
export function createChunkStore(): ChunkStore;
export function serializeChunk(chunk: Chunk): Uint8Array;   // Int16 little-endian
export function deserializeHeights(bytes: Uint8Array): Int16Array;
```

`evictOutside` не выбрасывает грязные чанки — они остаются до сохранения.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/chunkStore.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createChunkStore, serializeChunk, deserializeHeights } from '../src/map/terrain/chunkStore';
import { CHUNK_CELLS, CHUNK_WORLD, CELL_SIZE } from '../src/map/terrain/constants';
import { cellIndex } from '../src/map/terrain/chunkMath';

describe('chunk store', () => {
  it('creates a zero-filled chunk on demand', () => {
    const store = createChunkStore();
    const chunk = store.ensure(0, 0);
    expect(chunk.heights.length).toBe(CHUNK_CELLS * CHUNK_CELLS);
    expect(chunk.heights.every((h) => h === 0)).toBe(true);
  });

  it('returns the same chunk instance for the same coordinates', () => {
    const store = createChunkStore();
    expect(store.ensure(1, 2)).toBe(store.ensure(1, 2));
  });

  it('samples zero where no chunk exists', () => {
    expect(createChunkStore().sampleHeight(99999, 99999)).toBe(0);
  });

  it('samples the stored height at a cell centre', () => {
    const store = createChunkStore();
    const chunk = store.ensure(0, 0);
    chunk.heights.fill(120);
    expect(store.sampleHeight(CELL_SIZE * 4 + CELL_SIZE / 2, CELL_SIZE * 4 + CELL_SIZE / 2))
      .toBeCloseTo(120, 5);
  });

  it('interpolates between neighbouring cells', () => {
    const store = createChunkStore();
    const chunk = store.ensure(0, 0);
    chunk.heights[cellIndex(0, 0)] = 0;
    chunk.heights[cellIndex(1, 0)] = 100;
    const midX = CELL_SIZE;              // ровно между центрами (0,0) и (1,0)
    const midY = CELL_SIZE / 2;
    expect(store.sampleHeight(midX, midY)).toBeCloseTo(50, 4);
  });

  it('tracks dirty chunks and clears them when taken', () => {
    const store = createChunkStore();
    store.ensure(0, 0);
    store.markDirty(0, 0);
    store.markDirty(0, 0);
    expect(store.hasDirty()).toBe(true);
    expect(store.takeDirty().map((c) => [c.cx, c.cy])).toEqual([[0, 0]]);
    expect(store.hasDirty()).toBe(false);
  });

  it('evicts chunks outside the range but keeps dirty ones', () => {
    const store = createChunkStore();
    store.ensure(0, 0);
    store.ensure(50, 50);
    store.markDirty(50, 50);
    const evicted = store.evictOutside({ minCX: -1, maxCX: 1, minCY: -1, maxCY: 1 });
    expect(evicted).toEqual([]);
    store.takeDirty();
    expect(store.evictOutside({ minCX: -1, maxCX: 1, minCY: -1, maxCY: 1 })).toEqual(['50,50']);
    expect(store.has(50, 50)).toBe(false);
  });

  it('round-trips a chunk through Int16 little-endian bytes', () => {
    const store = createChunkStore();
    const chunk = store.ensure(0, 0);
    chunk.heights[0] = -2048;
    chunk.heights[1] = 2047;
    chunk.heights[2] = 3.7;              // округляется
    const bytes = serializeChunk(chunk);
    expect(bytes.length).toBe(CHUNK_CELLS * CHUNK_CELLS * 2);
    const restored = deserializeHeights(bytes);
    expect(restored[0]).toBe(-2048);
    expect(restored[1]).toBe(2047);
    expect(restored[2]).toBe(4);
  });

  it('clamps out-of-range heights during serialisation', () => {
    const store = createChunkStore();
    const chunk = store.ensure(0, 0);
    chunk.heights[0] = 99999;
    chunk.heights[1] = -99999;
    const restored = deserializeHeights(serializeChunk(chunk));
    expect(restored[0]).toBe(2047);
    expect(restored[1]).toBe(-2048);
  });

  it('loads heights from Int16 data and bumps the revision', () => {
    const store = createChunkStore();
    const before = store.ensure(3, 3).revision;
    const data = new Int16Array(CHUNK_CELLS * CHUNK_CELLS).fill(77);
    const chunk = store.load(3, 3, data);
    expect(chunk.heights[0]).toBe(77);
    expect(chunk.revision).toBeGreaterThan(before);
  });
});
```

- [ ] **Шаг 2: Прогнать — падает**

Run: `npm test -- tests/chunkStore.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать `src/map/terrain/chunkStore.ts`**

```ts
import { CHUNK_CELLS, CELL_SIZE, HEIGHT_MIN, HEIGHT_MAX } from './constants';
import { chunkKey, cellIndex } from './chunkMath';

export interface Chunk {
  cx: number;
  cy: number;
  heights: Float32Array;
  revision: number;
}

export interface ChunkStore {
  get(cx: number, cy: number): Chunk | undefined;
  ensure(cx: number, cy: number): Chunk;
  has(cx: number, cy: number): boolean;
  keys(): IterableIterator<string>;
  size(): number;
  sampleHeight(wx: number, wy: number): number;
  markDirty(cx: number, cy: number): void;
  takeDirty(): Chunk[];
  hasDirty(): boolean;
  evictOutside(range: { minCX: number; maxCX: number; minCY: number; maxCY: number }): string[];
  load(cx: number, cy: number, heights: Int16Array): Chunk;
}

const CELLS = CHUNK_CELLS * CHUNK_CELLS;

export function createChunkStore(): ChunkStore {
  const chunks = new Map<string, Chunk>();
  const dirty = new Set<string>();

  const get = (cx: number, cy: number) => chunks.get(chunkKey(cx, cy));

  function ensure(cx: number, cy: number): Chunk {
    const key = chunkKey(cx, cy);
    let chunk = chunks.get(key);
    if (!chunk) {
      chunk = { cx, cy, heights: new Float32Array(CELLS), revision: 1 };
      chunks.set(key, chunk);
    }
    return chunk;
  }

  /** Читает высоту ячейки, при выходе за чанк идёт в соседний. */
  function readCell(cx: number, cy: number, ix: number, iy: number): number {
    let ncx = cx, ncy = cy, nix = ix, niy = iy;
    while (nix < 0) { nix += CHUNK_CELLS; ncx -= 1; }
    while (nix >= CHUNK_CELLS) { nix -= CHUNK_CELLS; ncx += 1; }
    while (niy < 0) { niy += CHUNK_CELLS; ncy -= 1; }
    while (niy >= CHUNK_CELLS) { niy -= CHUNK_CELLS; ncy += 1; }
    const chunk = get(ncx, ncy);
    return chunk ? chunk.heights[cellIndex(nix, niy)] : 0;
  }

  function sampleHeight(wx: number, wy: number): number {
    // Центр ячейки (ix,iy) лежит в мире на (ix + 0.5) * CELL_SIZE.
    const gx = wx / CELL_SIZE - 0.5;
    const gy = wy / CELL_SIZE - 0.5;
    const g0x = Math.floor(gx);
    const g0y = Math.floor(gy);
    const tx = gx - g0x;
    const ty = gy - g0y;

    const cx = Math.floor(g0x / CHUNK_CELLS);
    const cy = Math.floor(g0y / CHUNK_CELLS);
    const ix = g0x - cx * CHUNK_CELLS;
    const iy = g0y - cy * CHUNK_CELLS;

    const h00 = readCell(cx, cy, ix, iy);
    const h10 = readCell(cx, cy, ix + 1, iy);
    const h01 = readCell(cx, cy, ix, iy + 1);
    const h11 = readCell(cx, cy, ix + 1, iy + 1);

    return (h00 * (1 - tx) + h10 * tx) * (1 - ty) + (h01 * (1 - tx) + h11 * tx) * ty;
  }

  return {
    get, ensure,
    has: (cx, cy) => chunks.has(chunkKey(cx, cy)),
    keys: () => chunks.keys(),
    size: () => chunks.size,
    sampleHeight,

    markDirty(cx, cy) { dirty.add(chunkKey(cx, cy)); },
    hasDirty: () => dirty.size > 0,

    takeDirty() {
      const result: Chunk[] = [];
      for (const key of dirty) {
        const chunk = chunks.get(key);
        if (chunk) result.push(chunk);
      }
      dirty.clear();
      return result;
    },

    evictOutside(range) {
      const evicted: string[] = [];
      for (const key of [...chunks.keys()]) {
        if (dirty.has(key)) continue;
        const chunk = chunks.get(key)!;
        if (chunk.cx < range.minCX || chunk.cx > range.maxCX ||
            chunk.cy < range.minCY || chunk.cy > range.maxCY) {
          chunks.delete(key);
          evicted.push(key);
        }
      }
      return evicted;
    },

    load(cx, cy, heights) {
      const chunk = ensure(cx, cy);
      for (let i = 0; i < CELLS; i++) chunk.heights[i] = heights[i];
      chunk.revision += 1;
      return chunk;
    },
  };
}

export function serializeChunk(chunk: Chunk): Uint8Array {
  const out = new Int16Array(CELLS);
  for (let i = 0; i < CELLS; i++) {
    const rounded = Math.round(chunk.heights[i]);
    out[i] = Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, rounded));
  }
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

export function deserializeHeights(bytes: Uint8Array): Int16Array {
  const copy = bytes.slice();   // выравнивание по 2 байта не гарантировано
  return new Int16Array(copy.buffer, copy.byteOffset, copy.byteLength / 2);
}
```

Замечание про порядок байт: `Int16Array` в браузере всегда little-endian на
всех поддерживаемых платформах (x86, ARM), поэтому явное перекладывание
через `DataView` не нужно.

- [ ] **Шаг 4: Прогнать — проходит**

Run: `npm test -- tests/chunkStore.test.ts`
Expected: PASS, 10 тестов.

- [ ] **Шаг 5: Коммит**

```bash
git add src/map/terrain/chunkStore.ts tests/chunkStore.test.ts
git commit -m "feat: CPU-authoritative chunk store with bilinear sampling and Int16 serialisation"
```

---

## Task 4: Математика кисти

**Files:**
- Create: `src/map/terrain/brush.ts`
- Test: `tests/brush.test.ts`

**Interfaces:**
- Consumes: `ChunkStore`, `chunkMath`, `constants`.
- Produces:
  - `interface BrushSettings { radius: number; strength: number; mode: 'raise' | 'lower' }` — `radius` в мировых единицах, `strength` — изменение высоты в центре за один штамп.
  - `falloff(distance: number, radius: number): number` — `(1 - t²)²`, мягкие края (ТЗ §5.4).
  - `stampBrush(store: ChunkStore, worldX: number, worldY: number, settings: BrushSettings): void`
  - `strokeBrush(store, fromX, fromY, toX, toY, settings): void` — штампы вдоль отрезка с шагом `radius / 4`, чтобы быстрое движение мыши не давало «горошин».

- [ ] **Шаг 1: Написать падающие тесты**

`tests/brush.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { falloff, stampBrush, strokeBrush } from '../src/map/terrain/brush';
import { createChunkStore } from '../src/map/terrain/chunkStore';
import { CELL_SIZE, CHUNK_WORLD, HEIGHT_MAX, HEIGHT_MIN } from '../src/map/terrain/constants';
import { cellIndex } from '../src/map/terrain/chunkMath';

describe('falloff', () => {
  it('is 1 at the centre and 0 at the rim', () => {
    expect(falloff(0, 100)).toBe(1);
    expect(falloff(100, 100)).toBe(0);
    expect(falloff(150, 100)).toBe(0);
  });
  it('is smooth and monotonically decreasing', () => {
    expect(falloff(50, 100)).toBeCloseTo(0.5625, 6);
    expect(falloff(25, 100)).toBeGreaterThan(falloff(75, 100));
  });
});

describe('stampBrush', () => {
  it('raises the centre by the full strength', () => {
    const store = createChunkStore();
    const centre = CELL_SIZE * 8 + CELL_SIZE / 2;
    stampBrush(store, centre, centre, { radius: CELL_SIZE * 4, strength: 100, mode: 'raise' });
    expect(store.get(0, 0)!.heights[cellIndex(8, 8)]).toBeCloseTo(100, 4);
  });

  it('lowers when the mode is lower', () => {
    const store = createChunkStore();
    const centre = CELL_SIZE * 8 + CELL_SIZE / 2;
    stampBrush(store, centre, centre, { radius: CELL_SIZE * 4, strength: 100, mode: 'lower' });
    expect(store.get(0, 0)!.heights[cellIndex(8, 8)]).toBeCloseTo(-100, 4);
  });

  it('leaves cells outside the radius untouched', () => {
    const store = createChunkStore();
    const centre = CELL_SIZE * 8 + CELL_SIZE / 2;
    stampBrush(store, centre, centre, { radius: CELL_SIZE * 2, strength: 100, mode: 'raise' });
    expect(store.get(0, 0)!.heights[cellIndex(30, 30)]).toBe(0);
  });

  it('marks the touched chunk dirty', () => {
    const store = createChunkStore();
    const middle = CHUNK_WORLD / 2;
    stampBrush(store, middle, middle, { radius: 20, strength: 10, mode: 'raise' });
    expect(store.takeDirty().map((c) => [c.cx, c.cy])).toEqual([[0, 0]]);
  });

  it('does not create neighbouring chunks the round brush never reaches', () => {
    const store = createChunkStore();
    const middle = CHUNK_WORLD / 2;
    stampBrush(store, middle, middle, { radius: 20, strength: 10, mode: 'raise' });
    expect(store.size()).toBe(1);
  });

  it('spills into a neighbour only where cells are actually covered', () => {
    const store = createChunkStore();
    // Кисть у самого начала координат достаёт до всех четырёх соседних чанков.
    stampBrush(store, 10, 10, { radius: 20, strength: 10, mode: 'raise' });
    const touched = store.takeDirty().map((c) => `${c.cx},${c.cy}`).sort();
    expect(touched).toEqual(['-1,-1', '-1,0', '0,-1', '0,0']);
  });

  it('spills across a chunk boundary and marks both chunks dirty', () => {
    const store = createChunkStore();
    stampBrush(store, CHUNK_WORLD, CHUNK_WORLD / 2, { radius: CELL_SIZE * 6, strength: 50, mode: 'raise' });
    const touched = store.takeDirty().map((c) => `${c.cx},${c.cy}`).sort();
    expect(touched).toContain('0,0');
    expect(touched).toContain('1,0');
  });

  it('clamps to the terrain height range', () => {
    const store = createChunkStore();
    const centre = CELL_SIZE * 8 + CELL_SIZE / 2;
    for (let i = 0; i < 200; i++) {
      stampBrush(store, centre, centre, { radius: CELL_SIZE * 3, strength: 500, mode: 'raise' });
    }
    expect(store.get(0, 0)!.heights[cellIndex(8, 8)]).toBe(HEIGHT_MAX);
    for (let i = 0; i < 400; i++) {
      stampBrush(store, centre, centre, { radius: CELL_SIZE * 3, strength: 500, mode: 'lower' });
    }
    expect(store.get(0, 0)!.heights[cellIndex(8, 8)]).toBe(HEIGHT_MIN);
  });

  it('bumps the chunk revision so the GPU texture is refreshed', () => {
    const store = createChunkStore();
    const before = store.ensure(0, 0).revision;
    stampBrush(store, 10, 10, { radius: 20, strength: 10, mode: 'raise' });
    expect(store.get(0, 0)!.revision).toBeGreaterThan(before);
  });
});

describe('strokeBrush', () => {
  it('paints a continuous band between two distant points', () => {
    const store = createChunkStore();
    const settings = { radius: CELL_SIZE * 2, strength: 100, mode: 'raise' as const };
    strokeBrush(store, CELL_SIZE * 4, CELL_SIZE * 4, CELL_SIZE * 40, CELL_SIZE * 4, settings);
    const heights = store.get(0, 0)!.heights;
    for (let ix = 5; ix <= 39; ix++) {
      expect(heights[cellIndex(ix, 4)]).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Шаг 2: Прогнать — падает**

Run: `npm test -- tests/brush.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать `src/map/terrain/brush.ts`**

```ts
import type { ChunkStore } from './chunkStore';
import { CELL_SIZE, CHUNK_CELLS, CHUNK_WORLD, HEIGHT_MIN, HEIGHT_MAX } from './constants';
import { cellIndex } from './chunkMath';

export interface BrushSettings {
  radius: number;                 // мировые единицы
  strength: number;               // изменение высоты в центре за штамп
  mode: 'raise' | 'lower';
}

/** Мягкие растушёванные края без ступенек (ТЗ §5.4). */
export function falloff(distance: number, radius: number): number {
  if (radius <= 0) return 0;
  const t = distance / radius;
  if (t >= 1) return 0;
  const k = 1 - t * t;
  return k * k;
}

export function stampBrush(
  store: ChunkStore, worldX: number, worldY: number, settings: BrushSettings,
): void {
  const { radius, strength, mode } = settings;
  if (radius <= 0 || strength === 0) return;
  const signedStrength = mode === 'lower' ? -strength : strength;

  const minCX = Math.floor((worldX - radius) / CHUNK_WORLD);
  const maxCX = Math.floor((worldX + radius) / CHUNK_WORLD);
  const minCY = Math.floor((worldY - radius) / CHUNK_WORLD);
  const maxCY = Math.floor((worldY + radius) / CHUNK_WORLD);

  for (let cy = minCY; cy <= maxCY; cy++) {
    for (let cx = minCX; cx <= maxCX; cx++) {
      const originX = cx * CHUNK_WORLD;
      const originY = cy * CHUNK_WORLD;

      const ix0 = Math.max(0, Math.floor((worldX - radius - originX) / CELL_SIZE));
      const ix1 = Math.min(CHUNK_CELLS - 1, Math.ceil((worldX + radius - originX) / CELL_SIZE));
      const iy0 = Math.max(0, Math.floor((worldY - radius - originY) / CELL_SIZE));
      const iy1 = Math.min(CHUNK_CELLS - 1, Math.ceil((worldY + radius - originY) / CELL_SIZE));

      // Чанк создаётся только когда под кисть реально попала хоть одна ячейка:
      // круглая кисть не покрывает углы своего bbox, и пустые чанки на краях
      // иначе засоряли бы хранилище и уходили бы на сервер как «изменённые».
      let chunk: ReturnType<ChunkStore['ensure']> | undefined;
      for (let iy = iy0; iy <= iy1; iy++) {
        const cellY = originY + (iy + 0.5) * CELL_SIZE;
        for (let ix = ix0; ix <= ix1; ix++) {
          const cellX = originX + (ix + 0.5) * CELL_SIZE;
          const weight = falloff(Math.hypot(cellX - worldX, cellY - worldY), radius);
          if (weight === 0) continue;
          chunk ??= store.ensure(cx, cy);
          const index = cellIndex(ix, iy);
          const next = chunk.heights[index] + signedStrength * weight;
          chunk.heights[index] = Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, next));
        }
      }
      if (chunk) {
        chunk.revision += 1;
        store.markDirty(cx, cy);
      }
    }
  }
}

export function strokeBrush(
  store: ChunkStore,
  fromX: number, fromY: number, toX: number, toY: number,
  settings: BrushSettings,
): void {
  const distance = Math.hypot(toX - fromX, toY - fromY);
  const spacing = Math.max(settings.radius / 4, CELL_SIZE / 2);
  const steps = Math.max(1, Math.ceil(distance / spacing));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    stampBrush(store, fromX + (toX - fromX) * t, fromY + (toY - fromY) * t, settings);
  }
}
```

- [ ] **Шаг 4: Прогнать — проходит**

Run: `npm test -- tests/brush.test.ts`
Expected: PASS, 10 тестов.

- [ ] **Шаг 5: Коммит**

```bash
git add src/map/terrain/brush.ts tests/brush.test.ts
git commit -m "feat: soft-edged terrain brush with raise/lower stamps and stroke interpolation"
```

---

## Task 5: Сборка текстурных данных с фартуком

**Files:**
- Create: `src/map/terrain/apron.ts`
- Test: `tests/apron.test.ts`

**Interfaces:**
- Consumes: `ChunkStore`, `toHalf`, `constants`, `chunkMath`.
- Produces:
  - `texIndex(col: number, row: number): number` — `row * TEX_SIZE + col`, где `col/row` от 0 до 65.
  - `buildChunkTextureData(store: ChunkStore, cx: number, cy: number, target: Uint16Array): void` —
    заполняет буфер длины `TEX_SIZE²` значениями Float16. Внутренние 64×64 —
    высоты самого чанка; однопиксельная рамка — высоты соседних чанков (или
    повтор собственного края, если сосед не загружен).

Фартук обязателен: без него `fwidth()` и центральные разности на границе
чанка берут пиксель с другой стороны текстуры, и на стыках появляются
разрывы изолиний и полосы освещения.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/apron.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildChunkTextureData, texIndex } from '../src/map/terrain/apron';
import { createChunkStore } from '../src/map/terrain/chunkStore';
import { TEX_SIZE, CHUNK_CELLS } from '../src/map/terrain/constants';
import { fromHalf } from '../src/map/terrain/half';
import { cellIndex } from '../src/map/terrain/chunkMath';

const read = (buffer: Uint16Array, col: number, row: number) =>
  fromHalf(buffer[texIndex(col, row)]);

describe('chunk texture data', () => {
  it('places chunk cells in the interior of the texture', () => {
    const store = createChunkStore();
    store.ensure(0, 0).heights[cellIndex(0, 0)] = 42;
    const buffer = new Uint16Array(TEX_SIZE * TEX_SIZE);
    buildChunkTextureData(store, 0, 0, buffer);
    expect(read(buffer, 1, 1)).toBe(42);
  });

  it('fills the apron from the neighbouring chunk', () => {
    const store = createChunkStore();
    store.ensure(0, 0).heights.fill(5);
    store.ensure(-1, 0).heights.fill(9);
    const buffer = new Uint16Array(TEX_SIZE * TEX_SIZE);
    buildChunkTextureData(store, 0, 0, buffer);
    expect(read(buffer, 0, 1)).toBe(9);        // левая колонка фартука
    expect(read(buffer, 1, 1)).toBe(5);
  });

  it('repeats its own edge when the neighbour is not loaded', () => {
    const store = createChunkStore();
    store.ensure(0, 0).heights.fill(5);
    const buffer = new Uint16Array(TEX_SIZE * TEX_SIZE);
    buildChunkTextureData(store, 0, 0, buffer);
    expect(read(buffer, 0, 1)).toBe(5);
    expect(read(buffer, TEX_SIZE - 1, 1)).toBe(5);
  });

  it('fills all four corners of the apron', () => {
    const store = createChunkStore();
    store.ensure(0, 0).heights.fill(1);
    store.ensure(-1, -1).heights.fill(7);
    const buffer = new Uint16Array(TEX_SIZE * TEX_SIZE);
    buildChunkTextureData(store, 0, 0, buffer);
    expect(read(buffer, 0, 0)).toBe(7);
  });

  it('writes every texel', () => {
    const store = createChunkStore();
    store.ensure(0, 0).heights.fill(3);
    const buffer = new Uint16Array(TEX_SIZE * TEX_SIZE).fill(0xffff);
    buildChunkTextureData(store, 0, 0, buffer);
    expect(buffer.every((v) => v !== 0xffff)).toBe(true);
  });
});
```

- [ ] **Шаг 2: Прогнать — падает**

Run: `npm test -- tests/apron.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать `src/map/terrain/apron.ts`**

```ts
import type { ChunkStore } from './chunkStore';
import { CHUNK_CELLS, TEX_SIZE, APRON } from './constants';
import { cellIndex } from './chunkMath';
import { toHalf } from './half';

export const texIndex = (col: number, row: number): number => row * TEX_SIZE + col;

/**
 * Читает ячейку (ix, iy) чанка (cx, cy), допуская выход за границы:
 * -1 и CHUNK_CELLS уводят в соседний чанк. Если сосед не загружен —
 * повторяем собственный крайний столбец/строку, чтобы не было ступеньки.
 */
function readWithNeighbours(
  store: ChunkStore, cx: number, cy: number, ix: number, iy: number, own: Float32Array,
): number {
  let ncx = cx, ncy = cy, nix = ix, niy = iy;
  if (nix < 0) { nix += CHUNK_CELLS; ncx -= 1; }
  else if (nix >= CHUNK_CELLS) { nix -= CHUNK_CELLS; ncx += 1; }
  if (niy < 0) { niy += CHUNK_CELLS; ncy -= 1; }
  else if (niy >= CHUNK_CELLS) { niy -= CHUNK_CELLS; ncy += 1; }

  if (ncx === cx && ncy === cy) return own[cellIndex(nix, niy)];

  const neighbour = store.get(ncx, ncy);
  if (neighbour) return neighbour.heights[cellIndex(nix, niy)];

  const clampedX = Math.max(0, Math.min(CHUNK_CELLS - 1, ix));
  const clampedY = Math.max(0, Math.min(CHUNK_CELLS - 1, iy));
  return own[cellIndex(clampedX, clampedY)];
}

export function buildChunkTextureData(
  store: ChunkStore, cx: number, cy: number, target: Uint16Array,
): void {
  const own = store.ensure(cx, cy).heights;
  for (let row = 0; row < TEX_SIZE; row++) {
    const iy = row - APRON;
    for (let col = 0; col < TEX_SIZE; col++) {
      const ix = col - APRON;
      const height = (ix >= 0 && ix < CHUNK_CELLS && iy >= 0 && iy < CHUNK_CELLS)
        ? own[cellIndex(ix, iy)]
        : readWithNeighbours(store, cx, cy, ix, iy, own);
      target[texIndex(col, row)] = toHalf(height);
    }
  }
}
```

- [ ] **Шаг 4: Прогнать — проходит**

Run: `npm test -- tests/apron.test.ts`
Expected: PASS, 5 тестов.

- [ ] **Шаг 5: Коммит**

```bash
git add src/map/terrain/apron.ts tests/apron.test.ts
git commit -m "feat: chunk texture assembly with one-cell apron for seamless chunk edges"
```

---

## Task 6: Шейдер и слой рельефа — один чанк

**Files:**
- Create: `src/map/terrain/terrain.frag.ts`, `src/map/terrain/terrainLayer.ts`
- Modify: `src/map/MapCanvas.tsx`

Это самая рискованная задача плана (ТЗ §14 п. 7 предупреждает об этом).
Сначала — один чанк на экране, визуальная проверка, только потом Task 7.

**Interfaces:**
- Consumes: `ChunkStore`, `buildChunkTextureData`, `constants`, `TERRAIN_PALETTE`, `useEntities.seaLevel`.
- Produces:

```ts
export const TERRAIN_FRAGMENT: string;    // terrain.frag.ts
export interface TerrainLayer {
  view: Container;
  store: ChunkStore;
  update(camera: Camera, viewport: Viewport): void;   // подгрузка/выгрузка + обновление текстур
  invalidate(cx: number, cy: number): void;           // пометить чанк к перезаливке в GPU
  destroy(): void;
}
export function createTerrainLayer(store: ChunkStore): TerrainLayer;
```

- [ ] **Шаг 1: Написать фрагментный шейдер**

`src/map/terrain/terrain.frag.ts`:

```ts
export const TERRAIN_FRAGMENT = /* glsl */ `
precision highp float;

in vec2 vUV;
out vec4 finalColor;

uniform sampler2D uHeight;

uniform vec2  uUvOrigin;       // APRON / TEX_SIZE
uniform vec2  uUvScale;        // CHUNK_CELLS / TEX_SIZE
uniform float uSeaLevel;
uniform float uContourStep;
uniform float uMajorEvery;
uniform float uCellSize;
uniform vec3  uLandLow;
uniform vec3  uLandHigh;
uniform vec3  uWaterShallow;
uniform vec3  uWaterDeep;
uniform vec3  uLineColor;

void main() {
  vec2 uv = uUvOrigin + vUV * uUvScale;
  vec2 texel = vec2(1.0) / vec2(textureSize(uHeight, 0));

  float h  = texture(uHeight, uv).r;
  float hx = texture(uHeight, uv + vec2(texel.x, 0.0)).r
           - texture(uHeight, uv - vec2(texel.x, 0.0)).r;
  float hy = texture(uHeight, uv + vec2(0.0, texel.y)).r
           - texture(uHeight, uv - vec2(0.0, texel.y)).r;

  // Мягкое освещение по градиенту высоты: круче склон — темнее (ТЗ §5.3).
  vec3 normal = normalize(vec3(-hx, -hy, 2.0 * uCellSize));
  float lambert = clamp(dot(normal, normalize(vec3(-0.55, -0.75, 0.65))), 0.0, 1.0);

  float above = h - uSeaLevel;
  vec3 color;

  if (above >= 0.0) {
    color = mix(uLandLow, uLandHigh, clamp(above / 900.0, 0.0, 1.0));
    color *= 0.58 + 0.62 * lambert;
  } else {
    // Вода появляется автоматически ниже уровня моря (ТЗ §5.3).
    float depth = clamp(-above / 500.0, 0.0, 1.0);
    color = mix(uWaterShallow, uWaterDeep, depth);
    // Свечение на стыке рельефа и воды — как на референсе (ТЗ §5.1).
    color += vec3(0.10, 0.18, 0.22) * (1.0 - smoothstep(0.0, 28.0, -above));
  }

  // Изолинии: расстояние до ближайшей ступени, нормированное экранной
  // производной — толщина линии постоянна на любом зуме (ТЗ §5.3).
  float f = h / uContourStep;
  float minor = 1.0 - smoothstep(0.0, fwidth(f) * 1.1, abs(fract(f + 0.5) - 0.5));

  float fm = h / (uContourStep * uMajorEvery);
  float major = 1.0 - smoothstep(0.0, fwidth(fm) * 1.1, abs(fract(fm + 0.5) - 0.5));

  float lineStrength = clamp(minor * 0.30 + major * 0.55, 0.0, 1.0);
  if (above < 0.0) lineStrength *= 0.45;
  color = mix(color, uLineColor, lineStrength);

  // Береговая линия — самая контрастная изолиния карты.
  float coast = 1.0 - smoothstep(0.0, fwidth(above) * 1.4, abs(above));
  color = mix(color, uLineColor, coast * 0.85);

  finalColor = vec4(color, 1.0);
}
`;

export const TERRAIN_VERTEX = /* glsl */ `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}
`;
```

- [ ] **Шаг 2: Реализовать `src/map/terrain/terrainLayer.ts`**

```ts
import {
  Container, Mesh, MeshGeometry, Shader, GlProgram, Texture, BufferImageSource,
} from 'pixi.js';
import type { Camera, Viewport } from '../camera';
import { visibleWorldBounds } from '../camera';
import type { ChunkStore } from './chunkStore';
import { buildChunkTextureData } from './apron';
import { chunkKey, chunkRange, chunkOrigin } from './chunkMath';
import {
  CHUNK_WORLD, CHUNK_CELLS, TEX_SIZE, APRON, CELL_SIZE,
  DEFAULT_CONTOUR_STEP, MAJOR_CONTOUR_EVERY, TERRAIN_PALETTE,
} from './constants';
import { TERRAIN_FRAGMENT, TERRAIN_VERTEX } from './terrain.frag';
import { useEntities } from '../../state/entities';

interface ChunkView {
  mesh: Mesh;
  source: BufferImageSource;
  buffer: Uint16Array;
  uploadedRevision: number;
}

export interface TerrainLayer {
  view: Container;
  store: ChunkStore;
  update(camera: Camera, viewport: Viewport): void;
  invalidate(cx: number, cy: number): void;
  destroy(): void;
}

export function createTerrainLayer(store: ChunkStore): TerrainLayer {
  const view = new Container();
  const views = new Map<string, ChunkView>();
  const program = GlProgram.from({ vertex: TERRAIN_VERTEX, fragment: TERRAIN_FRAGMENT });

  function makeChunkView(cx: number, cy: number): ChunkView {
    const origin = chunkOrigin(cx, cy);
    const geometry = new MeshGeometry({
      positions: new Float32Array([
        origin.x, origin.y,
        origin.x + CHUNK_WORLD, origin.y,
        origin.x + CHUNK_WORLD, origin.y + CHUNK_WORLD,
        origin.x, origin.y + CHUNK_WORLD,
      ]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });

    const buffer = new Uint16Array(TEX_SIZE * TEX_SIZE);
    const source = new BufferImageSource({
      resource: buffer,
      width: TEX_SIZE,
      height: TEX_SIZE,
      format: 'r16float',
      scaleMode: 'linear',
      addressMode: 'clamp-to-edge',
    });

    const shader = new Shader({
      glProgram: program,
      resources: {
        uHeight: source,
        terrainUniforms: {
          uUvOrigin:     { value: new Float32Array([APRON / TEX_SIZE, APRON / TEX_SIZE]), type: 'vec2<f32>' },
          uUvScale:      { value: new Float32Array([CHUNK_CELLS / TEX_SIZE, CHUNK_CELLS / TEX_SIZE]), type: 'vec2<f32>' },
          uSeaLevel:     { value: 0, type: 'f32' },
          uContourStep:  { value: DEFAULT_CONTOUR_STEP, type: 'f32' },
          uMajorEvery:   { value: MAJOR_CONTOUR_EVERY, type: 'f32' },
          uCellSize:     { value: CELL_SIZE, type: 'f32' },
          uLandLow:      { value: new Float32Array(TERRAIN_PALETTE.landLow), type: 'vec3<f32>' },
          uLandHigh:     { value: new Float32Array(TERRAIN_PALETTE.landHigh), type: 'vec3<f32>' },
          uWaterShallow: { value: new Float32Array(TERRAIN_PALETTE.waterShallow), type: 'vec3<f32>' },
          uWaterDeep:    { value: new Float32Array(TERRAIN_PALETTE.waterDeep), type: 'vec3<f32>' },
          uLineColor:    { value: new Float32Array(TERRAIN_PALETTE.line), type: 'vec3<f32>' },
        },
      },
    });

    const mesh = new Mesh({ geometry, shader });
    view.addChild(mesh);
    return { mesh, source, buffer, uploadedRevision: -1 };
  }

  function upload(cx: number, cy: number, chunkView: ChunkView) {
    buildChunkTextureData(store, cx, cy, chunkView.buffer);
    chunkView.source.update();
  }

  function update(camera: Camera, viewport: Viewport) {
    const range = chunkRange(visibleWorldBounds(camera, viewport), 1);
    const seaLevel = useEntities.getState().seaLevel;
    const wanted = new Set<string>();

    for (let cy = range.minCY; cy <= range.maxCY; cy++) {
      for (let cx = range.minCX; cx <= range.maxCX; cx++) {
        const key = chunkKey(cx, cy);
        wanted.add(key);

        let chunkView = views.get(key);
        if (!chunkView) {
          chunkView = makeChunkView(cx, cy);
          views.set(key, chunkView);
        }

        const chunk = store.ensure(cx, cy);
        if (chunk.revision !== chunkView.uploadedRevision) {
          upload(cx, cy, chunkView);
          chunkView.uploadedRevision = chunk.revision;
        }

        const uniforms = (chunkView.mesh.shader as Shader).resources.terrainUniforms.uniforms;
        uniforms.uSeaLevel = seaLevel;
      }
    }

    for (const [key, chunkView] of [...views]) {
      if (wanted.has(key)) continue;
      view.removeChild(chunkView.mesh);
      chunkView.mesh.destroy(true);
      chunkView.source.destroy();
      views.delete(key);
    }

    store.evictOutside(range);
  }

  return {
    view, store, update,
    invalidate(cx, cy) {
      const chunkView = views.get(chunkKey(cx, cy));
      if (chunkView) chunkView.uploadedRevision = -1;
    },
    destroy() {
      for (const chunkView of views.values()) {
        chunkView.mesh.destroy(true);
        chunkView.source.destroy();
      }
      views.clear();
      view.destroy({ children: true });
    },
  };
}
```

- [ ] **Шаг 3: Подключить слой и проверить компиляцию шейдера**

Добавить `terrain.view` в `created.layers.terrain` **под** сеткой (или вместо
неё, если сетка мешает читать рельеф) и вызывать `terrain.update(camera, viewport)`
в `redraw`.

Run: `npm run dev`, открыть консоль браузера.
Expected: **никаких** ошибок компиляции шейдера.

Если шейдер не компилируется:
1. Ошибка про `in`/`out`/`texture`/`textureSize`/`finalColor` → добавить
   первой строкой обоих исходников `#version 300 es`.
2. Ошибка про `fwidth` → включён контекст WebGL1; убедиться, что
   `app.init({ preference: 'webgl' })` даёт WebGL2 (проверить
   `app.renderer.gl instanceof WebGL2RenderingContext`).
3. Ошибка про формат `r16float` → Pixi не смапил формат в этой версии.
   Fallback: сменить формат на `'rgba16float'`, писать высоту во все четыре
   канала (буфер `TEX_SIZE² * 4`), в шейдере продолжать читать `.r`.
   Тесты `apron.test.ts` при этом не меняются — меняется только раскладка
   буфера в `terrainLayer.ts`; вынести раскладку в отдельную функцию
   `packHeights(buffer, halfValues)` и покрыть её тестом.

- [ ] **Шаг 4: Проверить визуально на одном чанке**

Временно в `main.tsx` после загрузки карты нарисовать тестовый рельеф:

```ts
import { stampBrush } from './map/terrain/brush';
// ... store — тот же экземпляр, что отдан в createTerrainLayer
for (let i = 0; i < 24; i++) {
  stampBrush(store, 120 + i * 14, 200 + Math.sin(i / 3) * 90,
             { radius: 90, strength: 140, mode: 'raise' });
}
stampBrush(store, 380, 380, { radius: 200, strength: 400, mode: 'lower' });
```

Expected: тёмный фон, светлые извилистые изолинии по холму, синее озеро в
месте понижения, у берега — светлая кайма; при зуме толщина изолиний на
экране не меняется. Сравнить со скриншотом-референсом из ТЗ §5.1.
Сделать скриншот через Playwright MCP, сравнить, удалить скриншот.

- [ ] **Шаг 5: Убрать временный код и закоммитить**

```bash
git add src/map/terrain/terrain.frag.ts src/map/terrain/terrainLayer.ts src/map/MapCanvas.tsx
git commit -m "feat: GPU terrain shader with contour lines, slope shading and automatic water"
```

---

## Task 7: Инструмент «Рельеф», панель настроек и множество чанков

**Files:**
- Create: `src/map/terrain/terrainTool.ts`, `src/ui/TerrainPanel.tsx`
- Modify: `src/map/MapCanvas.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `strokeBrush`, `stampBrush`, `TerrainLayer`, `useAppStore`, `useEntities`, `repository.setSeaLevel`.
- Produces:
  - `useTerrainTool` — Zustand-стор: `{ radius: number; strength: number; mode: 'raise'|'lower'; setRadius; setStrength; setMode }`,
    значения по умолчанию `radius = 120`, `strength = 60`, `mode = 'raise'`.
  - `makeTerrainHandlers(layer: TerrainLayer, onStrokeEnd: () => void): FreehandHandlers`
  - `<TerrainPanel />` — видна только при `tool === 'terrain'`: слайдеры радиуса
    (16…600) и силы (5…400), переключатель «Повысить»/«Понизить» и слайдер
    «Уровень моря» (−1000…1000), пишущий `repository.setSeaLevel`.
  - Курсор кисти: окружность радиуса `radius` в слое `overlay`, следует за
    мышью, пока активен инструмент.

Мазок полностью локален: сеть не трогается до `onStrokeEnd` (ТЗ §5.4).
`Alt` во время рисования временно инвертирует режим — удобный модификатор,
явно допущенный ТЗ §5.4.

- [ ] **Шаг 1: Реализовать `src/map/terrain/terrainTool.ts`**

```ts
import { create } from 'zustand';
import { strokeBrush, stampBrush, type BrushSettings } from './brush';
import type { TerrainLayer } from './terrainLayer';
import type { FreehandHandlers } from '../tools/freehand';

interface TerrainToolState {
  radius: number;
  strength: number;
  mode: 'raise' | 'lower';
  setRadius(v: number): void;
  setStrength(v: number): void;
  setMode(v: 'raise' | 'lower'): void;
}

export const useTerrainTool = create<TerrainToolState>((set) => ({
  radius: 120,
  strength: 60,
  mode: 'raise',
  setRadius: (radius) => set({ radius }),
  setStrength: (strength) => set({ strength }),
  setMode: (mode) => set({ mode }),
}));

export function makeTerrainHandlers(
  layer: TerrainLayer,
  onStrokeEnd: () => void,
): FreehandHandlers {
  let lastX = 0;
  let lastY = 0;
  let inverted = false;

  const settings = (): BrushSettings => {
    const { radius, strength, mode } = useTerrainTool.getState();
    const effective = inverted ? (mode === 'raise' ? 'lower' : 'raise') : mode;
    return { radius, strength, mode: effective };
  };

  return {
    onStart(x, y, event) {
      inverted = event.altKey;
      lastX = x;
      lastY = y;
      stampBrush(layer.store, x, y, settings());
    },
    onMove(x, y) {
      strokeBrush(layer.store, lastX, lastY, x, y, settings());
      lastX = x;
      lastY = y;
    },
    onFinish() {
      inverted = false;
      onStrokeEnd();     // ТЗ §5.5: обязательное сохранение при отпускании
    },
    onCancel() {
      inverted = false;
      onStrokeEnd();
    },
  };
}
```

- [ ] **Шаг 2: Реализовать `<TerrainPanel />`**

Изменение «Уровня моря» обновляет стор немедленно (шейдер увидит его на
ближайшей перерисовке) и с дебаунсом 400 мс пишет в БД — чтобы не слать
запрос на каждый тик слайдера.

```tsx
import { useRef } from 'react';
import { useAppStore } from '../state/store';
import { useEntities } from '../state/entities';
import { useTerrainTool } from '../map/terrain/terrainTool';
import * as repository from '../data/repository';

const PANEL: React.CSSProperties = {
  position: 'absolute', left: 12, bottom: 12, width: 240, padding: 14,
  borderRadius: 12, background: 'rgba(13,17,23,.9)', border: '1px solid #263041', zIndex: 25,
};

function Slider(
  { label, value, min, max, step, suffix, onChange }:
  { label: string; value: number; min: number; max: number; step: number;
    suffix?: string; onChange(v: number): void },
) {
  return (
    <label style={{ display: 'block', marginBottom: 12, fontSize: 12, opacity: .85 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span><span style={{ opacity: .6 }}>{value}{suffix ?? ''}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
             onChange={(e) => onChange(Number(e.target.value))}
             style={{ width: '100%', marginTop: 4 }} />
    </label>
  );
}

export function TerrainPanel() {
  const tool = useAppStore((s) => s.tool);
  const { radius, strength, mode, setRadius, setStrength, setMode } = useTerrainTool();
  const seaLevel = useEntities((s) => s.seaLevel);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (tool !== 'terrain') return null;

  const changeSeaLevel = (value: number) => {
    useEntities.getState().setSeaLevel(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void repository.setSeaLevel(value), 400);
  };

  return (
    <div style={PANEL}>
      <div style={{ fontSize: 12, opacity: .55, marginBottom: 10 }}>Рельеф</div>
      <Slider label="Радиус кисти" value={radius} min={16} max={600} step={4} onChange={setRadius} />
      <Slider label="Сила" value={strength} min={5} max={400} step={5} onChange={setStrength} />
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {(['raise', 'lower'] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            style={{
              flex: 1, padding: '7px 0', borderRadius: 7, cursor: 'pointer', fontSize: 13,
              background: mode === m ? '#2f6feb' : '#161d29',
              color: mode === m ? '#fff' : '#c9d4e2',
              border: '1px solid ' + (mode === m ? '#2f6feb' : '#242e3d'),
            }}>
            {m === 'raise' ? 'Повысить' : 'Понизить'}
          </button>
        ))}
      </div>
      <Slider label="Уровень моря" value={seaLevel} min={-1000} max={1000} step={10}
              onChange={changeSeaLevel} />
      <div style={{ fontSize: 11, opacity: .5 }}>Alt при рисовании — обратный режим</div>
    </div>
  );
}
```

- [ ] **Шаг 3: Гарантировать перерисовку во время мазка**

Пока `tool === 'terrain'` и кнопка зажата, перерисовка идёт каждый кадр:
`app.ticker.add(redraw)` включается на `onStart` и выключается на `onFinish`.
В остальное время перерисовка по подписке на сторы, как раньше.

- [ ] **Шаг 4: Проверить вручную**

Run: `npm run dev`
1. Выбрать «Рельеф», порисовать — холм растёт под курсором, края мягкие,
   без ступенек, изолинии перестраиваются в реальном времени.
2. Зажать `Alt` и порисовать — рельеф понижается, ниже уровня моря
   появляется вода без каких-либо действий с БД.
3. Порисовать через границу чанка (координата, кратная 512): изолинии и
   освещение непрерывны, шва не видно.
4. Отъехать далеко и вернуться — дальние чанки выгружены, ближние на месте.
5. Проверить, что во время рисования во вкладке Network **нет** запросов.

- [ ] **Шаг 5: Коммит**

```bash
git add src/map/terrain/terrainTool.ts src/ui/TerrainPanel.tsx src/map/MapCanvas.tsx src/App.tsx
git commit -m "feat: terrain brush tool with radius/strength panel and sea level control"
```

---

## Task 8: Загрузка и батч-сохранение чанков

**Files:**
- Create: `src/map/terrain/terrainSync.ts`, `src/data/base64.ts`
- Test: `tests/base64.test.ts`

**Interfaces:**
- Consumes: `getSupabase()`, `ENV.mapId`, `ChunkStore`, `serializeChunk`, `deserializeHeights`.
- Produces:
  - `bytesToBase64(bytes: Uint8Array): string`, `base64ToBytes(text: string): Uint8Array`
  - `CLIENT_ID: string` — случайный идентификатор вкладки (`crypto.randomUUID()`), нужен, чтобы в Плане 04 игнорировать эхо собственных записей.
  - `createTerrainSync(store: ChunkStore, layer: TerrainLayer): TerrainSync` где

```ts
interface TerrainSync {
  /** Догружает из БД чанки диапазона, которых ещё нет локально. */
  ensureLoaded(range: { minCX: number; maxCX: number; minCY: number; maxCY: number }): Promise<void>;
  /** Принудительно грузит один чанк (используется Realtime в Плане 04). */
  reload(cx: number, cy: number): Promise<void>;
  /** Отправляет накопившиеся грязные чанки. Безопасно вызывать часто. */
  flush(): Promise<void>;
  /** Включает автосохранение раз в 1000 мс (ТЗ §5.5). */
  start(): void;
  stop(): void;
}
```

`ensureLoaded` держит `Set` уже запрошенных ключей, чтобы не долбить БД
одним и тем же диапазоном на каждом кадре.

- [ ] **Шаг 1: Написать падающие тесты на base64**

`tests/base64.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { bytesToBase64, base64ToBytes } from '../src/data/base64';

describe('base64', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 128, 64]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it('round-trips a full chunk payload', () => {
    const bytes = new Uint8Array(64 * 64 * 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) & 0xff;
    const restored = base64ToBytes(bytesToBase64(bytes));
    expect(restored.length).toBe(bytes.length);
    expect(restored[8191]).toBe(bytes[8191]);
  });

  it('handles an empty array', () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe('');
    expect(base64ToBytes('').length).toBe(0);
  });
});
```

- [ ] **Шаг 2: Прогнать — падает**

Run: `npm test -- tests/base64.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать `src/data/base64.ts`**

```ts
const CHUNK = 0x8000;   // btoa не любит очень длинные apply()

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
```

Для Vitest в окружении `node` добавить в `vitest.config.ts`
`test.environment: 'jsdom'` для этого файла директивой
`// @vitest-environment jsdom` в начале теста — `btoa`/`atob` есть в jsdom.

- [ ] **Шаг 4: Прогнать — проходит**

Run: `npm test -- tests/base64.test.ts`
Expected: PASS, 3 теста.

- [ ] **Шаг 5: Реализовать `src/map/terrain/terrainSync.ts`**

```ts
import { getSupabase } from '../../data/supabase';
import { ENV } from '../../env';
import { bytesToBase64, base64ToBytes } from '../../data/base64';
import { deserializeHeights, serializeChunk, type ChunkStore } from './chunkStore';
import { chunkKey } from './chunkMath';
import type { TerrainLayer } from './terrainLayer';

export const CLIENT_ID = crypto.randomUUID();
const FLUSH_INTERVAL_MS = 1000;      // ТЗ §5.5

export interface ChunkRange { minCX: number; maxCX: number; minCY: number; maxCY: number }

export interface TerrainSync {
  ensureLoaded(range: ChunkRange): Promise<void>;
  reload(cx: number, cy: number): Promise<void>;
  flush(): Promise<void>;
  start(): void;
  stop(): void;
}

export function createTerrainSync(store: ChunkStore, layer: TerrainLayer): TerrainSync {
  const requested = new Set<string>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let flushing = false;

  function apply(cx: number, cy: number, base64: string) {
    store.load(cx, cy, deserializeHeights(base64ToBytes(base64)));
    layer.invalidate(cx, cy);
  }

  async function ensureLoaded(range: ChunkRange) {
    const missing: string[] = [];
    for (let cy = range.minCY; cy <= range.maxCY; cy++) {
      for (let cx = range.minCX; cx <= range.maxCX; cx++) {
        const key = chunkKey(cx, cy);
        if (!requested.has(key)) { requested.add(key); missing.push(key); }
      }
    }
    if (missing.length === 0) return;

    const { data, error } = await getSupabase().rpc('fetch_chunks', {
      p_map_id: ENV.mapId,
      p_min_x: range.minCX, p_max_x: range.maxCX,
      p_min_y: range.minCY, p_max_y: range.maxCY,
    });
    if (error) { for (const key of missing) requested.delete(key); throw new Error(error.message); }
    for (const row of data ?? []) apply(row.chunk_x, row.chunk_y, row.heights_b64);
  }

  async function reload(cx: number, cy: number) {
    const { data, error } = await getSupabase().rpc('fetch_chunks', {
      p_map_id: ENV.mapId, p_min_x: cx, p_max_x: cx, p_min_y: cy, p_max_y: cy,
    });
    if (error) throw new Error(error.message);
    const row = (data ?? [])[0];
    if (row) apply(row.chunk_x, row.chunk_y, row.heights_b64);
  }

  async function flush() {
    if (flushing || !store.hasDirty()) return;
    flushing = true;
    const chunks = store.takeDirty();      // ТЗ §5.5: только реально изменившиеся
    try {
      const payload = chunks.map((chunk) => ({
        x: chunk.cx, y: chunk.cy, d: bytesToBase64(serializeChunk(chunk)),
      }));
      const { error } = await getSupabase().rpc('save_chunks', {
        p_map_id: ENV.mapId, p_chunks: payload, p_client_id: CLIENT_ID,
      });
      if (error) throw new Error(error.message);
    } catch (err) {
      // Не теряем правки: возвращаем чанки в грязные и пробуем на следующем тике.
      for (const chunk of chunks) store.markDirty(chunk.cx, chunk.cy);
      console.error('terrain flush failed', err);
    } finally {
      flushing = false;
    }
  }

  return {
    ensureLoaded, reload, flush,
    start() { if (!timer) timer = setInterval(() => void flush(), FLUSH_INTERVAL_MS); },
    stop() { if (timer) { clearInterval(timer); timer = null; } },
  };
}
```

- [ ] **Шаг 6: Подключить sync в `MapCanvas.tsx`**

- В `redraw`: `void sync.ensureLoaded(chunkRange(visibleWorldBounds(camera, viewport), 1))`.
- `sync.start()` при монтировании, `sync.stop()` при размонтировании.
- `makeTerrainHandlers(layer, () => void sync.flush())` — сохранение при
  отпускании кнопки (ТЗ §5.5).
- Дополнительно `window.addEventListener('beforeunload', () => void sync.flush())`.

- [ ] **Шаг 7: Проверить вручную**

Run: `npm run dev`
1. Нарисовать холм. Во вкладке Network: во время движения мыши запросов нет;
   примерно раз в секунду появляется один `save_chunks`; при отпускании —
   ещё один.
2. Проверить размер тела запроса: ~11 КБ на чанк (8 КБ бинарных данных в
   base64), а не сотни килобайт JSON.
3. Перезагрузить страницу — рельеф на месте.
4. Отъехать на несколько экранов и вернуться — чанки догружаются один раз,
   повторных `fetch_chunks` по тому же диапазону нет.

- [ ] **Шаг 8: Коммит**

```bash
git add src/map/terrain/terrainSync.ts src/data/base64.ts src/map/MapCanvas.tsx tests/base64.test.ts
git commit -m "feat: chunk loading by viewport and batched binary terrain persistence"
```

---

## Task 9: Автоматические мосты

**Files:**
- Create: `src/geometry/bridges.ts`, `src/map/bridgesLayer.ts`
- Modify: `src/map/MapCanvas.tsx`
- Test: `tests/bridges.test.ts`

**Interfaces:**
- Consumes: `ChunkStore.sampleHeight`, `useEntities.seaLevel`, `useEntities.roads`.
- Produces:
  - `BRIDGE_SAMPLE_STEP = 8` — шаг выборки высоты вдоль дороги, мировые единицы.
  - `detectBridges(coords: number[][], sampleHeight: (x: number, y: number) => number, seaLevel: number, step?: number): number[][][]` —
    возвращает массив полилиний-мостов: максимальные участки дороги, где
    высота рельефа ниже `seaLevel` (ТЗ §5.6).
  - `createBridgesLayer(store: ChunkStore): { view: Container; update(camera, viewport): void }`

Мосты **не хранятся в БД**: они — чистая функция от геометрии дороги, карты
высот и `sea_level`. Хранение сделало бы их протухающими при каждом мазке
кисти рядом с дорогой. См. «Осознанные отклонения» в индексе планов.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/bridges.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { detectBridges } from '../src/geometry/bridges';

/** Вода строго между x = 40 и x = 60. */
const strait = (x: number) => (x > 40 && x < 60 ? -100 : 100);

describe('detectBridges', () => {
  it('finds no bridge on a fully dry road', () => {
    expect(detectBridges([[0, 0], [100, 0]], () => 50, 0, 1)).toEqual([]);
  });

  it('finds one bridge across a strait', () => {
    const bridges = detectBridges([[0, 0], [100, 0]], strait, 0, 1);
    expect(bridges).toHaveLength(1);
    expect(bridges[0][0][0]).toBeGreaterThanOrEqual(39);
    expect(bridges[0][0][0]).toBeLessThanOrEqual(42);
    expect(bridges[0][bridges[0].length - 1][0]).toBeGreaterThanOrEqual(58);
    expect(bridges[0][bridges[0].length - 1][0]).toBeLessThanOrEqual(61);
  });

  it('finds two bridges across two straits', () => {
    const twoStraits = (x: number) => ((x > 10 && x < 20) || (x > 70 && x < 80) ? -50 : 30);
    expect(detectBridges([[0, 0], [100, 0]], twoStraits, 0, 1)).toHaveLength(2);
  });

  it('bridges the whole road when it runs entirely over water', () => {
    const bridges = detectBridges([[0, 0], [50, 0]], () => -20, 0, 1);
    expect(bridges).toHaveLength(1);
    expect(bridges[0][0]).toEqual([0, 0]);
  });

  it('respects a non-zero sea level', () => {
    expect(detectBridges([[0, 0], [100, 0]], () => 50, 80, 1)).toHaveLength(1);
    expect(detectBridges([[0, 0], [100, 0]], () => 50, 20, 1)).toEqual([]);
  });

  it('follows a bent road through its vertices', () => {
    const water = (x: number, y: number) => (y > 40 ? -10 : 10);
    const bridges = detectBridges([[0, 0], [0, 100]], water, 0, 1);
    expect(bridges).toHaveLength(1);
    expect(bridges[0][0][1]).toBeGreaterThan(38);
  });

  it('ignores a degenerate road', () => {
    expect(detectBridges([[0, 0]], () => -100, 0, 1)).toEqual([]);
  });
});
```

- [ ] **Шаг 2: Прогнать — падает**

Run: `npm test -- tests/bridges.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать `src/geometry/bridges.ts`**

```ts
export const BRIDGE_SAMPLE_STEP = 8;

/**
 * Мост — участок дороги, под которым рельеф ниже уровня моря (ТЗ §5.6).
 * Считается по высоте рельефа под линией, не по пересечению с рекой.
 */
export function detectBridges(
  coords: number[][],
  sampleHeight: (x: number, y: number) => number,
  seaLevel: number,
  step: number = BRIDGE_SAMPLE_STEP,
): number[][][] {
  if (coords.length < 2 || step <= 0) return [];

  const bridges: number[][][] = [];
  let current: number[][] | null = null;

  const visit = (x: number, y: number) => {
    if (sampleHeight(x, y) < seaLevel) {
      if (!current) { current = [[x, y]]; bridges.push(current); }
      else current.push([x, y]);
    } else {
      current = null;
    }
  };

  for (let i = 1; i < coords.length; i++) {
    const [ax, ay] = coords[i - 1];
    const [bx, by] = coords[i];
    const length = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(length / step));
    const start = i === 1 ? 0 : 1;      // вершину не дублируем
    for (let s = start; s <= steps; s++) {
      const t = s / steps;
      visit(ax + (bx - ax) * t, ay + (by - ay) * t);
    }
  }

  // Одиночная точка — не мост.
  return bridges.filter((bridge) => bridge.length >= 2);
}
```

- [ ] **Шаг 4: Прогнать — проходит**

Run: `npm test -- tests/bridges.test.ts`
Expected: PASS, 7 тестов.

- [ ] **Шаг 5: Реализовать `src/map/bridgesLayer.ts`**

Результат кэшируется по ключу «геометрия дороги + уровень моря + суммарная
ревизия чанков под дорогой»: пересчёт идёт, только когда рельеф под дорогой
действительно менялся. Слой добавляется в `layers.roads` **после**
`roadsLayer`, чтобы мосты рисовались поверх дорожного полотна.

```ts
import { Container, Graphics } from 'pixi.js';
import type { Camera, Viewport } from './camera';
import { visibleWorldBounds } from './camera';
import { geometryBBox } from '../geometry/measure';
import { detectBridges } from '../geometry/bridges';
import { useEntities } from '../state/entities';
import { ROAD_STYLES } from './roadsLayer';
import type { ChunkStore } from './terrain/chunkStore';
import { chunkRange } from './terrain/chunkMath';

const BRIDGE_COLOR = 0xf0e6d2;
const PIER_COLOR = 0x2a2318;

export function createBridgesLayer(store: ChunkStore) {
  const view = new Container();
  const graphics = new Graphics();
  view.addChild(graphics);
  const cache = new Map<string, { signature: string; bridges: number[][][] }>();

  /** Сумма ревизий чанков под дорогой — дешёвый детектор «рельеф изменился». */
  function terrainSignature(bbox: [number, number, number, number]): number {
    const range = chunkRange(bbox, 0);
    let sum = 0;
    for (let cy = range.minCY; cy <= range.maxCY; cy++) {
      for (let cx = range.minCX; cx <= range.maxCX; cx++) {
        sum += store.get(cx, cy)?.revision ?? 0;
      }
    }
    return sum;
  }

  function update(camera: Camera, viewport: Viewport) {
    const { roads, seaLevel } = useEntities.getState();
    const [minX, minY, maxX, maxY] = visibleWorldBounds(camera, viewport);
    graphics.clear();

    for (const road of roads.values()) {
      const bbox = geometryBBox(road.geometry);
      if (bbox[2] < minX || bbox[0] > maxX || bbox[3] < minY || bbox[1] > maxY) continue;

      const signature = `${JSON.stringify(road.geometry.coordinates.length)}:${seaLevel}:${terrainSignature(bbox)}`;
      let entry = cache.get(road.id);
      if (!entry || entry.signature !== signature) {
        entry = {
          signature,
          bridges: detectBridges(
            road.geometry.coordinates,
            (x, y) => store.sampleHeight(x, y),
            seaLevel,
          ),
        };
        cache.set(road.id, entry);
      }

      const width = (ROAD_STYLES[road.roadType].width + 3) / camera.zoom;
      for (const bridge of entry.bridges) {
        graphics.moveTo(bridge[0][0], bridge[0][1]);
        for (let i = 1; i < bridge.length; i++) graphics.lineTo(bridge[i][0], bridge[i][1]);
        graphics.stroke({ width, color: BRIDGE_COLOR, cap: 'butt', join: 'round' });

        // Перпендикулярные штрихи-опоры на концах моста.
        for (const [[ax, ay], [bx, by]] of [
          [bridge[0], bridge[1]],
          [bridge[bridge.length - 1], bridge[bridge.length - 2]],
        ]) {
          const length = Math.hypot(bx - ax, by - ay) || 1;
          const nx = -(by - ay) / length;
          const ny = (bx - ax) / length;
          const half = width * 0.6;
          graphics.moveTo(ax - nx * half, ay - ny * half)
                  .lineTo(ax + nx * half, ay + ny * half);
        }
        graphics.stroke({ width: 1.5 / camera.zoom, color: PIER_COLOR });
      }
    }

    for (const id of [...cache.keys()]) if (!roads.has(id)) cache.delete(id);
  }

  return { view, update };
}
```

- [ ] **Шаг 6: Проверить вручную**

Run: `npm run dev`
1. Кистью прорыть пролив (понизить полосу ниже уровня моря).
2. Нарисовать дорогу поперёк пролива — на воде автоматически появляется мост.
3. Кистью поднять дно пролива выше уровня моря — мост исчезает сам.
4. Подвинуть слайдер «Уровень моря» вверх — мостов становится больше.
5. Нарисовать дорогу целиком по суше — мостов нет.

- [ ] **Шаг 7: Коммит**

```bash
git add src/geometry/bridges.ts src/map/bridgesLayer.ts src/map/MapCanvas.tsx tests/bridges.test.ts
git commit -m "feat: automatic bridges derived from road geometry and terrain height"
```

---

## Task 10: Проверка z-order и производительности

**Files:**
- Modify: `src/map/MapCanvas.tsx`

- [ ] **Шаг 1: Убедиться в порядке слоёв (ТЗ §5.6)**

Снизу вверх: `terrain (рельеф) → regions → roads → bridges → points → overlay`.
Рельеф не влияет на попадание курсором: `hitTest*` не смотрит на высоты.

- [ ] **Шаг 2: Прогнать сцену с нагрузкой**

Скриптом в консоли создать 40 регионов, 60 точечных объектов, 20 дорог и
прорисовать рельеф на площади 6×6 чанков. Замерить FPS через
Chrome DevTools MCP (`performance_start_trace` → пан/зум → `performance_stop_trace`).

Expected: ≥ 50 FPS при панорамировании на среднем зуме. Если ниже —
профилировать: чаще всего виноват `Graphics.clear()` + полная перерисовка
регионов каждый кадр. Оптимизация (переиспользование `Graphics` на регион,
перерисовка только при смене `revision`) отнесена в План 04, Task 4.

- [ ] **Шаг 3: Проверить бюджет памяти**

При максимальном отдалении (`MIN_ZOOM`) число загруженных чанков не должно
превышать `CHUNK_CACHE_LIMIT`. Если превышает — на `MIN_ZOOM` подключить
пропуск рельефа (не рисовать чанки, когда `CHUNK_WORLD * zoom < 8` — на
таком зуме чанк меньше 8 экранных пикселей и всё равно нечитаем).

- [ ] **Шаг 4: Финальная проверка и коммит**

```bash
npm test
npm run build
git add -A
git commit -m "chore: verify terrain layering order and rendering budget"
git push
```

---

## Definition of Done для Плана 03

- `npm test` зелёный (≥ 100 тестов суммарно по трём планам), `npm run build` без ошибок.
- Рельеф рисуется шейдером: изолинии со сглаживанием `fwidth()`, освещение
  по градиенту, вода ниже `sea_level`, свечение у берега — сверено с
  референсом из ТЗ §5.1.
- Кисть повышает и понижает рельеф с мягкими краями, работает через границы
  чанков без швов, во время мазка сетевых запросов нет.
- Изменённые чанки уходят на сервер раз в секунду и при отпускании кнопки,
  бинарно (`bytea`), только те, что реально менялись.
- Чанки подгружаются по видимой области и выгружаются при уходе камеры.
- Мосты появляются автоматически там, где дорога идёт по воде, и исчезают,
  когда рельеф поднимают выше уровня моря.
- Рельеф лежит под всеми векторными слоями и не мешает выбору объектов.
