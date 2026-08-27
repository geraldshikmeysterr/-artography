import { useAppStore } from '../state/store';
import { useSyncStatus } from '../map/terrain/terrainSync';

const BADGE: React.CSSProperties = {
  position: 'absolute', top: 12, right: 12, padding: '6px 12px',
  borderRadius: 8, background: 'rgba(13,17,23,.82)',
  border: '1px solid #263041', fontSize: 13, zIndex: 20,
  display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4,
  maxWidth: 300,
};

/** Причина отказа понятным текстом: код диагностирует, текст объясняет. */
function explainReason(reason: string | null): string | null {
  if (!reason) return null;
  if (reason === 'role-not-assigned') return 'Роль редактора вам не выдана';
  if (reason === 'no-guild-context') return 'Активность запущена вне сервера';
  if (reason === 'not-configured') return 'Роль редактора не настроена на сервере';
  if (reason === 'session-failed') return 'Не удалось авторизоваться';
  if (reason.startsWith('member-lookup-failed')) {
    return 'Бот не приглашён на этот сервер или не видит участников';
  }
  return null;
}

export function StatusBadge() {
  const session = useAppStore((s) => s.session);
  const syncError = useSyncStatus((s) => s.error);

  if (!session) return null;
  const hint = session.canEdit ? null : explainReason(session.canEditReason);

  return (
    <div style={BADGE}>
      <div>
        {session.username}
        {!session.canEdit && <span style={{ opacity: .65 }}> · только просмотр</span>}
      </div>
      {hint && (
        <div style={{ fontSize: 11, opacity: .6, textAlign: 'right' }}>{hint}</div>
      )}
      {syncError && (
        <div style={{ fontSize: 11, color: '#ff9aa2', textAlign: 'right' }}>{syncError}</div>
      )}
    </div>
  );
}
