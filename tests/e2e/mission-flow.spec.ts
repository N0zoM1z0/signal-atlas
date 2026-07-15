import { expect, test } from '@playwright/test';

const snapshotUrl = '/api/expeditions/exp-helios3-demo/snapshot';

test.beforeEach(async ({ request }) => {
  await request.post('/api/testing/reset');
});

test.afterEach(async ({ request }) => {
  await request.post('/api/testing/reset');
});

interface MissionSnapshot {
  projection: {
    sequence: number;
    agentsById: Record<
      string,
      {
        movement?: { progress: number; routeId: string };
        placeId: string;
        publicState: string;
      }
    >;
    missionsById: Record<string, { status: string }>;
  };
}

test('authored guidance prepares a complete local draft at a compact viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 450 });
  await page.goto('/');

  await expect(page.getByLabel('Offline mission result')).toHaveCount(0);
  await page
    .getByRole('complementary', { name: 'First expedition guide' })
    .getByRole('button', { name: 'Prepare mission for Mira' })
    .click();

  await expect(page.getByLabel('Mission agent')).toHaveValue('mira');
  await expect(page.getByLabel('Mission destination')).toHaveValue('weather-tower');
  await expect(page.getByLabel('Mission type')).toHaveValue('observe_conditions');
  const confirm = page.getByRole('button', { name: /^Confirm mission/ });
  await expect(confirm).toBeEnabled();
  await expect(confirm).toBeFocused();

  const queueBox = await page.locator('.atlas-command-queue').boundingBox();
  expect(queueBox).not.toBeNull();
  expect(queueBox?.x).toBeGreaterThanOrEqual(0);
  expect(queueBox?.y).toBeGreaterThanOrEqual(0);
  expect((queueBox?.x ?? 0) + (queueBox?.width ?? 0)).toBeLessThanOrEqual(720);
  expect((queueBox?.y ?? 0) + (queueBox?.height ?? 0)).toBeLessThanOrEqual(450);
});

test('confirmed missions travel, resume from projection, and preserve explicit controls', async ({
  page,
}) => {
  const snapshot = async () => {
    const response = await page.request.get(snapshotUrl);
    return (await response.json()) as MissionSnapshot;
  };

  await page.goto('/');
  await expect(page.getByRole('main', { name: 'Interactive world stage' })).toBeVisible();

  // Interaction 1: the explicit phrase is interpreted but cannot mutate the world.
  await page.getByRole('button', { name: 'Review mission' }).click();
  await expect(page.getByRole('heading', { name: 'Mission draft' })).toBeVisible();
  await expect(page.getByLabel('Mission agent')).toHaveValue('mira');
  await expect(page.getByLabel('Mission destination')).toHaveValue('weather-tower');
  await expect(page.getByLabel('Mission type')).toHaveValue('observe_conditions');

  // Interaction 2: confirmation appends mission and first-leg travel events.
  await page.getByRole('button', { name: /^Confirm mission/ }).click();
  await expect(page.getByText('Mira → Galehaven Weather Tower · traveling')).toBeVisible();
  await expect(page.locator('[data-agent="mira"] .atlas-agent-card__status')).toContainText(
    'Traveling',
  );
  await expect(page.locator('.atlas-world-canvas')).toHaveAttribute('data-agent-state', 'walk');

  const travelingSnapshot = await snapshot();
  const initialProgress = travelingSnapshot.projection.agentsById['mira']?.movement?.progress ?? 0;
  expect(Object.values(travelingSnapshot.projection.missionsById)).toContainEqual(
    expect.objectContaining({ status: 'traveling' }),
  );

  // Browser refresh reloads the moving projection; the scene continues from authoritative progress.
  await page.reload();
  await expect(page.locator('[data-agent="mira"] .atlas-agent-card__status')).toContainText(
    'Traveling',
  );
  await expect
    .poll(async () => (await snapshot()).projection.agentsById['mira']?.movement?.progress ?? 0)
    .toBeGreaterThan(initialProgress);

  // Pausing is authoritative: both the event cursor and movement freeze.
  await page.getByRole('button', { name: 'Pause simulation' }).click();
  await expect(page.getByRole('button', { name: 'Resume simulation' })).toBeVisible();
  const pausedSnapshot = await snapshot();
  await page.waitForTimeout(500);
  const stillPausedSnapshot = await snapshot();
  expect(stillPausedSnapshot.projection.sequence).toBe(pausedSnapshot.projection.sequence);
  expect(stillPausedSnapshot.projection.agentsById['mira']?.movement?.progress).toBe(
    pausedSnapshot.projection.agentsById['mira']?.movement?.progress,
  );

  // A keyboard-only ambiguous phrase remains local and does not advance the paused cursor.
  await page.keyboard.press('/');
  const command = page.getByLabel('Command Mira');
  await command.fill('Look into the launch question');
  await command.press('Enter');
  await expect(page.getByRole('heading', { name: 'Mission draft' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Confirm mission/ })).toBeDisabled();
  await expect(page.getByText(/Confirmation is blocked/)).toBeVisible();
  expect((await snapshot()).projection.sequence).toBe(pausedSnapshot.projection.sequence);
  await page.getByRole('button', { name: 'Cancel draft' }).click();

  // Explicit skip emits remaining arrivals before the work phase and gives Phaser an arrival hint.
  await page.getByRole('button', { name: 'Skip travel' }).click();
  await expect(page.locator('[data-agent="mira"] .atlas-agent-card__status')).toContainText(
    'Working',
  );
  await expect(page.locator('[data-agent="mira"] .atlas-agent-card__location')).toContainText(
    'Galehaven Weather Tower',
  );
  await expect(page.locator('.atlas-world-canvas')).toHaveAttribute('data-agent-state', 'work');
  await expect(page.locator('.atlas-world-canvas')).toHaveAttribute('data-arrival-agent', 'mira');

  await page.getByRole('button', { name: 'Resume simulation' }).click();
  await page.getByRole('button', { name: 'Simulation speed 1 times' }).click();
  await expect(page.getByRole('button', { name: 'Simulation speed 2 times' })).toBeVisible();

  // The preference is durable and will auto-skip future travel through the same command boundary.
  const preference = page.getByLabel('Skip travel');
  await preference.check();
  await page.reload();
  await expect(page.getByLabel('Skip travel')).toBeChecked();

  await expect(
    page.getByRole('heading', { name: 'Crosswind advisory overlaps launch window' }),
  ).toBeVisible({ timeout: 5_000 });
  await page.getByRole('button', { name: /Mission queue/ }).click();
  await expect(page.getByText('No queued missions. Your team is ready.')).toBeVisible();
});

test('injected failures remain visible and recover through an explicit retry', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.getByRole('button', { name: /Mission queue/ }).click();
  await page.getByLabel('Offline mission result').selectOption('timeout');
  await page.getByRole('button', { name: 'Close mission queue' }).click();

  await page.getByRole('button', { name: 'Review mission' }).click();
  await page.getByRole('button', { name: /^Confirm mission/ }).click();
  await page.getByRole('button', { name: 'Skip travel' }).click();

  const failedMission = page.getByText('Mira → Galehaven Weather Tower · failed');
  await expect(failedMission).toBeVisible({ timeout: 5_000 });
  await expect(
    page.getByText('The scripted source request exceeded its injected time limit.'),
  ).toBeVisible();
  await page.getByLabel('Offline mission result').selectOption('success');
  await page
    .getByRole('button', {
      name: 'Retry Check the latest evidence at Galehaven Weather Tower',
    })
    .click();

  await expect(page.getByText('Mira → Galehaven Weather Tower · running')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Crosswind advisory overlaps launch window' }),
  ).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText('No queued missions. Your team is ready.')).toBeVisible();
});

test('all authored agents complete their evidence missions without external services', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Skip travel').check();
  await page.getByRole('button', { name: 'Simulation speed 1 times' }).click();
  await page.getByRole('button', { name: 'Simulation speed 2 times' }).click();

  const dispatch = async (
    agentId: 'mira' | 'orin' | 'kestrel',
    agentName: 'Mira' | 'Orin' | 'Kestrel',
    objective: string,
    signalHeadline: string,
  ) => {
    await page.locator(`.atlas-agent-card[data-agent="${agentId}"]`).click();
    await page.getByRole('textbox', { name: `Command ${agentName}` }).fill(objective);
    await page.getByRole('button', { name: 'Review mission' }).click();
    await page.getByRole('button', { name: /^Confirm mission/ }).click();
    await expect(page.getByRole('heading', { name: signalHeadline })).toBeVisible({
      timeout: 5_000,
    });
    await page.getByRole('button', { name: 'Close mission queue' }).click();
  };

  await dispatch(
    'mira',
    'Mira',
    'Check latest weather at Galehaven Weather Tower',
    'Crosswind advisory overlaps launch window',
  );
  await dispatch(
    'orin',
    'Orin',
    'Search historical delays in Archive Quarter',
    'Comparable windows often slipped under crosswind advisories',
  );
  await dispatch(
    'kestrel',
    'Kestrel',
    'Verify operations notice in Ledger Bay Newsroom',
    'Countdown operations remain scheduled',
  );

  const response = await page.request.get(snapshotUrl);
  const snapshot = (await response.json()) as {
    projection: {
      beliefUpdates: unknown[];
      knowledgeByKey: Record<string, unknown>;
      missionsById: Record<string, { status: string }>;
      signalsById: Record<string, unknown>;
    };
  };
  expect(Object.keys(snapshot.projection.signalsById)).toHaveLength(3);
  expect(snapshot.projection.beliefUpdates).toHaveLength(3);
  expect(snapshot.projection.knowledgeByKey).toMatchObject({
    'mira:signal:sig-crosswind': expect.anything(),
    'orin:signal:sig-base-rate': expect.anything(),
    'kestrel:signal:sig-operations': expect.anything(),
  });
  const missions = Object.values(snapshot.projection.missionsById);
  expect(missions).toHaveLength(3);
  expect(missions.every((mission) => mission.status === 'completed')).toBe(true);
});
