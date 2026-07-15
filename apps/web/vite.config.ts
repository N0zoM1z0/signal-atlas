import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export const browserSecurityHeaders = {
  'Content-Security-Policy': "frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
} as const;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@signal-atlas/archive': fileURLToPath(
        new URL('../../packages/archive/src/index.ts', import.meta.url),
      ),
      '@signal-atlas/contracts': fileURLToPath(
        new URL('../../packages/contracts/src/index.ts', import.meta.url),
      ),
      '@signal-atlas/game-scene': fileURLToPath(
        new URL('../../packages/game-scene/src/index.ts', import.meta.url),
      ),
      '@signal-atlas/simulation': fileURLToPath(
        new URL('../../packages/simulation/src/index.ts', import.meta.url),
      ),
      '@signal-atlas/test-fixtures': fileURLToPath(
        new URL('../../packages/test-fixtures/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    headers: browserSecurityHeaders,
    proxy: {
      '/api': { target: 'http://127.0.0.1:4317', ws: true },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    headers: browserSecurityHeaders,
  },
});
