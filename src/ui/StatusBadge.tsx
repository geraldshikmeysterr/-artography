import { useAppStore } from '../state/store';

export function StatusBadge() {
  const session = useAppStore((s) => s.session);
  if (!session) return null;
  return (
    <div style={{
      position: 'absolute', top: 12, right: 12, padding: '6px 12px',
      borderRadius: 8, background: 'rgba(13,17,23,.82)',
      border: '1px solid #263041', fontSize: 13, zIndex: 20,
    }}>
      {session.username}
      {!session.canEdit && <span style={{ opacity: .65 }}> · только просмотр</span>}
    </div>
  );
}
