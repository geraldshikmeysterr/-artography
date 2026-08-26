import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ENV, ENV_ERROR } from './env';
import { ConfigError } from './ui/ConfigError';
import { useAppStore, type Session } from './state/store';

const root = createRoot(document.getElementById('root')!);

if (ENV_ERROR) {
  root.render(<ConfigError message={ENV_ERROR} />);
} else {
  root.render(<App />);

  // Временная заглушка сессии. Заменяется на startSession() из
  // src/session/session.ts в Плане 01, Task 7 (Discord OAuth).
  const stubSession: Session = {
    userId: 'local',
    username: 'Локальный просмотр',
    avatarUrl: null,
    token: null,
    canEdit: ENV.devCanEdit,
  };
  useAppStore.getState().setSession(stubSession);
}
