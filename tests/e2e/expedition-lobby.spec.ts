import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.post('/api/testing/reset');
});

test.afterEach(async ({ request }) => {
  await request.post('/api/testing/reset');
});

test('the lobby opens, tears down, and deep-links one complete world at a time', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/lobby');

  await expect(page.getByRole('heading', { name: 'Signal Atlas Expeditions' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Helios-3 Launch Window' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Northlight Harbor Watch' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create Northlight Harbor Watch' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Northbridge Monetary Council' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Create Northbridge Monetary Council' }),
  ).toBeVisible();
  await expect(page.getByText('Sequence 2')).toBeVisible();
  const enterWorld = page.getByRole('button', { name: 'Enter Helios-3 Launch Window' });
  await enterWorld.focus();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\?expedition=exp-helios3-demo$/u);
  await expect(page.locator('.signal-atlas-shell')).toHaveAttribute(
    'data-event-stream-state',
    'live',
  );
  await expect(page.locator('.atlas-world-canvas canvas')).toHaveCount(1);

  await page.getByRole('button', { name: 'Open Expedition Lobby' }).click();
  await expect(page).toHaveURL(/\/lobby$/u);
  await expect(page.locator('.signal-atlas-shell')).toHaveCount(0);
  await expect(page.locator('.atlas-world-canvas canvas')).toHaveCount(0);

  await page.goBack();
  await expect(page.locator('.signal-atlas-shell')).toBeVisible();
  await expect(page.locator('.atlas-world-canvas canvas')).toHaveCount(1);
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Signal Atlas Expeditions' })).toBeVisible();
});

test('@visual expedition lobby presents the local world shelf at 1440 × 900', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/lobby');

  await expect(page.getByRole('heading', { name: 'Available expeditions' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Meridian Coast world preview' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Northlight Coast world preview' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Northbridge District world preview' })).toBeVisible();
  const horizontalOverflow = await page.evaluate(
    () => document.body.scrollWidth > document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBe(false);

  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(
    accessibility.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    ),
  ).toEqual([]);

  await expect(page).toHaveScreenshot('expedition-lobby-1440x900.png', {
    fullPage: true,
    maxDiffPixels: 100,
  });
});
