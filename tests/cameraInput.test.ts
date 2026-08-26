// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { attachCameraInput } from '../src/map/cameraInput';
import { useAppStore } from '../src/state/store';

function pointerEvent(type: string, init: MouseEventInit) {
  return new MouseEvent(type, { bubbles: true, ...init }) as unknown as PointerEvent;
}

describe('camera input', () => {
  let host: HTMLDivElement;
  let detach: () => void;

  beforeEach(() => {
    host = document.createElement('div');
    Object.defineProperty(host, 'clientWidth', { value: 800 });
    Object.defineProperty(host, 'clientHeight', { value: 600 });
    document.body.appendChild(host);
    useAppStore.setState({
      camera: { x: 0, y: 0, zoom: 1 },
      viewport: { width: 800, height: 600 },
    });
    detach = attachCameraInput(host);
  });

  afterEach(() => {
    detach();
    host.remove();
  });

  it('pans with the middle button held', () => {
    host.dispatchEvent(pointerEvent('pointerdown', { button: 1, clientX: 100, clientY: 100 }));
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 140, clientY: 130 }));
    expect(useAppStore.getState().camera).toEqual({ x: -40, y: -30, zoom: 1 });
    window.dispatchEvent(pointerEvent('pointerup', { button: 1 }));
  });

  it('ignores the left button for panning', () => {
    host.dispatchEvent(pointerEvent('pointerdown', { button: 0, clientX: 100, clientY: 100 }));
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 400, clientY: 400 }));
    expect(useAppStore.getState().camera).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('zooms on wheel around the cursor', () => {
    host.dispatchEvent(new WheelEvent('wheel', {
      deltaY: -100, clientX: 400, clientY: 300, bubbles: true, cancelable: true,
    }));
    expect(useAppStore.getState().camera.zoom).toBeGreaterThan(1);
  });

  it('stops panning when the pointer is released', () => {
    host.dispatchEvent(pointerEvent('pointerdown', { button: 1, clientX: 0, clientY: 0 }));
    window.dispatchEvent(pointerEvent('pointerup', { button: 1 }));
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 500, clientY: 500 }));
    expect(useAppStore.getState().camera).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});
