import { expect, test } from '@playwright/test';

test.use({ reducedMotion: 'no-preference' });

test.beforeEach(async ({ request }) => {
  await request.post('/api/testing/reset');
});

test('world input remains responsive during active work and meets the scene budget', async ({
  page,
}) => {
  await page.goto('/?capture=1');
  const scene = page.locator('.atlas-world-canvas');
  await expect(scene).toHaveAttribute('data-scene-ready', 'true');
  await expect
    .poll(async () => Number(await scene.getAttribute('data-fps-sample-count')), {
      timeout: 15_000,
    })
    .toBeGreaterThanOrEqual(5);
  expect(Number(await scene.getAttribute('data-fps-p10'))).toBeGreaterThan(30);
  const idleSampleCount = Number(await scene.getAttribute('data-fps-sample-count'));

  await page.getByRole('button', { name: /Dispatch/ }).click();
  await page.getByRole('button', { name: 'Confirm mission' }).click();
  await expect(page.locator('[data-agent="mira"] .atlas-agent-card__status')).toContainText(
    'Traveling',
  );
  await expect
    .poll(async () => Number(await scene.getAttribute('data-fps-sample-count')), {
      timeout: 10_000,
    })
    .toBeGreaterThan(idleSampleCount);
  expect(Number(await scene.getAttribute('data-fps-p10'))).toBeGreaterThan(30);

  const latencies: number[] = [];
  for (let index = 0; index < 8; index += 1) {
    const expectedStep = index % 2 === 0 ? '1' : '0';
    const startedAt = performance.now();
    await page.getByRole('button', { name: index % 2 === 0 ? 'Zoom in' : 'Zoom out' }).click();
    await expect(scene).toHaveAttribute('data-zoom-step', expectedStep);
    latencies.push(performance.now() - startedAt);
  }
  latencies.sort((left, right) => left - right);
  const p95 = latencies[Math.ceil(latencies.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
  expect(p95).toBeLessThan(500);
});
