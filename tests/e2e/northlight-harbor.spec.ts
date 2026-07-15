import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.post('/api/testing/reset');
});

test.afterEach(async ({ request }) => {
  await request.post('/api/testing/reset');
});

test('@visual Northlight Harbor is a complete coastal research world at 1440 × 900', async ({
  page,
  request,
}) => {
  const created = await request.post('/api/expeditions', {
    data: {
      idempotencyKey: 'create:northlight:visual:1',
      scenarioId: 'northlight-harbor-watch',
      scenarioVersion: 1,
    },
  });
  expect(created.status()).toBe(201);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?expedition=exp-northlight-harbor-demo&capture=1');

  await expect(
    page.getByRole('heading', {
      name: 'Will Northlight Harbor suspend outbound traffic before 18:00 UTC on November 12?',
    }),
  ).toBeVisible();
  await expect(page.getByTitle('Tern, Field scout')).toBeVisible();
  await expect(page.getByTitle('Cora, Archivist')).toBeVisible();
  await expect(page.getByTitle('Brin, Skeptical analyst')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Gullwing Signal Station\./u })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Outer Breakwater Control\./u })).toBeVisible();
  await expect(page.locator('.atlas-world-canvas')).toHaveAttribute('data-scene-ready', 'true');
  await expect(page.locator('.atlas-world-canvas')).toHaveAttribute('data-reduced-motion', 'true');
  await expect(page.locator('.atlas-world-canvas canvas')).toHaveCount(1);

  const dimensions = await page.evaluate(() => ({
    bodyHeight: document.body.scrollHeight,
    bodyWidth: document.body.scrollWidth,
    viewportHeight: document.documentElement.clientHeight,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.bodyHeight).toBeLessThanOrEqual(dimensions.viewportHeight);
  expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.viewportWidth);

  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(
    accessibility.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    ),
  ).toEqual([]);

  await expect(page).toHaveScreenshot('northlight-harbor-world-1440x900.png', {
    fullPage: true,
    maxDiffPixels: 100,
  });
});
