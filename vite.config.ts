import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Where `/api` is forwarded; override to point the dev server at another API instance.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3001';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    // The document editor (TipTap + ProseMirror) is one lazily loaded chunk of
    // about 560 kB; everything users load first is far smaller.
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
