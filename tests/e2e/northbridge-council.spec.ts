import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.post('/api/testing/reset');
});

test.afterEach(async ({ request }) => {
  await request.post('/api/testing/reset');
});

test('@visual Northbridge is a complete civic policy world at 1440 × 900', async ({
  page,
  request,
}) => {
  const created = await request.post('/api/expeditions', {
    data: {
      idempotencyKey: 'create:northbridge:visual:1',
      scenarioId: 'northbridge-monetary-council',
      scenarioVersion: 1,
    },
  });
  expect(created.status()).toBe(201);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?expedition=exp-northbridge-council-demo&capture=1');

  await expect(
    page.getByRole('heading', {
      name: 'Will the Northbridge Monetary Council cut its policy rate at the June 18 meeting?',
    }),
  ).toBeVisible();
  await expect(page.getByTitle('Lumen, Analyst')).toBeVisible();
  await expect(page.getByTitle('Mara, Archivist')).toBeVisible();
  await expect(page.getByTitle('Sable, Skeptical analyst')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^Northbridge Statistics Office\./u }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^Forward Ledger Exchange\./u })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Northbridge Council Hall\./u })).toBeVisible();
  await expect(page.locator('.atlas-world-canvas')).toHaveAttribute('data-scene-ready', 'true');
  await expect(page.locator('.atlas-world-canvas')).toHaveAttribute('data-reduced-motion', 'true');
  const canvas = page.locator('.atlas-world-canvas canvas');
  await expect(canvas).toHaveCount(1);
  await expect
    .poll(() =>
      canvas.evaluate((element) => {
        const context = element.getContext('2d');
        if (!context) return 0;
        const pixels = context.getImageData(0, 0, element.width, element.height).data;
        const colors = new Set<string>();
        for (let offset = 0; offset < pixels.length; offset += 4 * 113) {
          colors.add(`${pixels[offset]}:${pixels[offset + 1]}:${pixels[offset + 2]}`);
        }
        return colors.size;
      }),
    )
    .toBeGreaterThanOrEqual(8);
  await expect
    .poll(() =>
      canvas.evaluate((element) => {
        const context = element.getContext('2d');
        if (!context) return 0;
        const pixels = context.getImageData(0, 0, element.width, element.height).data;
        let nonBlack = 0;
        let samples = 0;
        for (let offset = 0; offset < pixels.length; offset += 4 * 113) {
          if ((pixels[offset] ?? 0) + (pixels[offset + 1] ?? 0) + (pixels[offset + 2] ?? 0) > 25) {
            nonBlack += 1;
          }
          samples += 1;
        }
        return nonBlack / samples;
      }),
    )
    .toBeGreaterThan(0.8);

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

  await expect(page).toHaveScreenshot('northbridge-council-world-1440x900.png', {
    fullPage: true,
    maxDiffPixels: 100,
  });
});
