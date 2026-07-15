import { expect, test } from '@playwright/test';

const enabled = process.env['SIGNAL_ATLAS_RUN_SOAK'] === '1';
const durationMs = Number(process.env['SIGNAL_ATLAS_SOAK_DURATION_MS'] ?? 30 * 60_000);

test('@soak fixture world remains interactive and bounded for thirty minutes', async ({ page }) => {
  test.skip(!enabled, 'Set SIGNAL_ATLAS_RUN_SOAK=1 to run the long-session gate.');
  test.setTimeout(durationMs + 120_000);

  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/?capture=1');
  const shell = page.locator('.signal-atlas-shell');
  const scene = page.locator('.atlas-world-canvas');
  await expect(shell).toHaveAttribute('data-event-stream-state', 'live');
  await expect(scene).toHaveAttribute('data-scene-ready', 'true');

  const memorySamples: number[] = [];
  const interactionLatencies: number[] = [];
  const startedAt = Date.now();
  let iteration = 0;
  while (Date.now() - startedAt < durationMs) {
    const zoomIn = iteration % 2 === 0;
    const interactionStartedAt = performance.now();
    await page.getByRole('button', { name: zoomIn ? 'Zoom in' : 'Zoom out' }).click();
    await expect(scene).toHaveAttribute('data-zoom-step', zoomIn ? '1' : '0');
    interactionLatencies.push(performance.now() - interactionStartedAt);
    await expect(shell).toHaveAttribute('data-event-stream-state', 'live');
    await expect(scene).toHaveAttribute('data-scene-ready', 'true');
    const memory = await page.evaluate(() => {
      const measured = performance as Performance & {
        memory?: { usedJSHeapSize: number };
      };
      return measured.memory?.usedJSHeapSize;
    });
    if (memory !== undefined) memorySamples.push(memory);
    iteration += 1;
    await page.waitForTimeout(Math.min(5_000, Math.max(0, durationMs - (Date.now() - startedAt))));
  }

  interactionLatencies.sort((left, right) => left - right);
  const p95 = interactionLatencies[Math.ceil(interactionLatencies.length * 0.95) - 1];
  expect(p95).toBeDefined();
  expect(p95).toBeLessThan(500);
  expect(Number(await scene.getAttribute('data-fps-p10'))).toBeGreaterThan(25);
  expect(pageErrors).toEqual([]);
  if (memorySamples.length > 1) {
    const growth = memorySamples.at(-1)! - memorySamples[0]!;
    expect(growth).toBeLessThan(128 * 1024 * 1024);
  }
});
