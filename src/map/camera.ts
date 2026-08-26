export interface Camera { x: number; y: number; zoom: number }
export interface Viewport { width: number; height: number }
export type Bounds = [number, number, number, number];

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 8;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function worldToScreen(cam: Camera, wx: number, wy: number, vp: Viewport) {
  return {
    x: (wx - cam.x) * cam.zoom + vp.width / 2,
    y: (wy - cam.y) * cam.zoom + vp.height / 2,
  };
}

export function screenToWorld(cam: Camera, sx: number, sy: number, vp: Viewport) {
  return {
    x: (sx - vp.width / 2) / cam.zoom + cam.x,
    y: (sy - vp.height / 2) / cam.zoom + cam.y,
  };
}

export function zoomAt(cam: Camera, sx: number, sy: number, factor: number, vp: Viewport): Camera {
  const zoom = clamp(cam.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  if (zoom === cam.zoom) return cam;
  const before = screenToWorld(cam, sx, sy, vp);
  const after = screenToWorld({ ...cam, zoom }, sx, sy, vp);
  return { x: cam.x + before.x - after.x, y: cam.y + before.y - after.y, zoom };
}

export function panByScreen(cam: Camera, dxScreen: number, dyScreen: number): Camera {
  return { ...cam, x: cam.x - dxScreen / cam.zoom, y: cam.y - dyScreen / cam.zoom };
}

export function visibleWorldBounds(cam: Camera, vp: Viewport): Bounds {
  const halfW = vp.width / 2 / cam.zoom;
  const halfH = vp.height / 2 / cam.zoom;
  return [cam.x - halfW, cam.y - halfH, cam.x + halfW, cam.y + halfH];
}

export function fitBounds(bbox: Bounds, vp: Viewport, padding = 1.25): Camera {
  const [minX, minY, maxX, maxY] = bbox;
  const width = Math.max(maxX - minX, 1e-6);
  const height = Math.max(maxY - minY, 1e-6);
  const zoom = clamp(
    Math.min(vp.width / (width * padding), vp.height / (height * padding)),
    MIN_ZOOM,
    MAX_ZOOM,
  );
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, zoom };
}
