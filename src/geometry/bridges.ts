/** Шаг выборки высоты вдоль дороги, мировые единицы. */
export const BRIDGE_SAMPLE_STEP = 8;

/**
 * Мост — участок дороги, под которым рельеф ниже уровня моря (ТЗ §5.6).
 * Считается по высоте рельефа под линией, а не по пересечению с векторной
 * рекой: рек как объектов в новой версии нет.
 *
 * Результат не хранится в БД: мост — чистая функция от геометрии дороги,
 * карты высот и sea_level. Хранимый мост протухал бы при каждом мазке кисти
 * рядом с дорогой.
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
      if (current) current.push([x, y]);
      else { current = [[x, y]]; bridges.push(current); }
    } else {
      current = null;
    }
  };

  for (let i = 1; i < coords.length; i++) {
    const [ax, ay] = coords[i - 1];
    const [bx, by] = coords[i];
    const length = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(length / step));
    // Вершину не дублируем: она уже посещена как конец предыдущего сегмента.
    const start = i === 1 ? 0 : 1;
    for (let s = start; s <= steps; s++) {
      const t = s / steps;
      visit(ax + (bx - ax) * t, ay + (by - ay) * t);
    }
  }

  // Одиночная точка — не мост.
  return bridges.filter((bridge) => bridge.length >= 2);
}
