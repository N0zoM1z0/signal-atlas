import { expect, test } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.post('/api/testing/reset');
});

test.afterEach(async ({ request }) => {
  await request.post('/api/testing/reset');
});

test('runtime diagnostics expose the scripted driver, scheduler, and persisted turn outcome', async ({
  page,
}) => {
  await page.goto('/');

  await page.getByRole('button', { name: /Codex Runtime/ }).click();
  let dialog = page.getByRole('dialog', { name: 'Codex Runtime Diagnostics' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('fixture-scripted-codex');
  await expect(dialog).toContainText('Deterministic Helios-3 scripted mission driver.');
  await expect(dialog.getByRole('region', { name: 'Agent scheduler' })).toContainText(
    'Concurrency2',
  );
  await expect(dialog).toContainText('No runtime turn has started');
  await dialog.getByRole('button', { name: 'Done' }).click();

  await page.getByLabel('Skip travel').check();
  await page.getByRole('button', { name: 'Simulation speed 1 times' }).click();
  await page.getByRole('button', { name: 'Simulation speed 2 times' }).click();
  await page
    .getByRole('textbox', { name: 'Command Mira' })
    .fill('Check latest weather at Galehaven Weather Tower');
  await page.getByRole('button', { name: /Dispatch/ }).click();
  await page.getByRole('button', { name: 'Confirm mission' }).click();
  await expect(
    page.getByRole('heading', { name: 'Crosswind advisory overlaps launch window' }),
  ).toBeVisible({ timeout: 6_000 });
  await page.getByRole('button', { name: 'Close mission queue' }).click();

  await page.getByRole('button', { name: /Codex Runtime/ }).click();
  dialog = page.getByRole('dialog', { name: 'Codex Runtime Diagnostics' });
  const turns = dialog.getByRole('region', { name: 'Runtime turns' });
  await expect(dialog).toContainText('Driver runs1');
  await expect(turns).toContainText('1 complete');
  await expect(turns).toContainText('mira');
  await expect(turns).toContainText('mission-');
  await expect(turns).toContainText('completed');
  await expect(turns).toContainText('attempt 1');
  await expect(dialog).toContainText(
    'No prompt text, private reasoning, source content, or secrets',
  );
});
