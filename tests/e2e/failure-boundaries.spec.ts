import { expect, test } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.post('/api/testing/reset');
  await request.post('/api/runtime/pref/test', { data: {} });
});

test.afterEach(async ({ request }) => {
  await request.post('/api/testing/reset');
});

test('local Codex unavailability names the fallback boundary without changing the world', async ({
  page,
}) => {
  await page.route('**/api/runtime/diagnostics*', async (route) => {
    const response = await route.fetch();
    const payload = (await response.json()) as { driver: Record<string, unknown> };
    payload.driver = {
      ...payload.driver,
      activeMode: 'scripted_fallback',
      description: 'Local Codex execution boundary with a deterministic fixture fallback.',
      fallback: {
        driverId: 'fixture-scripted-codex',
        reason: 'The configured local Codex executable is unavailable.',
        used: false,
      },
      id: 'local-codex-exec',
      kind: 'local_exec',
    };
    await route.fulfill({ json: payload, response });
  });

  await page.goto('/');
  const shell = page.locator('.signal-atlas-shell');
  await expect(shell).toHaveAttribute('data-event-stream-state', 'live');
  const sequence = await shell.getAttribute('data-event-stream-sequence');
  await page.getByRole('button', { name: /Codex Runtime/ }).click();

  const dialog = page.getByRole('dialog', { name: 'Codex Runtime Diagnostics' });
  await expect(dialog).toContainText('local-codex-exec');
  await expect(dialog).toContainText('Fallback available');
  await expect(dialog).toContainText('Local Codex unavailable · scripted fixture fallback active.');
  await expect(dialog).toContainText('The configured local Codex executable is unavailable.');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(shell).toHaveAttribute('data-event-stream-sequence', sequence ?? '2');
  await expect(page.getByText('● Offline sources ready')).toBeVisible();
});

test('Pref unavailability is distinct, reversible, and preserves the projection', async ({
  page,
}) => {
  await page.goto('/');
  const shell = page.locator('.signal-atlas-shell');
  await expect(shell).toHaveAttribute('data-event-stream-state', 'live');
  const sequence = await shell.getAttribute('data-event-stream-sequence');

  await page.getByRole('button', { name: /Codex Runtime/ }).click();
  let dialog = page.getByRole('dialog', { name: 'Codex Runtime Diagnostics' });
  const pref = dialog.getByRole('region', { name: 'Pref MCP connection' });
  await pref.getByRole('button', { name: 'Disconnect' }).click();
  await expect(pref).toContainText('disconnected');
  await dialog.getByRole('button', { name: 'Done' }).click();

  await expect(page.getByText('△ Fixture Pref disconnected')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Runtime connections' })).toContainText(
    'Unavailable',
  );
  await expect(shell).toHaveAttribute('data-event-stream-sequence', sequence ?? '2');

  await page.getByRole('button', { name: /Codex Runtime/ }).click();
  dialog = page.getByRole('dialog', { name: 'Codex Runtime Diagnostics' });
  await dialog
    .getByRole('region', { name: 'Pref MCP connection' })
    .getByRole('button', { name: 'Test / reconnect' })
    .click();
  await expect(dialog.getByRole('region', { name: 'Pref MCP connection' })).toContainText(
    'connected',
  );
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('● Offline sources ready')).toBeVisible();
});

test('an invalid agent output records a sanitized schema failure and applies no evidence', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Mission queue/ }).click();
  await page.getByLabel('Offline mission result').selectOption('invalid_result');
  await page.getByRole('button', { name: 'Close mission queue' }).click();

  await page.getByRole('button', { name: /Dispatch/ }).click();
  await page.getByRole('button', { name: 'Confirm mission' }).click();
  await page.getByRole('button', { name: 'Skip travel' }).click();
  await expect(page.getByText('Mira → Galehaven Weather Tower · failed')).toBeVisible({
    timeout: 6_000,
  });
  await expect(
    page.getByText(
      'The agent output schema boundary rejected the injected result; no evidence or world action was applied.',
    ),
  ).toBeVisible();

  const snapshotResponse = await page.request.get('/api/expeditions/exp-helios3-demo/snapshot');
  const snapshot = (await snapshotResponse.json()) as {
    projection: {
      claimsById: Record<string, unknown>;
      signalsById: Record<string, unknown>;
      sourcesById: Record<string, unknown>;
    };
  };
  expect(snapshot.projection.sourcesById).toEqual({});
  expect(snapshot.projection.claimsById).toEqual({});
  expect(snapshot.projection.signalsById).toEqual({});

  const eventsResponse = await page.request.get('/api/expeditions/exp-helios3-demo/events?after=2');
  const eventLog = (await eventsResponse.json()) as {
    events: Array<{ payload: Record<string, unknown>; type: string }>;
  };
  expect(eventLog.events).toContainEqual(
    expect.objectContaining({
      payload: expect.objectContaining({ code: 'fixture_invalid_result' }),
      type: 'pref.call.failed',
    }),
  );
  expect(
    eventLog.events.some((event) =>
      ['source.recorded', 'claim.created', 'signal.created'].includes(event.type),
    ),
  ).toBe(false);
});
