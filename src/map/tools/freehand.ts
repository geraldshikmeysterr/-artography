import { screenToWorld } from '../camera';
import { useAppStore } from '../../state/store';

export interface FreehandHandlers {
  onStart?(worldX: number, worldY: number, event: PointerEvent): void;
  onMove?(worldX: number, worldY: number, points: number[][]): void;
  onFinish(points: number[][], event: PointerEvent): void;
  onCancel?(): void;
}

/**
 * Захват росчерка левой кнопкой в мировых координатах.
 * Средняя кнопка сюда не попадает — она принадлежит камере (ТЗ §10).
 * `getHandlers()` возвращает null, когда активный инструмент не рисующий.
 */
export function attachFreehand(
  host: HTMLElement,
  getHandlers: () => FreehandHandlers | null,
): () => void {
  let active: FreehandHandlers | null = null;
  let points: number[][] = [];

  const toWorld = (e: PointerEvent) => {
    const rect = host.getBoundingClientRect();
    const { camera, viewport } = useAppStore.getState();
    return screenToWorld(camera, e.clientX - rect.left, e.clientY - rect.top, viewport);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const handlers = getHandlers();
    if (!handlers) return;
    e.preventDefault();
    active = handlers;
    const w = toWorld(e);
    points = [[w.x, w.y]];
    handlers.onStart?.(w.x, w.y, e);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!active) return;
    const w = toWorld(e);
    points.push([w.x, w.y]);
    active.onMove?.(w.x, w.y, points);
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!active) return;
    const handlers = active;
    const captured = points;
    active = null;
    points = [];
    handlers.onFinish(captured, e);
  };

  const cancel = () => {
    if (!active) return;
    const handlers = active;
    active = null;
    points = [];
    handlers.onCancel?.();
  };

  const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel(); };

  host.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', onKeyDown);

  return () => {
    host.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('keydown', onKeyDown);
  };
}
