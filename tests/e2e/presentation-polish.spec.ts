import { expect, test } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.post('/api/testing/reset');
  await request.post('/api/runtime/pref/test', { data: {} });
});

test.afterEach(async ({ request }) => {
  await request.post('/api/testing/reset');
});

test('truthful startup, onboarding, and synthesized sound controls remain explicit', async ({
  page,
}) => {
  let releaseSnapshot!: () => void;
  const snapshotBarrier = new Promise<void>((resolve) => {
    releaseSnapshot = resolve;
  });
  await page.route('**/api/expeditions/*/snapshot', async (route) => {
    await snapshotBarrier;
    await route.continue();
  });
  const navigation = page.goto('/');

  await expect(page.getByRole('status')).toContainText('Opening Signal Atlas…');
  await expect(page.getByRole('status')).toContainText(
    'Loading the local expedition catalog and authoritative snapshot.',
  );
  releaseSnapshot();
  await navigation;
  await expect(page.getByText('● Offline sources ready')).toBeVisible();
  const guide = page.getByRole('complementary', { name: 'First expedition guide' });
  await expect(guide).toBeVisible();
  await expect(guide).toContainText('Follow evidence to a forecast');
  await page.getByLabel('Skip travel').check();
  await expect(page.getByLabel('Skip travel')).toBeChecked();
  await guide.getByRole('button', { name: 'Skip first expedition guide' }).click();
  await expect(guide).toBeHidden();
  await page.getByRole('button', { name: /Guide ·/ }).click();
  await expect(guide).toBeVisible();

  const sound = page.getByRole('button', { name: 'Enable presentation sound' });
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
  await sound.click();
  await expect(page.getByRole('button', { name: 'Mute presentation sound' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('capture mode removes healthy test chrome but preserves authoritative status', async ({
  page,
}) => {
  await page.goto('/?capture=1');
  await expect(page.getByText('● Offline sources ready')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'First expedition guide' })).toHaveCount(0);
  await expect(page.locator('.atlas-scene-diagnostic')).toHaveCount(0);

  await page.getByRole('button', { name: /Mission queue/ }).click();
  await expect(page.getByLabel('Offline mission result')).toBeHidden();
});

test('committed mission events drive the ticker and canvas cue', async ({ page }) => {
  await page.goto('/?capture=1');
  await page.getByRole('button', { name: 'Review mission' }).click();
  await page.getByRole('button', { name: /^Confirm mission/ }).click();
  await page.getByRole('button', { name: 'Skip travel' }).click();

  const scene = page.locator('.atlas-world-canvas');
  await expect
    .poll(async () => (await scene.getAttribute('data-rendered-cue')) ?? '', { timeout: 6_000 })
    .not.toBe('');
  await expect(page.locator('.atlas-event-ticker')).not.toContainText('Ready');
});

test('responsive drawers enter and restore focus without leaking shortcuts through dialogs', async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 450 });
  await page.goto('/?capture=1');

  const agentsTrigger = page.getByRole('button', { name: 'Open agents drawer' });
  await agentsTrigger.click();
  await expect(page.locator('.atlas-agent-card[data-agent="mira"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(agentsTrigger).toBeFocused();

  await page.getByRole('button', { name: 'Commit Forecast' }).click();
  const forecast = page.getByRole('dialog', { name: 'Commit Forecast' });
  await forecast.focus();
  await page.keyboard.press('Space');
  await expect(forecast).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause simulation' })).toBeVisible();
});
