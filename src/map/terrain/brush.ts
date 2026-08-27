import type { ChunkStore } from './chunkStore';
import { CELL_SIZE, CHUNK_CELLS, CHUNK_WORLD, HEIGHT_MIN, HEIGHT_MAX } from './constants';
import { cellIndex, globalCellToChunk, globalCellCentre, worldToGlobalCell } from './chunkMath';

export type BrushShape = 'sculpt' | 'smooth';

export interface BrushSettings {
  /** Радиус в мировых единицах. */
  radius: number;
  /** Для sculpt — изменение высоты в центре; для smooth — скорость сходимости. */
  strength: number;
  mode: 'raise' | 'lower';
}

/** Мягкие растушёванные края без ступенек рельефа (ТЗ §5.4). */
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

function readGlobalCell(store: ChunkStore, gx: number, gy: number): number {
  const { cx, cy, ix, iy } = globalCellToChunk(gx, gy);
  const chunk = store.get(cx, cy);
  return chunk ? chunk.heights[cellIndex(ix, iy)] : 0;
}

/** Верхняя граница ползунка силы: по ней нормируется скорость сглаживания. */
export const MAX_SMOOTH_STRENGTH = 400;

/** Радиус ядра усреднения в ячейках относительно радиуса кисти. */
const KERNEL_FRACTION = 3;
const MAX_KERNEL_CELLS = 24;

/** Скорость сходимости при максимальной силе, долей за секунду. */
const SMOOTH_RATE = 4;

/** Одномерное усреднение бегущей суммой: O(1) на ячейку вместо O(ядро). */
function blurAxis(
  source: Float32Array, target: Float32Array,
  width: number, height: number, kernel: number, horizontal: boolean,
): void {
  const inner = horizontal ? width : height;
  const outer = horizontal ? height : width;
  const index = (a: number, b: number) => (horizontal ? b * width + a : a * width + b);

  for (let b = 0; b < outer; b++) {
    let sum = 0;
    for (let a = -kernel; a <= kernel; a++) {
      sum += source[index(Math.max(0, Math.min(inner - 1, a)), b)];
    }
    const window = kernel * 2 + 1;
    for (let a = 0; a < inner; a++) {
      target[index(a, b)] = sum / window;
      const leaving = Math.max(0, Math.min(inner - 1, a - kernel));
      const entering = Math.max(0, Math.min(inner - 1, a + kernel + 1));
      sum += source[index(entering, b)] - source[index(leaving, b)];
    }
  }
}

/**
 * Сглаживание: каждая ячейка подтягивается к среднему по окрестности.
 * Убирает резкие углы, которые оставляет скульптурная кисть.
 *
 * Ядро усреднения пропорционально радиусу кисти, а не фиксировано в одну
 * ячейку: фиксированное 3×3 почти не трогает крупные формы, из-за чего
 * сглаживание казалось бессильным даже на максимуме.
 *
 * Считается по снимку исходных высот, а не по ходу записи: иначе уже
 * изменённые соседи участвовали бы в среднем для следующих ячеек, и
 * сглаживание «поехало» бы в сторону обхода.
 */
export function smoothBrush(
  store: ChunkStore, worldX: number, worldY: number, radius: number, amount: number,
): void {
  if (radius <= 0 || amount <= 0) return;
  const strength = Math.min(amount, 1);

  const radiusCells = radius / CELL_SIZE;
  const kernel = Math.max(1, Math.min(MAX_KERNEL_CELLS, Math.round(radiusCells / KERNEL_FRACTION)));

  const gx0 = worldToGlobalCell(worldX - radius);
  const gx1 = worldToGlobalCell(worldX + radius);
  const gy0 = worldToGlobalCell(worldY - radius);
  const gy1 = worldToGlobalCell(worldY + radius);

  // Снимок с рамкой в размер ядра — она нужна для среднего по краю.
  const width = gx1 - gx0 + 1 + kernel * 2;
  const height = gy1 - gy0 + 1 + kernel * 2;
  const original = new Float32Array(width * height);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      original[row * width + col] = readGlobalCell(store, gx0 - kernel + col, gy0 - kernel + row);
    }
  }

  const temp = new Float32Array(width * height);
  const blurred = new Float32Array(width * height);
  blurAxis(original, temp, width, height, kernel, true);
  blurAxis(temp, blurred, width, height, kernel, false);

  const at = (gx: number, gy: number) => (gy - gy0 + kernel) * width + (gx - gx0 + kernel);

  const touched = new Map<string, ReturnType<ChunkStore['ensure']>>();
  for (let gy = gy0; gy <= gy1; gy++) {
    const cellY = globalCellCentre(gy);
    for (let gx = gx0; gx <= gx1; gx++) {
      const cellX = globalCellCentre(gx);
      const weight = falloff(Math.hypot(cellX - worldX, cellY - worldY), radius);
      if (weight === 0) continue;

      const i = at(gx, gy);
      const next = original[i] + (blurred[i] - original[i]) * weight * strength;

      const { cx, cy, ix, iy } = globalCellToChunk(gx, gy);
      const key = `${cx},${cy}`;
      let chunk = touched.get(key);
      if (!chunk) { chunk = store.ensure(cx, cy); touched.set(key, chunk); }
      chunk.heights[cellIndex(ix, iy)] = Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, next));
    }
  }

  for (const chunk of touched.values()) {
    chunk.revision += 1;
    store.markDirty(chunk.cx, chunk.cy);
  }
}

/** Расстояние между штампами вдоль мазка. */
const spacingFor = (radius: number) => Math.max(radius / 4, CELL_SIZE / 2);

/**
 * Применение кисти за прошедшее время.
 *
 * Заданная сила — это скорость в единицах высоты за секунду, а не за штамп:
 * пока кнопка зажата, рельеф меняется и при неподвижном курсоре. Суммарное
 * воздействие за кадр равно strength * seconds независимо от скорости
 * движения — быстрое движение размазывает его по более длинному следу,
 * как краскопульт.
 */
export interface Point { x: number; y: number }

export function paintStroke(
  store: ChunkStore,
  from: Point,
  to: Point,
  shape: BrushShape,
  settings: BrushSettings,
  seconds: number,
): void {
  if (seconds <= 0 || settings.radius <= 0) return;

  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / spacingFor(settings.radius)));

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    if (shape === 'smooth') {
      const rate = (settings.strength / MAX_SMOOTH_STRENGTH) * SMOOTH_RATE;
      smoothBrush(store, x, y, settings.radius, rate * seconds / steps);
    } else {
      stampBrush(store, x, y, { ...settings, strength: settings.strength * seconds / steps });
    }
  }
}
