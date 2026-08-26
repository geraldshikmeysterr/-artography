import { Application, Container } from 'pixi.js';
import type { Camera, Viewport } from './camera';

export interface StageLayers {
  terrain: Container;
  regions: Container;
  roads: Container;
  points: Container;
  overlay: Container;
}

export interface Stage {
  app: Application;
  world: Container;
  layers: StageLayers;
  destroy(): void;
}

export async function createStage(host: HTMLDivElement): Promise<Stage> {
  const app = new Application();
  await app.init({
    background: 0x0d1117,
    antialias: true,
    resizeTo: host,
    // Шейдер рельефа написан на GLSL и не имеет WGSL-варианта — WebGPU не берём.
    preference: 'webgl',
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  host.appendChild(app.canvas);

  const world = new Container();
  app.stage.addChild(world);

  // ТЗ §5.6: рельеф лежит под всеми векторными слоями.
  const layers: StageLayers = {
    terrain: new Container(),
    regions: new Container(),
    roads: new Container(),
    points: new Container(),
    overlay: new Container(),
  };
  world.addChild(layers.terrain, layers.regions, layers.roads, layers.points, layers.overlay);

  return {
    app,
    world,
    layers,
    destroy() {
      app.destroy(true, { children: true });
    },
  };
}

export function applyCamera(stage: Stage, cam: Camera, vp: Viewport): void {
  stage.world.scale.set(cam.zoom);
  stage.world.position.set(
    -cam.x * cam.zoom + vp.width / 2,
    -cam.y * cam.zoom + vp.height / 2,
  );
}
