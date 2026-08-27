import { useAppStore } from '../state/store';
import { useTerrainTool } from '../map/terrain/terrainTool';
import { useSeaLevel } from '../state/seaLevel';

const PANEL: React.CSSProperties = {
  position: 'absolute', left: 12, bottom: 12, width: 240, padding: 14,
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

export function TerrainPanel() {
  const tool = useAppStore((s) => s.tool);
  const radius = useTerrainTool((s) => s.radius);
  const strength = useTerrainTool((s) => s.strength);
  const mode = useTerrainTool((s) => s.mode);
  const { setRadius, setStrength, setMode } = useTerrainTool.getState();
  const seaLevel = useSeaLevel((s) => s.value);
  const setSeaLevel = useSeaLevel((s) => s.set);

  if (tool !== 'terrain') return null;

  return (
    <div style={PANEL}>
      <div style={{ fontSize: 12, opacity: .55, marginBottom: 10 }}>Рельеф</div>
      <Slider label="Радиус кисти" value={radius} min={16} max={600} step={4} onChange={setRadius} />
      <Slider label="Сила" value={strength} min={5} max={400} step={5} onChange={setStrength} />
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {(['raise', 'lower'] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            style={{
              flex: 1, padding: '7px 0', borderRadius: 7, cursor: 'pointer', fontSize: 13,
              background: mode === m ? '#2f6feb' : '#161d29',
              color: mode === m ? '#fff' : '#c9d4e2',
              border: `1px solid ${mode === m ? '#2f6feb' : '#242e3d'}`,
            }}>
            {m === 'raise' ? 'Повысить' : 'Понизить'}
          </button>
        ))}
      </div>
      <Slider label="Уровень моря" value={seaLevel} min={-1000} max={1000} step={8}
              onChange={setSeaLevel} />
      <div style={{ fontSize: 11, opacity: .5 }}>Alt при рисовании — обратный режим</div>
    </div>
  );
}
