import { useAppStore, type ToolId } from '../state/store';

// ТЗ §10: ровно этот список и в этом порядке, без лишнего.
const TOOLS: { id: ToolId; label: string }[] = [
  { id: 'region', label: 'Новый регион' },
  { id: 'point', label: 'Новый объект' },
  { id: 'state', label: 'Новое государство' },
  { id: 'cultural', label: 'Культурный регион' },
  { id: 'terrain', label: 'Рельеф' },
  { id: 'road', label: 'Дорога' },
];

/** Инструменты, которые ещё не реализованы, показываются неактивными. */
const IMPLEMENTED = new Set<ToolId>(['terrain']);

export function Toolbar() {
  const tool = useAppStore((s) => s.tool);
  const roadType = useAppStore((s) => s.roadType);
  const selectTool = useAppStore((s) => s.selectTool);
  const canEdit = useAppStore((s) => s.session?.canEdit ?? false);

  if (!canEdit) return null;

  return (
    <div style={{
      position: 'absolute', left: 12, top: 12, display: 'flex', flexDirection: 'column',
      gap: 6, padding: 8, borderRadius: 12, background: 'rgba(13,17,23,.86)',
      border: '1px solid #263041', zIndex: 20,
    }}>
      {TOOLS.map((t) => {
        const active = tool === t.id;
        const ready = IMPLEMENTED.has(t.id);
        return (
          <button
            key={t.id}
            onClick={() => ready && selectTool(t.id)}
            disabled={!ready}
            title={ready ? undefined : 'Ещё не реализовано'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              padding: '8px 12px', borderRadius: 8, fontSize: 14, textAlign: 'left',
              cursor: ready ? 'pointer' : 'default',
              opacity: ready ? 1 : 0.38,
              background: active ? '#2f6feb' : '#161d29',
              color: active ? '#fff' : '#c9d4e2',
              border: `1px solid ${active ? '#2f6feb' : '#242e3d'}`,
            }}
          >
            <span>{t.label}</span>
            {t.id === 'road' && (
              <span style={{ display: 'flex', gap: 4 }}
                    title={roadType === 'major' ? 'Крупная' : 'Малая'}>
                <Dot active={roadType === 'major'} />
                <Dot active={roadType === 'minor'} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Dot({ active }: { active: boolean }) {
  return (
    <span style={{
      width: 7, height: 7, borderRadius: '50%',
      background: active ? '#ffd479' : 'rgba(255,255,255,.22)',
    }} />
  );
}
