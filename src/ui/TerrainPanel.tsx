import { useAppStore } from '../state/store';
import {
  useTerrainTool, MIN_RADIUS, MAX_RADIUS, MIN_STRENGTH, MAX_STRENGTH,
} from '../map/terrain/terrainTool';
import type { BrushShape } from '../map/terrain/brush';

const PANEL: React.CSSProperties = {
  position: 'absolute', left: 12, bottom: 12, width: 250, padding: 14,
  borderRadius: 12, background: 'rgba(13,17,23,.9)', border: '1px solid #263041', zIndex: 25,
};

function Slider(
  { label, value, min, max, step, onChange }:
  { label: string; value: number; min: number; max: number; step: number; onChange(v: number): void },
) {
  return (
    <label style={{ display: 'block', marginBottom: 12, fontSize: 12, opacity: .85 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span><span style={{ opacity: .6 }}>{value}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
             onChange={(e) => onChange(Number(e.target.value))}
             style={{ width: '100%', marginTop: 4 }} />
    </label>
  );
}

const SHAPES: { id: BrushShape; label: string }[] = [
  { id: 'sculpt', label: 'Рельеф' },
  { id: 'smooth', label: 'Сглаживание' },
];

export function TerrainPanel() {
  const tool = useAppStore((s) => s.tool);
  const radius = useTerrainTool((s) => s.radius);
  const strength = useTerrainTool((s) => s.strength);
  const shape = useTerrainTool((s) => s.shape);
  const { setRadius, setStrength, setShape } = useTerrainTool.getState();

  if (tool !== 'terrain') return null;

  return (
    <div style={PANEL}>
      <div style={{ fontSize: 12, opacity: .55, marginBottom: 10 }}>Кисть</div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {SHAPES.map((s) => (
          <button key={s.id} onClick={() => setShape(s.id)}
            style={{
              flex: 1, padding: '7px 0', borderRadius: 7, cursor: 'pointer', fontSize: 13,
              background: shape === s.id ? '#2f6feb' : '#161d29',
              color: shape === s.id ? '#fff' : '#c9d4e2',
              border: `1px solid ${shape === s.id ? '#2f6feb' : '#242e3d'}`,
            }}>
            {s.label}
          </button>
        ))}
      </div>

      <Slider label="Радиус" value={radius}
              min={MIN_RADIUS} max={MAX_RADIUS} step={4} onChange={setRadius} />
      <Slider label="Сила" value={strength}
              min={MIN_STRENGTH} max={MAX_STRENGTH} step={5} onChange={setStrength} />

      <div style={{ fontSize: 11, opacity: .5, lineHeight: 1.6 }}>
        {shape === 'smooth'
          ? 'Любая кнопка мыши — сглаживать'
          : 'ЛКМ — понизить · ПКМ — повысить'}
        <br />Ctrl + колесо — радиус
        <br />Shift + колесо — сила
      </div>
    </div>
  );
}
