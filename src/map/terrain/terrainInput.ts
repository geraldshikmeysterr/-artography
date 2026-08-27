import { screenToWorld } from '../camera';
import { useAppStore } from '../../state/store';
import { useTerrainTool, type TerrainPainter } from './terrainTool';

/**
 * Ввод для кисти рельефа.
 *
 * Левая кнопка понижает, правая повышает, средняя остаётся за камерой
 * (ТЗ §10). Ctrl с колесом меняет радиус, Shift — силу; такие события
 * перехватываются в фазе capture, чтобы камера не получила их и не зумила.
 */
export function attachTerrainInput(host: HTMLElement, painter: TerrainPainter): () => void {
  const isActive = () => useAppStore.getState().tool === 'terrain';

  const toWorld = (e: PointerEvent | WheelEvent) => {
    const rect = host.getBoundingClientRect();
    const { camera, viewport } = useAppStore.getState();
    return screenToWorld(camera, e.clientX - rect.left, e.clientY - rect.top, viewport);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!isActive()) return;
    const world = toWorld(e);
    if (!painter.begin(e.button, world.x, world.y)) return;
    e.preventDefault();
    e.stopPropagation();
    // Захват указателя — оптимизация, а не необходимость: мазок уже начат,
    // и pointermove слушается на window. Если браузер откажет, продолжаем.
    try {
      host.setPointerCapture?.(e.pointerId);
    } catch {
      // Указателя с таким id уже нет — не повод прерывать мазок.
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!painter.isPainting()) return;
    const world = toWorld(e);
    painter.moveTo(world.x, world.y);
  };

  const onPointerUp = () => painter.end();

  // Без этого правая кнопка открывает контекстное меню браузера.
  const onContextMenu = (e: MouseEvent) => { if (isActive()) e.preventDefault(); };

  const onWheel = (e: WheelEvent) => {
    if (!isActive()) return;
    // Только левые модификаторы, как просили: правые оставляем браузеру.
    if (!e.ctrlKey && !e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    const notches = -e.deltaY / 100;
    if (e.ctrlKey) useTerrainTool.getState().nudgeRadius(notches);
    else useTerrainTool.getState().nudgeStrength(notches);
  };

  host.addEventListener('pointerdown', onPointerDown, { capture: true });
  host.addEventListener('wheel', onWheel, { capture: true, passive: false });
  host.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('blur', onPointerUp);

  return () => {
    host.removeEventListener('pointerdown', onPointerDown, { capture: true } as never);
    host.removeEventListener('wheel', onWheel, { capture: true } as never);
    host.removeEventListener('contextmenu', onContextMenu);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('blur', onPointerUp);
  };
}
