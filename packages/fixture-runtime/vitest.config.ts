import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@signal-atlas/contracts': fileURLToPath(
        new URL('../contracts/src/index.ts', import.meta.url),
      ),
      '@signal-atlas/simulation': fileURLToPath(
        new URL('../simulation/src/index.ts', import.meta.url),
      ),
    },
  },
});
