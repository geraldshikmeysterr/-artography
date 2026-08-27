import { Container, Graphics } from 'pixi.js';
import type { Camera } from './camera';

/** Круг радиуса кисти, следующий за курсором, пока активен инструмент «Рельеф». */
export function createBrushCursor() {
  const view = new Container();
  const ring = new Graphics();
  view.addChild(ring);
  view.visible = false;

  let worldX = 0;
  let worldY = 0;

  function setPosition(x: number, y: number) {
    worldX = x;
    worldY = y;
  }

  function update(camera: Camera, visible: boolean, radius: number, shape: 'sculpt' | 'smooth') {
    view.visible = visible;
    if (!visible) return;
    ring.clear();
    ring.circle(worldX, worldY, radius);
    ring.stroke({
      width: 1.5 / camera.zoom,
      color: shape === 'smooth' ? 0x7cd992 : 0xffd479,
      alpha: 0.9,
    });
    ring.circle(worldX, worldY, radius * 0.5);
    ring.stroke({ width: 1 / camera.zoom, color: 0xffffff, alpha: 0.22 });
  }

  return { view, setPosition, update };
}
