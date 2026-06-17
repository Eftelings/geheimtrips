import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // API liegt jetzt selbst unter /api → ohne Rewrite weiterleiten.
      // ws: true deckt auch den Geheimquiz-WebSocket (/api/game/ws) ab.
      '/api': { target: 'http://localhost:3001', changeOrigin: true, ws: true },
    },
  },
});
