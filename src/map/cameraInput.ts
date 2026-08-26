import { panByScreen, zoomAt } from './camera';
import { useAppStore } from '../state/store';

const ZOOM_PER_NOTCH = 1.15;

/**
 * ТЗ §10: перемещение по карте — только зажатым колёсиком (средняя кнопка).
 * Левая кнопка здесь не трогается — она принадлежит инструментам рисования.
 */
export function attachCameraInput(host: HTMLElement): () => void {
  let panning = false;
  let lastX = 0;
  let lastY = 0;

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 1) return;
    e.preventDefault();
    panning = true;
    lastX = e.clientX;
    lastY = e.clientY;
    host.style.cursor = 'grabbing';
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!panning) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    const { camera, setCamera } = useAppStore.getState();
    setCamera(panByScreen(camera, dx, dy));
  };

  const endPan = () => {
    if (!panning) return;
    panning = false;
    host.style.cursor = '';
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = host.getBoundingClientRect();
    const notches = -e.deltaY / 100;
    const factor = Math.pow(ZOOM_PER_NOTCH, notches);
    const { camera, viewport, setCamera } = useAppStore.getState();
    setCamera(zoomAt(camera, e.clientX - rect.left, e.clientY - rect.top, factor, viewport));
  };

  // Средний клик в браузере открывает автопрокрутку — гасим.
  const onAuxClick = (e: MouseEvent) => { if (e.button === 1) e.preventDefault(); };

  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('auxclick', onAuxClick);
  host.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', endPan);
  window.addEventListener('pointercancel', endPan);
  window.addEventListener('blur', endPan);

  return () => {
    host.removeEventListener('pointerdown', onPointerDown);
    host.removeEventListener('auxclick', onAuxClick);
    host.removeEventListener('wheel', onWheel);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endPan);
    window.removeEventListener('pointercancel', endPan);
    window.removeEventListener('blur', endPan);
  };
}
