import type { ChunkStore } from './chunkStore';
import { CELL_SIZE, CHUNK_CELLS, CHUNK_WORLD, HEIGHT_MIN, HEIGHT_MAX } from './constants';
import { cellIndex } from './chunkMath';

export interface BrushSettings {
  /** Радиус в мировых единицах. */
  radius: number;
  /** Изменение высоты в центре за один штамп. */
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

/** Штампы вдоль отрезка, чтобы быстрое движение мыши не давало «горошин». */
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
