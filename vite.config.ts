import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Discord Activity отдаёт фронтенд через <app_id>.discordsays.com, поэтому
    // этот домен нужен в списке. Всё остальное остаётся под защитой Vite от
    // DNS rebinding. Для локального туннеля добавляйте свой домен в
    // .env.local через VITE_EXTRA_ALLOWED_HOST, а не в коммит.
    allowedHosts: [
      '.discordsays.com',
      ...(process.env.VITE_EXTRA_ALLOWED_HOST ? [process.env.VITE_EXTRA_ALLOWED_HOST] : []),
    ],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
