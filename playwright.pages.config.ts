import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'static-pages.spec.ts',
  outputDir: './test-results/static-pages',
  snapshotPathTemplate: '{testDir}/../visual/{arg}{ext}',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/static-pages' }]],
  use: {
    baseURL: 'http://127.0.0.1:4174/signal-atlas/',
    colorScheme: 'dark',
    locale: 'en-US',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command:
      'pnpm --filter @signal-atlas/web exec vite preview --mode pages --host 127.0.0.1 --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174/signal-atlas/',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
