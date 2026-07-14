import { expect, test } from '@playwright/test';

test('@visual component foundation matches the cozy-intelligence direction', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/components');

  await expect(page.getByRole('heading', { name: 'Cozy intelligence primitives' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dispatch agent' })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(page.getByRole('tab')).toHaveCount(3);

  await expect(page).toHaveScreenshot('component-demo-1440x900.png', {
    animations: 'disabled',
    fullPage: true,
  });
});

test('component foundation supports keyboard tabs and dialog dismissal', async ({ page }) => {
  await page.goto('/components');

  const newTab = page.getByRole('tab', { name: 'New 3' });
  await newTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Pinned 2' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await page.getByRole('button', { name: 'Open evidence dialog' }).click();
  await expect(page.getByRole('dialog', { name: 'Inspect provenance' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Inspect provenance' })).toBeHidden();
});
