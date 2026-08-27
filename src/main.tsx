import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ENV_ERROR } from './env';
import { ConfigError } from './ui/ConfigError';
import { startSession } from './session/session';
import { useAppStore } from './state/store';

const root = createRoot(document.getElementById('root')!);

if (ENV_ERROR) {
  root.render(<ConfigError message={ENV_ERROR} />);
} else {
  root.render(<App />);

  void startSession()
    .then((session) => useAppStore.getState().setSession(session))
    .catch((cause) => {
      // Авторизация упала — карта всё равно должна открыться на просмотр.
      console.error('session failed', cause);
      useAppStore.getState().setSession({
        userId: 'anonymous',
        username: 'Гость',
        avatarUrl: null,
        token: null,
        canEdit: false,
        canEditReason: 'session-failed',
      });
    });
}
