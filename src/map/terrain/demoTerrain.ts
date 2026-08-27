import type { ChunkStore } from './chunkStore';
import { stampBrush } from './brush';

/**
 * Тестовый рельеф для визуальной проверки шейдера: гряда холмов, впадина под
 * уровнем моря и пологий склон. Вызывается только в dev-сборке по ?demo=1 и
 * вырезается из продакшн-бандла как мёртвый код.
 */
export function seedDemoTerrain(store: ChunkStore): void {
  for (let i = 0; i < 26; i++) {
    stampBrush(store, -420 + i * 34, -160 + Math.sin(i / 3.2) * 150, {
      radius: 110, strength: 130, mode: 'raise',
    });
  }
  for (let i = 0; i < 10; i++) {
    stampBrush(store, 140 + i * 26, 300 + Math.cos(i / 2.5) * 60, {
      radius: 150, strength: 220, mode: 'raise',
    });
  }
  stampBrush(store, 60, -40, { radius: 260, strength: 520, mode: 'lower' });
  stampBrush(store, -260, 360, { radius: 200, strength: 380, mode: 'lower' });
}
