import { describe, it, expect } from 'vitest';
import {
  worldToScreen, screenToWorld, zoomAt, panByScreen,
  visibleWorldBounds, fitBounds, MIN_ZOOM, MAX_ZOOM,
} from '../src/map/camera';

const vp = { width: 800, height: 600 };

describe('camera', () => {
  it('maps the camera centre to the viewport centre', () => {
    const p = worldToScreen({ x: 100, y: 50, zoom: 2 }, 100, 50, vp);
    expect(p).toEqual({ x: 400, y: 300 });
  });

  it('round-trips screen and world coordinates', () => {
    const cam = { x: -37.5, y: 12.25, zoom: 0.37 };
    const w = screenToWorld(cam, 123, 456, vp);
    const s = worldToScreen(cam, w.x, w.y, vp);
    expect(s.x).toBeCloseTo(123, 6);
    expect(s.y).toBeCloseTo(456, 6);
  });

  it('keeps the world point under the cursor fixed while zooming', () => {
    const cam = { x: 0, y: 0, zoom: 1 };
    const before = screenToWorld(cam, 700, 100, vp);
    const zoomed = zoomAt(cam, 700, 100, 1.25, vp);
    const after = screenToWorld(zoomed, 700, 100, vp);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(zoomed.zoom).toBeCloseTo(1.25, 6);
  });

  it('clamps zoom to the allowed range', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: MAX_ZOOM }, 0, 0, 4, vp).zoom).toBe(MAX_ZOOM);
    expect(zoomAt({ x: 0, y: 0, zoom: MIN_ZOOM }, 0, 0, 0.25, vp).zoom).toBe(MIN_ZOOM);
  });

  it('pans in world units scaled by zoom', () => {
    expect(panByScreen({ x: 0, y: 0, zoom: 2 }, 100, -40))
      .toEqual({ x: -50, y: 20, zoom: 2 });
  });

  it('reports the visible world rectangle', () => {
    expect(visibleWorldBounds({ x: 0, y: 0, zoom: 2 }, vp))
      .toEqual([-200, -150, 200, 150]);
  });

  it('fits a bounding box with padding and centres on it', () => {
    const cam = fitBounds([0, 0, 400, 300], vp, 1);
    expect(cam.x).toBeCloseTo(200, 6);
    expect(cam.y).toBeCloseTo(150, 6);
    expect(cam.zoom).toBeCloseTo(2, 6);
  });

  it('never produces zero zoom for a degenerate bounding box', () => {
    const cam = fitBounds([10, 10, 10, 10], vp);
    expect(cam.zoom).toBeGreaterThan(0);
    expect(cam.zoom).toBeLessThanOrEqual(MAX_ZOOM);
  });
});
