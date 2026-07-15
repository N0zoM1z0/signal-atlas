import { expect, test, type Page } from '@playwright/test';

const headline = 'Crosswind advisory overlaps launch window';

test.beforeEach(async ({ request }) => {
  await request.post('/api/testing/reset');
});

test.afterEach(async ({ request }) => {
  await request.post('/api/testing/reset');
});

async function discoverWeatherSignal(page: Page) {
  await page.goto('/');
  await page.getByLabel('Skip travel').check();
  await page.getByRole('button', { name: 'Simulation speed 1 times' }).click();
  await page.getByRole('button', { name: 'Simulation speed 2 times' }).click();
  await page.getByRole('button', { name: /Dispatch/ }).click();
  await page.getByRole('button', { name: 'Confirm mission' }).click();
  await page.getByRole('button', { name: 'Close mission queue' }).click();
  const card = page.locator('.atlas-signal-card').filter({ hasText: headline });
  await expect(card).toBeVisible({ timeout: 5_000 });
  return card;
}

test('a discovered signal exposes source provenance and durable case-file actions', async ({
  page,
}) => {
  const card = await discoverWeatherSignal(page);

  await expect(card).toContainText('↘ NO support');
  await expect(card).toContainText('Fresh');
  await expect(card).toContainText('1 · Official Primary');
  await expect(card).toContainText('Medium · −9 to −4 pp');
  await expect(card).toContainText('Verified Primary');
  await expect(card.getByLabel('Known by')).toContainText('Mira');

  // One interaction from the signal card reaches the complete source layer.
  await card.getByRole('button', { name: `Inspect sources for ${headline}` }).click();
  const inspector = page.getByRole('dialog', { name: headline });
  await expect(inspector).toBeVisible();
  await expect(inspector).toContainText(
    "Crosswinds are forecast to exceed the mission's preferred threshold",
  );
  await expect(inspector).toContainText('Galehaven Crosswind Advisory 18:10Z');
  await expect(inspector).toContainText('Galehaven Weather Service');
  await expect(inspector).toContainText('Retrieved');
  await expect(inspector).toContainText('pref-fixture');
  await expect(inspector).toContainText('fixture.weather.advisory');
  await expect(inspector).toContainText('call-src-weather-bulletin-1');
  await expect(inspector).toContainText('Source record');
  await expect(inspector).toContainText('src-weather-bulletin-1');
  await expect(inspector).toContainText('No earlier version');
  await expect(inspector).toContainText('weather · crosswind · launch-window');
  await expect(inspector).toContainText('fixture://helios3/src-weather-bulletin-1');
  await expect(inspector.getByLabel('Agents who know this signal')).toContainText('Mira');
  await expect(inspector).toContainText('Independence has not been established');

  await inspector.getByRole('button', { name: 'Pin to case file' }).click();
  await inspector.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('tab', { name: 'Pinned 1' }).click();
  await expect(page.locator('.atlas-signal-card').filter({ hasText: headline })).toBeVisible();

  await page.getByRole('button', { name: `Inspect sources for ${headline}` }).click();
  await page.getByRole('button', { name: 'Archive signal' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('tab', { name: 'All 1' }).click();
  await expect(page.locator('.atlas-signal-card').filter({ hasText: headline })).toContainText(
    'Archived',
  );

  await page.getByRole('button', { name: `Inspect sources for ${headline}` }).click();
  await page.getByRole('button', { name: 'Restore to New' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'New 1' }).click();
  await expect(page.locator('.atlas-signal-card').filter({ hasText: headline })).toBeVisible();

  await page.reload();
  await page.getByRole('tab', { name: 'Pinned 1' }).click();
  await expect(page.locator('.atlas-signal-card').filter({ hasText: headline })).toBeVisible();
});

test('@visual source inspector keeps evidence and provenance readable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const card = await discoverWeatherSignal(page);
  await card.getByRole('button', { name: `Inspect sources for ${headline}` }).click();
  await expect(page.getByRole('dialog', { name: headline })).toBeVisible();

  await expect(page).toHaveScreenshot('signal-source-inspector-1440x900.png', {
    fullPage: true,
    maxDiffPixels: 100,
  });
});
