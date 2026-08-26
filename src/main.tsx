import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ENV } from './env';
import { useAppStore, type Session } from './state/store';

const root = createRoot(document.getElementById('root')!);
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
