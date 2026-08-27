import { useEffect, useRef } from 'react';
import { createStage, applyCamera, type Stage } from './stage';
import { createGridLayer } from './gridLayer';
import { createBrushCursor } from './brushCursor';
import { attachCameraInput } from './cameraInput';
import { attachFreehand } from './tools/freehand';
import { screenToWorld } from './camera';
import { createChunkStore } from './terrain/chunkStore';
import { createTerrainLayer, isTerrainVisible, type TerrainLayer } from './terrain/terrainLayer';
import { makeTerrainHandlers, useTerrainTool } from './terrain/terrainTool';
import { createTerrainSync } from './terrain/terrainSync';
import { chunkRange } from './terrain/chunkMath';
import { visibleWorldBounds } from './camera';
import { useAppStore } from '../state/store';
import { useSeaLevel } from '../state/seaLevel';

export function MapCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let stage: Stage | null = null;
    let terrain: TerrainLayer | null = null;
    const detachers: (() => void)[] = [];
    let disposed = false;

    void (async () => {
      const created = await createStage(host);
      if (disposed) { created.destroy(); return; }
      stage = created;

      const store = createChunkStore();
      const terrainLayer = createTerrainLayer(store);
      terrain = terrainLayer;
      created.layers.terrain.addChild(terrainLayer.view);

      const sync = createTerrainSync(store, terrainLayer);
      sync.start();

      const grid = createGridLayer();
      const brushCursor = createBrushCursor();
      created.layers.overlay.addChild(grid.view, brushCursor.view);

      if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) {
        const { seedDemoTerrain } = await import('./terrain/demoTerrain');
        seedDemoTerrain(store);
      }

      const redraw = () => {
        const { camera, viewport, tool } = useAppStore.getState();
        const { radius, mode } = useTerrainTool.getState();

        applyCamera(created, camera, viewport);
        terrainLayer.update(camera, viewport, useSeaLevel.getState().value);

        // Догружаем чанки видимой области; ensureLoaded сам не повторяет
        // запрос по уже запрошенному диапазону.
        if (isTerrainVisible(camera.zoom)) {
          void sync.ensureLoaded(chunkRange(visibleWorldBounds(camera, viewport), 1))
            .catch((cause) => console.error('terrain load failed', cause));
        }

        // Рельеф непрозрачен и сам служит фоном. Сетка нужна только там, где
        // он не рисуется — на предельном отдалении, чтобы не остаться в пустоте.
        grid.view.visible = !isTerrainVisible(camera.zoom);
        if (grid.view.visible) grid.update(camera, viewport);

        brushCursor.update(camera, tool === 'terrain', radius, mode);
      };

      // Пока идёт мазок, перерисовываем каждый кадр: высоты меняются
      // непрерывно, а сторы во время мазка не обновляются.
      created.app.ticker.add(() => {
        if (useTerrainTool.getState().painting) redraw();
      });

      const onHostPointerMove = (e: PointerEvent) => {
        if (useAppStore.getState().tool !== 'terrain') return;
        const rect = host.getBoundingClientRect();
        const { camera, viewport } = useAppStore.getState();
        const w = screenToWorld(camera, e.clientX - rect.left, e.clientY - rect.top, viewport);
        brushCursor.setPosition(w.x, w.y);
        if (!useTerrainTool.getState().painting) redraw();
      };
      host.addEventListener('pointermove', onHostPointerMove);
      detachers.push(() => host.removeEventListener('pointermove', onHostPointerMove));

      // ТЗ §5.5: при отпускании кнопки сохраняем обязательно.
      const terrainHandlers = makeTerrainHandlers(terrainLayer, () => {
        redraw();
        void sync.flush();
      });
      detachers.push(attachFreehand(host, () =>
        useAppStore.getState().tool === 'terrain' ? terrainHandlers : null));

      const syncViewport = () => {
        useAppStore.getState().setViewport({
          width: host.clientWidth,
          height: host.clientHeight,
        });
      };

      const flushBeforeUnload = () => { void sync.flush(); };
      window.addEventListener('beforeunload', flushBeforeUnload);
      detachers.push(() => {
        window.removeEventListener('beforeunload', flushBeforeUnload);
        sync.stop();
      });

      detachers.push(attachCameraInput(host));
      detachers.push(useAppStore.subscribe(redraw));
      detachers.push(useTerrainTool.subscribe(redraw));
      detachers.push(useSeaLevel.subscribe(redraw));
      created.app.renderer.on('resize', syncViewport);
      syncViewport();
      redraw();
    })();

    return () => {
      disposed = true;
      for (const detach of detachers) detach();
      terrain?.destroy();
      stage?.destroy();
    };
  }, []);

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />;
}
