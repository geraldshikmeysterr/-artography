import {
  Container, Mesh, MeshGeometry, Shader, GlProgram, BufferImageSource, Texture,
} from 'pixi.js';
import type { TextureShader } from 'pixi.js';
import type { Camera, Viewport } from '../camera';
import { visibleWorldBounds } from '../camera';
import type { ChunkStore } from './chunkStore';
import { buildChunkTextureData } from './apron';
import { chunkKey, chunkRange, chunkOrigin } from './chunkMath';
import {
  CHUNK_WORLD, CHUNK_CELLS, TEX_SIZE, APRON, CELL_SIZE,
  DEFAULT_CONTOUR_STEP, MAJOR_CONTOUR_EVERY, TERRAIN_PALETTE,
} from './constants';
import { TERRAIN_FRAGMENT, TERRAIN_VERTEX } from './terrain.frag';

/** Ниже этого масштаба чанк занимает меньше 8 экранных пикселей и нечитаем. */
export const MIN_CHUNK_SCREEN_SIZE = 8;

/** Рисуется ли рельеф на текущем зуме. Ниже этого порога его заменяет сетка. */
export const isTerrainVisible = (zoom: number): boolean =>
  CHUNK_WORLD * zoom >= MIN_CHUNK_SCREEN_SIZE;

interface ChunkView {
  mesh: Mesh;
  shader: Shader;
  source: BufferImageSource;
  buffer: Uint16Array;
  uploadedRevision: number;
}

export interface TerrainLayer {
  view: Container;
  store: ChunkStore;
  update(camera: Camera, viewport: Viewport, seaLevel: number): void;
  invalidate(cx: number, cy: number): void;
  destroy(): void;
}

export function createTerrainLayer(store: ChunkStore): TerrainLayer {
  const view = new Container();
  const views = new Map<string, ChunkView>();
  const program = GlProgram.from({ vertex: TERRAIN_VERTEX, fragment: TERRAIN_FRAGMENT });

  function makeChunkView(cx: number, cy: number): ChunkView {
    const origin = chunkOrigin(cx, cy);
    const geometry = new MeshGeometry({
      positions: new Float32Array([
        origin.x, origin.y,
        origin.x + CHUNK_WORLD, origin.y,
        origin.x + CHUNK_WORLD, origin.y + CHUNK_WORLD,
        origin.x, origin.y + CHUNK_WORLD,
      ]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });

    const buffer = new Uint16Array(TEX_SIZE * TEX_SIZE);
    const source = new BufferImageSource({
      resource: buffer,
      width: TEX_SIZE,
      height: TEX_SIZE,
      format: 'r16float',
      scaleMode: 'linear',
      addressMode: 'clamp-to-edge',
    });

    // Mesh требует шейдер с полем texture (TextureShader) — отдаём ему ту же
    // текстуру высот, которую сэмплит фрагментный шейдер.
    const texture = new Texture({ source });
    const shader = Object.assign(new Shader({
      glProgram: program,
      resources: {
        uHeight: source,
        terrainUniforms: {
          uUvOrigin: {
            value: new Float32Array([APRON / TEX_SIZE, APRON / TEX_SIZE]), type: 'vec2<f32>',
          },
          uUvScale: {
            value: new Float32Array([CHUNK_CELLS / TEX_SIZE, CHUNK_CELLS / TEX_SIZE]),
            type: 'vec2<f32>',
          },
          uSeaLevel: { value: 0, type: 'f32' },
          uContourStep: { value: DEFAULT_CONTOUR_STEP, type: 'f32' },
          uMajorEvery: { value: MAJOR_CONTOUR_EVERY, type: 'f32' },
          uCellSize: { value: CELL_SIZE, type: 'f32' },
          uLandLow: { value: new Float32Array(TERRAIN_PALETTE.landLow), type: 'vec3<f32>' },
          uLandHigh: { value: new Float32Array(TERRAIN_PALETTE.landHigh), type: 'vec3<f32>' },
          uWaterShallow: {
            value: new Float32Array(TERRAIN_PALETTE.waterShallow), type: 'vec3<f32>',
          },
          uWaterDeep: { value: new Float32Array(TERRAIN_PALETTE.waterDeep), type: 'vec3<f32>' },
          uLineColor: { value: new Float32Array(TERRAIN_PALETTE.line), type: 'vec3<f32>' },
        },
      },
    }), { texture }) as Shader & TextureShader;

    const mesh = new Mesh({ geometry, shader });
    view.addChild(mesh);
    return { mesh, shader, source, buffer, uploadedRevision: -1 };
  }

  function disposeView(key: string, chunkView: ChunkView) {
    view.removeChild(chunkView.mesh);
    chunkView.mesh.destroy(true);
    chunkView.source.destroy();
    views.delete(key);
  }

  function update(camera: Camera, viewport: Viewport, seaLevel: number) {
    const range = chunkRange(visibleWorldBounds(camera, viewport), 1);

    // На предельном отдалении рельеф всё равно нечитаем — не тратим GPU.
    if (!isTerrainVisible(camera.zoom)) {
      for (const [key, chunkView] of [...views]) disposeView(key, chunkView);
      return;
    }

    const wanted = new Set<string>();
    for (let cy = range.minCY; cy <= range.maxCY; cy++) {
      for (let cx = range.minCX; cx <= range.maxCX; cx++) {
        const key = chunkKey(cx, cy);
        wanted.add(key);

        let chunkView = views.get(key);
        if (!chunkView) {
          chunkView = makeChunkView(cx, cy);
          views.set(key, chunkView);
        }

        const chunk = store.ensure(cx, cy);
        if (chunk.revision !== chunkView.uploadedRevision) {
          buildChunkTextureData(store, cx, cy, chunkView.buffer);
          chunkView.source.update();
          chunkView.uploadedRevision = chunk.revision;
        }

        chunkView.shader.resources.terrainUniforms.uniforms.uSeaLevel = seaLevel;
      }
    }

    for (const [key, chunkView] of [...views]) {
      if (!wanted.has(key)) disposeView(key, chunkView);
    }
  }

  return {
    view,
    store,
    update,
    invalidate(cx, cy) {
      const chunkView = views.get(chunkKey(cx, cy));
      if (chunkView) chunkView.uploadedRevision = -1;
    },
    destroy() {
      for (const chunkView of views.values()) {
        chunkView.mesh.destroy(true);
        chunkView.source.destroy();
      }
      views.clear();
      view.destroy({ children: true });
    },
  };
}
