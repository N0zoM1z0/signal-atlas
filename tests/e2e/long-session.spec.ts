import { expect, test } from '@playwright/test';

const enabled = process.env['SIGNAL_ATLAS_RUN_SOAK'] === '1';
const durationMs = Number(process.env['SIGNAL_ATLAS_SOAK_DURATION_MS'] ?? 30 * 60_000);
const missions = [
  {
    agentId: 'mira',
    agentName: 'Mira',
    objective: 'Check latest weather at Galehaven Weather Tower',
    signal: 'Crosswind advisory overlaps launch window',
    startFraction: 0,
  },
  {
    agentId: 'orin',
    agentName: 'Orin',
    objective: 'Search historical delays in Archive Quarter',
    signal: 'Comparable windows often slipped under crosswind advisories',
    startFraction: 1 / 3,
  },
  {
    agentId: 'kestrel',
    agentName: 'Kestrel',
    objective: 'Verify operations notice in Ledger Bay Newsroom',
    signal: 'Countdown operations remain scheduled',
    startFraction: 2 / 3,
  },
] as const;

test.use({ reducedMotion: 'no-preference' });

test('@soak fixture world remains interactive and bounded for thirty minutes', async ({
  page,
}, testInfo) => {
  test.skip(!enabled, 'Set SIGNAL_ATLAS_RUN_SOAK=1 to run the long-session gate.');
  test.setTimeout(durationMs + 120_000);

  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  const shell = page.locator('.signal-atlas-shell');
  const scene = page.locator('.atlas-world-canvas');
  await expect(shell).toHaveAttribute('data-event-stream-state', 'live');
  await expect(scene).toHaveAttribute('data-scene-ready', 'true');
  await expect
    .poll(async () => Number(await scene.getAttribute('data-fps-sample-count')), {
      timeout: 15_000,
    })
    .toBeGreaterThanOrEqual(5);
  await expect(page.getByRole('complementary', { name: 'First expedition guide' })).toBeVisible();
  await page.getByLabel('Skip travel').check();

  const memorySamples: number[] = [];
  const interactionLatencies: number[] = [];
  const fpsP10Samples: number[] = [];
  const startedAt = Date.now();
  let iteration = 0;
  let lastSequence = Number(await shell.getAttribute('data-event-stream-sequence'));
  let completedMissions = 0;
  while (Date.now() - startedAt < durationMs) {
    const elapsedFraction = (Date.now() - startedAt) / durationMs;
    const mission = missions[completedMissions];
    if (mission && elapsedFraction >= mission.startFraction) {
      const previousCue = (await scene.getAttribute('data-rendered-cue')) ?? '';
      const previousFpsSampleCount = Number(await scene.getAttribute('data-fps-sample-count'));
      await page.locator(`.atlas-agent-card[data-agent="${mission.agentId}"]`).click();
      await page
        .getByRole('textbox', { name: `Command ${mission.agentName}` })
        .fill(mission.objective);
      await page.getByRole('button', { name: /Dispatch/ }).click();
      await page.getByRole('button', { name: 'Confirm mission' }).click();
      await expect(page.getByRole('heading', { name: mission.signal })).toBeVisible({
        timeout: 8_000,
      });
      await expect
        .poll(async () => (await scene.getAttribute('data-rendered-cue')) ?? '', {
          timeout: 8_000,
        })
        .not.toBe(previousCue);
      await page.getByRole('button', { name: 'Close mission queue' }).click();
      await expect
        .poll(async () => Number(await scene.getAttribute('data-fps-sample-count')), {
          timeout: 10_000,
        })
        .toBeGreaterThan(previousFpsSampleCount);
      fpsP10Samples.push(Number(await scene.getAttribute('data-fps-p10')));
      await expect
        .poll(async () => Number(await shell.getAttribute('data-event-stream-sequence')))
        .toBeGreaterThan(lastSequence);
      lastSequence = Number(await shell.getAttribute('data-event-stream-sequence'));
      completedMissions += 1;
    }

    const zoomIn = iteration % 2 === 0;
    const interactionStartedAt = performance.now();
    await page.getByRole('button', { name: zoomIn ? 'Zoom in' : 'Zoom out' }).click();
    await expect(scene).toHaveAttribute('data-zoom-step', zoomIn ? '1' : '0');
    interactionLatencies.push(performance.now() - interactionStartedAt);
    await expect(shell).toHaveAttribute('data-event-stream-state', 'live');
    await expect(scene).toHaveAttribute('data-scene-ready', 'true');
    const sequence = Number(await shell.getAttribute('data-event-stream-sequence'));
    expect(sequence).toBeGreaterThanOrEqual(lastSequence);
    lastSequence = sequence;
    await expect(scene.locator('canvas')).toHaveCount(1);
    fpsP10Samples.push(Number(await scene.getAttribute('data-fps-p10')));
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
  const minimumFpsP10 = Math.min(...fpsP10Samples);
  const memoryGrowthBytes =
    memorySamples.length > 1 ? memorySamples.at(-1)! - memorySamples[0]! : undefined;
  const metrics = {
    durationMs,
    completedMissions,
    finalSequence: lastSequence,
    minimumFpsP10,
    interactions: interactionLatencies.length,
    memoryGrowthBytes,
    pageErrors: pageErrors.length,
    p95InteractionLatencyMs: p95,
  };
  await testInfo.attach('soak-metrics.json', {
    body: Buffer.from(`${JSON.stringify(metrics, null, 2)}\n`),
    contentType: 'application/json',
  });
  process.stdout.write(`SOAK_METRICS ${JSON.stringify(metrics)}\n`);
  expect(p95).toBeDefined();
  expect(p95).toBeLessThan(500);
  expect(minimumFpsP10).toBeGreaterThan(25);
  expect(completedMissions).toBe(missions.length);
  expect(pageErrors).toEqual([]);
  if (memoryGrowthBytes !== undefined) {
    expect(memoryGrowthBytes).toBeLessThan(128 * 1024 * 1024);
  }
});
