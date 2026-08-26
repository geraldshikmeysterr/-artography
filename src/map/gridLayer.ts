import { Container, Graphics } from 'pixi.js';
import { visibleWorldBounds, type Camera, type Viewport } from './camera';

/**
 * Фоновая сетка: даёт ощущение бесконечного холста и точку отсчёта при зуме.
 * Шаг подбирается так, чтобы клетка на экране оставалась в пределах 40–400 px.
 */
export function createGridLayer() {
  const view = new Container();
  const g = new Graphics();
  view.addChild(g);

  function update(cam: Camera, vp: Viewport) {
    const [minX, minY, maxX, maxY] = visibleWorldBounds(cam, vp);
    let step = 64;
    while (step * cam.zoom < 40) step *= 4;
    while (step * cam.zoom > 400) step /= 4;

    g.clear();
    const x0 = Math.floor(minX / step) * step;
    const y0 = Math.floor(minY / step) * step;
    for (let x = x0; x <= maxX; x += step) g.moveTo(x, minY).lineTo(x, maxY);
    for (let y = y0; y <= maxY; y += step) g.moveTo(minX, y).lineTo(maxX, y);
    g.stroke({ width: 1 / cam.zoom, color: 0x1b2430, alpha: 0.9 });

    g.moveTo(0, minY).lineTo(0, maxY).moveTo(minX, 0).lineTo(maxX, 0);
    g.stroke({ width: 1.5 / cam.zoom, color: 0x2c3a4d, alpha: 1 });
  }

  return { view, update };
}
