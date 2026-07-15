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
  await expect(dialog).toContainText('Deterministic authored-scenario mission driver.');
  const professorRuntime = dialog.getByRole('region', { name: /Professor · scripted-professor/ });
  await expect(professorRuntime).toContainText('Evidence-bound consultation agent');
  await expect(professorRuntime).toContainText('scripted');
  const workspacePersistence = dialog.getByRole('region', { name: 'Workspace persistence' });
  await expect(workspacePersistence).toContainText('Local authoritative history');
  await expect(workspacePersistence).toContainText('memory');
  await expect(workspacePersistence).toContainText('Events / latest');
  await expect(workspacePersistence).toContainText('2 / 2');
  await expect(workspacePersistence).toContainText('Replay base');
  await expect(workspacePersistence).toContainText('SEQ 0');
  await expect(workspacePersistence).toContainText('Checkpoint interval');
  await expect(workspacePersistence).toContainText('50 events');
  const prefConnection = dialog.getByRole('region', { name: 'Pref MCP connection' });
  await expect(prefConnection).toContainText('connected');
  await expect(prefConnection).toContainText('Deterministic recorded data');
  await expect(prefConnection).toContainText('Server-side mode lock');
  await expect(prefConnection).toContainText('SIGNAL_ATLAS_PREF_MODE=live');
  await expect(prefConnection).toContainText('fixture.local_conditions');
  await expect(prefConnection).toContainText('local_conditions');
  await prefConnection.getByRole('button', { name: 'Disconnect' }).click();
  await expect(prefConnection).toContainText('disconnected');
  await prefConnection.getByRole('button', { name: 'Test / reconnect' }).click();
  await expect(prefConnection).toContainText('connected');
  const scheduler = dialog.getByRole('region', { name: 'Agent and workspace scheduler' });
  await expect(scheduler).toContainText('Expedition slots2');
  await expect(scheduler).toContainText('Global slots2');
  await expect(scheduler).toContainText('Open worlds1');
  await expect(dialog).toContainText('No runtime turn has started');
  await dialog.getByRole('button', { name: 'Done' }).click();

  await page.getByLabel('Skip travel').check();
  await page.getByRole('button', { name: 'Simulation speed 1 times' }).click();
  await page.getByRole('button', { name: 'Simulation speed 2 times' }).click();
  await page
    .getByRole('textbox', { name: 'Command Mira' })
    .fill('Check latest weather at Galehaven Weather Tower');
  await page.getByRole('button', { name: 'Review mission' }).click();
  await page.getByRole('button', { name: /^Confirm mission/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Crosswind advisory overlaps launch window' }),
  ).toBeVisible({ timeout: 6_000 });
  await page.getByRole('button', { name: 'Close mission queue' }).click();

  await page.getByRole('button', { name: /Codex Runtime/ }).click();
  dialog = page.getByRole('dialog', { name: 'Codex Runtime Diagnostics' });
  const turns = dialog.getByRole('region', { name: 'Runtime turns' });
  await expect(dialog.getByRole('region', { name: 'fixture-scripted-codex' })).toContainText(
    'Driver runs',
  );
  await expect(turns).toContainText('1 complete');
  await expect(turns).toContainText('mira');
  await expect(turns).toContainText('mission-');
  await expect(turns).toContainText('completed');
  await expect(turns).toContainText('attempt 1');
  await expect(dialog).toContainText('No credential, prompt text, private reasoning');
});

test('a degraded persistence boundary remains visible and closes command controls', async ({
  page,
}) => {
  await page.route('**/api/runtime/diagnostics*', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        workspace: {
          state: 'degraded',
          issue: {
            code: 'workspace_persistence_failed',
            message: 'The injected local database is unavailable.',
          },
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto('/');

  const boundary = page.getByRole('alert').filter({ hasText: 'Workspace persistence paused' });
  await expect(boundary).toContainText('The injected local database is unavailable.');
  await expect(boundary).toContainText('The last durable world remains visible');
  await expect(page.getByRole('textbox', { name: 'Command Mira' })).toBeDisabled();
  await expect(page.locator('.atlas-command-status small')).toHaveText(
    'Workspace persistence paused; commands are closed.',
  );
});
