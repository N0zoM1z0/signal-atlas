import { expect, test } from '@playwright/test';

const snapshotUrl = '/api/expeditions/exp-helios3-demo/snapshot';

test('mission drafts require confirmation and survive a browser refresh', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('main', { name: 'Interactive world stage' })).toBeVisible();

  // Interaction 1: the default explicit phrase is interpreted but cannot mutate the world.
  await page.getByRole('button', { name: /Dispatch/ }).click();
  await expect(page.getByRole('heading', { name: 'Mission draft' })).toBeVisible();
  await expect(page.getByLabel('Mission agent')).toHaveValue('mira');
  await expect(page.getByLabel('Mission destination')).toHaveValue('weather-tower');
  await expect(page.getByLabel('Mission type')).toHaveValue('observe_conditions');

  // Interaction 2: confirmation appends mission events and refreshes the projection.
  await page.getByRole('button', { name: 'Confirm mission' }).click();
  await expect(page.getByText('Mira → Galehaven Weather Tower · queued')).toBeVisible();
  await expect(page.locator('[data-agent="mira"] .atlas-agent-card__mission')).toContainText(
    '1 queued mission',
  );

  const acceptedSnapshot = await page.request.get(snapshotUrl);
  const acceptedPayload = (await acceptedSnapshot.json()) as {
    projection: { sequence: number; missionsById: Record<string, { status: string }> };
  };
  const acceptedSequence = acceptedPayload.projection.sequence;
  expect(Object.values(acceptedPayload.projection.missionsById)).toContainEqual(
    expect.objectContaining({ status: 'queued' }),
  );

  await page.reload();
  await page.getByRole('button', { name: /Mission queue/ }).click();
  await expect(page.getByText('Mira → Galehaven Weather Tower · queued')).toBeVisible();

  // A keyboard-only ambiguous phrase remains a local draft and does not advance sequence.
  await page.keyboard.press('Escape');
  await page.keyboard.press('/');
  const command = page.getByLabel('Command Mira');
  await command.fill('Look into the launch question');
  await command.press('Enter');
  await expect(page.getByRole('heading', { name: 'Mission draft' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm mission' })).toBeDisabled();
  await expect(page.getByText(/Confirmation is blocked/)).toBeVisible();

  const ambiguousSnapshot = await page.request.get(snapshotUrl);
  const ambiguousPayload = (await ambiguousSnapshot.json()) as { projection: { sequence: number } };
  expect(ambiguousPayload.projection.sequence).toBe(acceptedSequence);

  await page.getByRole('button', { name: 'Keep editing later' }).click();
  await page.getByRole('button', { name: /Cancel Check latest weather/ }).click();
  await expect(page.getByText('No queued missions. Your team is ready.')).toBeVisible();
});
