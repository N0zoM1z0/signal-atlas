import { expect, test, type Page } from '@playwright/test';

const weatherHeadline = 'Crosswind advisory overlaps launch window';
const historicalHeadline = 'Comparable windows often slipped under crosswind advisories';

test.beforeEach(async ({ request }) => {
  await request.post('/api/testing/reset');
});

test.afterEach(async ({ request }) => {
  await request.post('/api/testing/reset');
});

async function completeEvidenceMission(
  page: Page,
  agentId: string,
  objective: string,
  headline: string,
) {
  await page.locator(`.atlas-agent-card[data-agent="${agentId}"]`).click();
  const agentName = agentId === 'mira' ? 'Mira' : 'Orin';
  await page.getByRole('textbox', { name: `Command ${agentName}` }).fill(objective);
  await page.getByRole('button', { name: 'Review mission' }).click();
  await page.getByRole('button', { name: /^Confirm mission/ }).click();
  await expect(page.getByRole('heading', { name: headline })).toBeVisible({ timeout: 6_000 });
  await page.getByRole('button', { name: 'Close mission queue' }).click();
}

async function discoverRequiredEvidence(page: Page) {
  await page.goto('/');
  await page.getByLabel('Skip travel').check();
  await page.getByRole('button', { name: 'Simulation speed 1 times' }).click();
  await page.getByRole('button', { name: 'Simulation speed 2 times' }).click();
  await completeEvidenceMission(
    page,
    'mira',
    'Check latest weather at Galehaven Weather Tower',
    weatherHeadline,
  );
  await completeEvidenceMission(
    page,
    'orin',
    'Search historical delays in Archive Quarter',
    historicalHeadline,
  );
}

test('Lantern Square preserves asymmetry, shares signals, and files a skippable memo', async ({
  page,
}) => {
  await discoverRequiredEvidence(page);
  await page.getByLabel('Skip travel').uncheck();
  await page.getByRole('button', { name: 'Convene at Lantern Square' }).click();

  const meeting = page.getByRole('main', { name: 'Lantern Square meeting' });
  await expect(meeting).toBeVisible();
  await expect(meeting.getByRole('heading', { name: /of 3 arrived/ })).toBeVisible();

  const mira = meeting.locator('.atlas-meeting-participants > li[data-agent="mira"]');
  const orin = meeting.locator('.atlas-meeting-participants > li[data-agent="orin"]');
  const kestrel = meeting.locator('.atlas-meeting-participants > li[data-agent="kestrel"]');
  await expect(mira.getByRole('heading', { name: 'Before meeting' })).toBeVisible();
  await expect(mira).toContainText(weatherHeadline);
  await expect(orin).toContainText(historicalHeadline);
  await expect(kestrel).toContainText('No mission signals');
  const shared = meeting.getByRole('region', { name: 'Shared signals' });
  await expect(shared).toContainText('2 signals queued to share');
  await expect(shared).toContainText('Held before meeting by Mira');
  await expect(shared).toContainText('Held before meeting by Orin');

  await meeting.getByRole('button', { name: 'Skip arrivals' }).click();
  await expect(meeting.getByRole('heading', { name: 'Exchange recorded' })).toBeVisible();
  await expect(meeting.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3');
  await expect(mira).toContainText(historicalHeadline);
  await expect(orin).toContainText(weatherHeadline);
  await expect(kestrel).toContainText(weatherHeadline);
  await expect(kestrel).toContainText(historicalHeadline);

  await expect(shared).toContainText('2 signals now shared');
  await expect(shared).toContainText('Mira shared to Orin, Kestrel');
  await expect(shared).toContainText('Orin shared to Mira, Kestrel');

  const disagreements = meeting.getByRole('complementary', { name: 'Disagreement analysis' });
  await expect(disagreements).toContainText('Evidence disagreement');
  await expect(disagreements).toContainText('Model disagreement');
  await expect(disagreements).toContainText('Prior disagreement');
  await disagreements.getByRole('button', { name: 'Skip discussion' }).click();

  const memo = meeting.getByRole('region', { name: 'Meeting memo' });
  await expect(memo).toContainText('Concise meeting memo');
  await expect(memo).toContainText('independence is not yet established');
  await expect(memo).toContainText(
    'Ask the Professor whether the shared evidence signals are independent.',
  );
  await expect(memo).toContainText(/SEQ \d+/);

  await page.keyboard.press('Escape');
  const world = page.getByRole('main', { name: 'Interactive world stage' });
  await expect(world).toBeVisible();
  await world.focus();
  await page.keyboard.press('a');
  await page.getByRole('tab', { name: 'Memos 1' }).click();
  await expect(page.getByText('1 matching memo record')).toBeVisible();
  await expect(page.getByRole('button', { name: /Meeting memo ·/ })).toBeVisible();
});

test('@visual Lantern Square keeps knowledge, shared signals, and disagreement labels legible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await discoverRequiredEvidence(page);
  await page.getByRole('button', { name: 'Convene at Lantern Square' }).click();
  const meeting = page.getByRole('main', { name: 'Lantern Square meeting' });
  await expect(meeting.getByRole('heading', { name: 'Exchange recorded' })).toBeVisible({
    timeout: 5_000,
  });

  await expect(page).toHaveScreenshot('lantern-square-meeting-1440x900.png', {
    fullPage: true,
    maxDiffPixels: 100,
  });
});
