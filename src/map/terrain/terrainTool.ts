import { create } from 'zustand';
import { paintStroke, type BrushShape, type BrushSettings } from './brush';
import type { TerrainLayer } from './terrainLayer';

export const MIN_RADIUS = 16;
export const MAX_RADIUS = 600;
export const MIN_STRENGTH = 5;
export const MAX_STRENGTH = 400;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Один «щелчок» колеса меняет величину на этот множитель. */
const WHEEL_STEP = 1.12;

interface TerrainToolState {
  radius: number;
  /** Единиц высоты в секунду: кисть действует и при неподвижном курсоре. */
  strength: number;
  shape: BrushShape;
  /** true, пока идёт мазок: чужие снепшоты его не затирают. */
  painting: boolean;
  setRadius(v: number): void;
  setStrength(v: number): void;
  setShape(v: BrushShape): void;
  /** notches > 0 — колесо от себя. */
  nudgeRadius(notches: number): void;
  nudgeStrength(notches: number): void;
}

export const useTerrainTool = create<TerrainToolState>((set, get) => ({
  radius: 120,
  strength: 220,
  shape: 'sculpt',
  painting: false,
  setRadius: (radius) => set({ radius: clamp(radius, MIN_RADIUS, MAX_RADIUS) }),
  setStrength: (strength) => set({ strength: clamp(strength, MIN_STRENGTH, MAX_STRENGTH) }),
  setShape: (shape) => set({ shape }),
  nudgeRadius: (notches) => {
    const next = get().radius * Math.pow(WHEEL_STEP, notches);
    set({ radius: Math.round(clamp(next, MIN_RADIUS, MAX_RADIUS)) });
  },
  nudgeStrength: (notches) => {
    const next = get().strength * Math.pow(WHEEL_STEP, notches);
    set({ strength: Math.round(clamp(next, MIN_STRENGTH, MAX_STRENGTH)) });
  },
}));

/** Левая кнопка понижает, правая повышает. */
export function modeForButton(button: number): BrushSettings['mode'] | null {
  if (button === 0) return 'lower';
  if (button === 2) return 'raise';
  return null;
}

export interface TerrainPainter {
  begin(button: number, worldX: number, worldY: number): boolean;
  moveTo(worldX: number, worldY: number): void;
  /** Вызывается каждый кадр: рельеф меняется и когда курсор стоит. */
  tick(seconds: number): void;
  end(): void;
  isPainting(): boolean;
}

export function createTerrainPainter(
  layer: TerrainLayer,
  onStrokeEnd: () => void,
): TerrainPainter {
  let mode: BrushSettings['mode'] | null = null;
  let lastX = 0;
  let lastY = 0;
  let currentX = 0;
  let currentY = 0;

  return {
    begin(button, worldX, worldY) {
      const next = modeForButton(button);
      if (!next) return false;
      mode = next;
      lastX = currentX = worldX;
      lastY = currentY = worldY;
      useTerrainTool.setState({ painting: true });
      return true;
    },

    moveTo(worldX, worldY) {
      currentX = worldX;
      currentY = worldY;
    },

    tick(seconds) {
      if (!mode || seconds <= 0) return;
      const { radius, strength, shape } = useTerrainTool.getState();
      paintStroke(
        layer.store,
        { x: lastX, y: lastY },
        { x: currentX, y: currentY },
        shape,
        { radius, strength, mode },
        seconds,
      );
      lastX = currentX;
      lastY = currentY;
    },

    end() {
      if (!mode) return;
      mode = null;
      useTerrainTool.setState({ painting: false });
      onStrokeEnd();   // ТЗ §5.5: сохранение при отпускании обязательно
    },

    isPainting: () => mode !== null,
  };
}
