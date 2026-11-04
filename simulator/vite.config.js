import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

// The simulator is a separate app but consumes the shared packages/ modules and
// the hardware/ RTL through the backend. Nothing is duplicated inside simulator/.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
    fs: {
      allow: [repoRoot],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5174',
        changeOrigin: false,
      },
      '/ws': {
        target: 'ws://127.0.0.1:5174',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
