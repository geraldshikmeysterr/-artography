import { useEffect, useRef } from 'react';
import { createStage, applyCamera, type Stage } from './stage';
import { createGridLayer } from './gridLayer';
import { attachCameraInput } from './cameraInput';
import { useAppStore } from '../state/store';

export function MapCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let stage: Stage | null = null;
    let detachInput: (() => void) | undefined;
    let unsubscribe: (() => void) | undefined;
    let disposed = false;

    void (async () => {
      const created = await createStage(host);
      if (disposed) { created.destroy(); return; }
      stage = created;

      const grid = createGridLayer();
      created.layers.terrain.addChild(grid.view);

      const redraw = () => {
        const { camera, viewport } = useAppStore.getState();
        applyCamera(created, camera, viewport);
        grid.update(camera, viewport);
      };

      const syncViewport = () => {
        useAppStore.getState().setViewport({
          width: host.clientWidth,
          height: host.clientHeight,
        });
      };

      detachInput = attachCameraInput(host);
      unsubscribe = useAppStore.subscribe(redraw);
      created.app.renderer.on('resize', syncViewport);
      syncViewport();
      redraw();
    })();

    return () => {
      disposed = true;
      unsubscribe?.();
      detachInput?.();
      stage?.destroy();
    };
  }, []);

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />;
}
