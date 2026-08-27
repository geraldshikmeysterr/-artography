import { create } from 'zustand';
import { strokeBrush, stampBrush, type BrushSettings } from './brush';
import type { TerrainLayer } from './terrainLayer';
import type { FreehandHandlers } from '../tools/freehand';

interface TerrainToolState {
  radius: number;
  strength: number;
  mode: 'raise' | 'lower';
  /** true, пока пользователь ведёт мазок: чужие снепшоты его не затирают. */
  painting: boolean;
  setRadius(v: number): void;
  setStrength(v: number): void;
  setMode(v: 'raise' | 'lower'): void;
}

export const useTerrainTool = create<TerrainToolState>((set) => ({
  radius: 120,
  strength: 60,
  mode: 'raise',
  painting: false,
  setRadius: (radius) => set({ radius }),
  setStrength: (strength) => set({ strength }),
  setMode: (mode) => set({ mode }),
}));

/**
 * Кисть рельефа. Пока кнопка зажата, рисование полностью локальное —
 * на сервер ничего не уходит (ТЗ §5.4). onStrokeEnd вызывается при отпускании
 * и обязан отправить изменённые чанки (ТЗ §5.5).
 */
export function makeTerrainHandlers(
  layer: TerrainLayer,
  onStrokeEnd: () => void,
): FreehandHandlers {
  let lastX = 0;
  let lastY = 0;
  let inverted = false;

  const settings = (): BrushSettings => {
    const { radius, strength, mode } = useTerrainTool.getState();
    const effective = inverted ? (mode === 'raise' ? 'lower' : 'raise') : mode;
    return { radius, strength, mode: effective };
  };

  const finish = () => {
    inverted = false;
    useTerrainTool.setState({ painting: false });
    onStrokeEnd();
  };

  return {
    onStart(x, y, event) {
      inverted = event.altKey;   // Alt — временная инверсия режима (ТЗ §5.4)
      lastX = x;
      lastY = y;
      useTerrainTool.setState({ painting: true });
      stampBrush(layer.store, x, y, settings());
    },
    onMove(x, y) {
      strokeBrush(layer.store, lastX, lastY, x, y, settings());
      lastX = x;
      lastY = y;
    },
    onFinish: finish,
    onCancel: finish,
  };
}
