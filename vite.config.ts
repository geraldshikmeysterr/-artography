import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Discord Activity проксирует фронтенд через свой домен — разрешаем host-заголовок.
    allowedHosts: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
