import { describe, it, expect } from 'vitest';
import { detectBridges } from '../src/geometry/bridges';
import { createChunkStore } from '../src/map/terrain/chunkStore';
import { stampBrush } from '../src/map/terrain/brush';

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
    const last = bridges[0][bridges[0].length - 1];
    expect(last[0]).toBeGreaterThanOrEqual(58);
    expect(last[0]).toBeLessThanOrEqual(61);
  });

  it('finds two bridges across two straits', () => {
    const twoStraits = (x: number) =>
      ((x > 10 && x < 20) || (x > 70 && x < 80) ? -50 : 30);
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
    const water = (_x: number, y: number) => (y > 40 ? -10 : 10);
    const bridges = detectBridges([[0, 0], [0, 100]], water, 0, 1);
    expect(bridges).toHaveLength(1);
    expect(bridges[0][0][1]).toBeGreaterThan(38);
  });

  it('ignores a degenerate road', () => {
    expect(detectBridges([[0, 0]], () => -100, 0, 1)).toEqual([]);
    expect(detectBridges([[0, 0], [10, 0]], () => -100, 0, 0)).toEqual([]);
  });

  // Интеграция с настоящим рельефом, а не с выдуманной функцией высоты.
  it('bridges a channel actually dug with the brush', () => {
    const store = createChunkStore();
    const seaLevel = 64;
    // Суша: поднимаем полосу выше уровня моря по всей длине дороги.
    for (let x = 0; x <= 800; x += 40) {
      stampBrush(store, x, 0, { radius: 220, strength: 300, mode: 'raise' });
    }
    // Прорываем пролив поперёк дороги около x = 400.
    for (let y = -200; y <= 200; y += 40) {
      stampBrush(store, 400, y, { radius: 120, strength: 900, mode: 'lower' });
    }

    const bridges = detectBridges(
      [[0, 0], [800, 0]],
      (x, y) => store.sampleHeight(x, y),
      seaLevel,
    );
    expect(bridges).toHaveLength(1);
    const [first] = bridges[0];
    const last = bridges[0][bridges[0].length - 1];
    expect(first[0]).toBeGreaterThan(200);
    expect(last[0]).toBeLessThan(600);
  });

  it('removes the bridge once the channel is filled back in', () => {
    const store = createChunkStore();
    const seaLevel = 64;
    for (let x = 0; x <= 800; x += 40) {
      stampBrush(store, x, 0, { radius: 220, strength: 300, mode: 'raise' });
    }
    for (let y = -200; y <= 200; y += 40) {
      stampBrush(store, 400, y, { radius: 120, strength: 900, mode: 'lower' });
    }
    const sample = (x: number, y: number) => store.sampleHeight(x, y);
    expect(detectBridges([[0, 0], [800, 0]], sample, seaLevel)).toHaveLength(1);

    // Засыпаем пролив обратно — мост обязан исчезнуть сам.
    for (let y = -200; y <= 200; y += 40) {
      stampBrush(store, 400, y, { radius: 160, strength: 1400, mode: 'raise' });
    }
    expect(detectBridges([[0, 0], [800, 0]], sample, seaLevel)).toEqual([]);
  });
});
