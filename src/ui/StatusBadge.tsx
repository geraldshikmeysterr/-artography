import { useAppStore } from '../state/store';
import { useSyncStatus } from '../map/terrain/terrainSync';

const BADGE: React.CSSProperties = {
  position: 'absolute', top: 12, right: 12, padding: '6px 12px',
  borderRadius: 8, background: 'rgba(13,17,23,.82)',
  border: '1px solid #263041', fontSize: 13, zIndex: 20,
  display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4,
};

export function StatusBadge() {
  const session = useAppStore((s) => s.session);
  const syncError = useSyncStatus((s) => s.error);

  if (!session) return null;
  return (
    <div style={BADGE}>
      <div>
        {session.username}
        {!session.canEdit && <span style={{ opacity: .65 }}> · только просмотр</span>}
      </div>
      {syncError && (
        <div style={{ fontSize: 11, color: '#ff9aa2', maxWidth: 260, textAlign: 'right' }}>
          {syncError}
        </div>
      )}
    </div>
  );
}
