import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@signal-atlas/contracts': fileURLToPath(
        new URL('../contracts/src/index.ts', import.meta.url),
      ),
      '@signal-atlas/test-fixtures': fileURLToPath(
        new URL('../test-fixtures/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    restoreMocks: true,
  },
});
