import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.post('/api/testing/reset');
});

test.afterEach(async ({ request }) => {
  await request.post('/api/testing/reset');
});

async function recordEventStreamStates(page: Page): Promise<void> {
  await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('.signal-atlas-shell');
    if (!shell) throw new Error('Signal Atlas shell is unavailable.');
    const states = [shell.dataset['eventStreamState'] ?? 'missing'];
    new MutationObserver(() => {
      states.push(shell.dataset['eventStreamState'] ?? 'missing');
    }).observe(shell, { attributeFilter: ['data-event-stream-state'] });
    (
      window as typeof window & { __signalAtlasEventStreamStates?: string[] }
    ).__signalAtlasEventStreamStates = states;
  });
}

async function recordedStates(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      (window as typeof window & { __signalAtlasEventStreamStates?: string[] })
        .__signalAtlasEventStreamStates ?? [],
  );
}

test('a temporary outage reconnects from the last accepted sequence without corrupting state', async ({
  page,
}) => {
  await page.goto('/');
  const shell = page.locator('.signal-atlas-shell');
  await expect(shell).toHaveAttribute('data-event-stream-state', 'live');
  const initialSequence = Number(await shell.getAttribute('data-event-stream-sequence'));
  await recordEventStreamStates(page);

  const outage = await page.request.post('/api/testing/disconnect-streams');
  expect(outage.ok()).toBe(true);
  expect((await outage.json()) as unknown).toMatchObject({
    disconnected: 1,
    sequence: initialSequence,
  });
  await expect.poll(async () => (await recordedStates(page)).includes('reconnecting')).toBe(true);
  await expect(shell).toHaveAttribute('data-event-stream-state', 'live');
  await expect(shell).toHaveAttribute('data-event-stream-sequence', String(initialSequence));

  await page.getByRole('button', { name: 'Pause simulation' }).click();
  await expect(page.getByRole('button', { name: 'Resume simulation' })).toBeVisible();
  await expect
    .poll(async () => Number(await shell.getAttribute('data-event-stream-sequence')))
    .toBeGreaterThan(initialSequence);
});

test('an invalid envelope is rejected visibly and recovery preserves the validated cursor', async ({
  page,
}) => {
  await page.goto('/');
  const shell = page.locator('.signal-atlas-shell');
  await expect(shell).toHaveAttribute('data-event-stream-state', 'live');
  const initialSequence = Number(await shell.getAttribute('data-event-stream-sequence'));
  const teamProbability = page.locator('.atlas-probability__value--team strong');
  const initialTeamProbability = await teamProbability.innerText();
  await recordEventStreamStates(page);

  const injection = await page.request.post('/api/testing/emit-invalid-stream-envelope');
  expect(injection.ok()).toBe(true);
  expect((await injection.json()) as unknown).toMatchObject({ sent: 1 });

  const alert = page.getByRole('alert').filter({ hasText: 'Event stream boundary' });
  await expect(alert).toContainText('Event stream schema validation failed.');
  await expect(alert).toContainText(
    `Last valid sequence ${initialSequence} remains authoritative.`,
  );
  await expect.poll(async () => (await recordedStates(page)).includes('schema_error')).toBe(true);
  await expect(shell).toHaveAttribute('data-event-stream-state', 'live');
  await expect(shell).toHaveAttribute('data-event-stream-sequence', String(initialSequence));
  await expect(teamProbability).toHaveText(initialTeamProbability);

  await page.getByRole('button', { name: 'Dismiss event stream error' }).click();
  await expect(alert).toBeHidden();
});
