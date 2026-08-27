import { useEffect, useRef } from 'react';
import { createStage, applyCamera, type Stage } from './stage';
import { createGridLayer } from './gridLayer';
import { attachCameraInput } from './cameraInput';
import { createChunkStore } from './terrain/chunkStore';
import { DEFAULT_SEA_LEVEL } from './terrain/constants';
import { createTerrainLayer, isTerrainVisible, type TerrainLayer } from './terrain/terrainLayer';
import { useAppStore } from '../state/store';

export function MapCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let stage: Stage | null = null;
    let terrain: TerrainLayer | null = null;
    let detachInput: (() => void) | undefined;
    let unsubscribe: (() => void) | undefined;
    let disposed = false;

    void (async () => {
      const created = await createStage(host);
      if (disposed) { created.destroy(); return; }
      stage = created;

      const store = createChunkStore();
      const terrainLayer = createTerrainLayer(store);
      terrain = terrainLayer;
      created.layers.terrain.addChild(terrainLayer.view);

      const grid = createGridLayer();
      created.layers.overlay.addChild(grid.view);

      if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) {
        const { seedDemoTerrain } = await import('./terrain/demoTerrain');
        seedDemoTerrain(store);
      }

      const redraw = () => {
        const { camera, viewport } = useAppStore.getState();
        applyCamera(created, camera, viewport);
        terrainLayer.update(camera, viewport, DEFAULT_SEA_LEVEL);

        // Рельеф непрозрачен и сам служит фоном. Сетка нужна только там, где
        // он не рисуется — на предельном отдалении, чтобы не остаться в пустоте.
        grid.view.visible = !isTerrainVisible(camera.zoom);
        if (grid.view.visible) grid.update(camera, viewport);
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
      terrain?.destroy();
      stage?.destroy();
    };
  }, []);

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />;
}
