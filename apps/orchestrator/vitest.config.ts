import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      SIGNAL_ATLAS_CODEX_EXECUTABLE: '',
      SIGNAL_ATLAS_CODEX_MODE: 'scripted',
      SIGNAL_ATLAS_CODEX_MODEL: '',
      SIGNAL_ATLAS_PREF_BEARER_TOKEN: '',
      SIGNAL_ATLAS_PREF_MODE: 'fixture',
      SIGNAL_ATLAS_PREF_URL: '',
    },
  },
  resolve: {
    alias: {
      '@signal-atlas/contracts': fileURLToPath(
        new URL('../../packages/contracts/src/index.ts', import.meta.url),
      ),
      '@signal-atlas/fixture-runtime': fileURLToPath(
        new URL('../../packages/fixture-runtime/src/index.ts', import.meta.url),
      ),
      '@signal-atlas/simulation': fileURLToPath(
        new URL('../../packages/simulation/src/index.ts', import.meta.url),
      ),
      '@signal-atlas/test-fixtures': fileURLToPath(
        new URL('../../packages/test-fixtures/src/index.ts', import.meta.url),
      ),
      '@signal-atlas/world-content': fileURLToPath(
        new URL('../../packages/world-content/src/index.ts', import.meta.url),
      ),
    },
  },
});
