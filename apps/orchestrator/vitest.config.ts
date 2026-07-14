import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@signal-atlas/contracts': fileURLToPath(
        new URL('../../packages/contracts/src/index.ts', import.meta.url),
      ),
      '@signal-atlas/simulation': fileURLToPath(
        new URL('../../packages/simulation/src/index.ts', import.meta.url),
      ),
      '@signal-atlas/test-fixtures': fileURLToPath(
        new URL('../../packages/test-fixtures/src/index.ts', import.meta.url),
      ),
    },
  },
});
