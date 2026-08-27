import { chunkKey } from './chunkMath';
import type { ChunkRangeBox } from './chunkStore';

/**
 * Учёт того, какие чанки уже запрашивались у сервера.
 *
 * Существует отдельно от хранилища высот, потому что забыть запрошенный чанк
 * обязательно нужно ровно тогда, когда он выгружен из памяти. Иначе при
 * возврате камеры слой создаст пустой чанк, загрузка сочтёт его уже
 * запрошенным, рельеф исчезнет — а запись поверх сохранит нули в базу.
 */
export interface ChunkRegistry {
  /** Ключи диапазона, которые ещё не запрашивались. */
  missing(range: ChunkRangeBox): string[];
  markRequested(keys: string[]): void;
  forget(keys: string[]): void;
  has(key: string): boolean;
  size(): number;
  clear(): void;
}

export function createChunkRegistry(): ChunkRegistry {
  const requested = new Set<string>();

  return {
    missing(range) {
      const result: string[] = [];
      for (let cy = range.minCY; cy <= range.maxCY; cy++) {
        for (let cx = range.minCX; cx <= range.maxCX; cx++) {
          const key = chunkKey(cx, cy);
          if (!requested.has(key)) result.push(key);
        }
      }
      return result;
    },
    markRequested(keys) { for (const key of keys) requested.add(key); },
    forget(keys) { for (const key of keys) requested.delete(key); },
    has: (key) => requested.has(key),
    size: () => requested.size,
    clear: () => requested.clear(),
  };
}
