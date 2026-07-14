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
  agentId: 'mira' | 'orin',
  objective: string,
  headline: string,
) {
  const agentName = agentId === 'mira' ? 'Mira' : 'Orin';
  await page.locator(`.atlas-agent-card[data-agent="${agentId}"]`).click();
  await page.getByRole('textbox', { name: `Command ${agentName}` }).fill(objective);
  await page.getByRole('button', { name: /Dispatch/ }).click();
  await page.getByRole('button', { name: 'Confirm mission' }).click();
  await expect(page.getByRole('heading', { name: headline })).toBeVisible({ timeout: 6_000 });
  await page.getByRole('button', { name: 'Close mission queue' }).click();
}

async function reachForecastDesk(page: Page) {
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
  await page.keyboard.press('c');
  await expect(page.getByRole('dialog', { name: 'Commit Forecast' })).toBeVisible();
}

async function fillRevision(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Commit Forecast' });
  await dialog.getByRole('spinbutton', { name: 'YES probability' }).fill('48');
  await expect(dialog.getByText('YES 48%', { exact: true })).toBeVisible();
  await expect(dialog.getByText('NO 52%', { exact: true })).toBeVisible();
  await dialog.getByRole('checkbox', { name: /Add a range/ }).check();
  await dialog.getByRole('spinbutton', { name: 'Lower bound' }).fill('44');
  await dialog.getByRole('spinbutton', { name: 'Upper bound' }).fill('52');
  await dialog
    .getByRole('textbox', { name: /Public note/ })
    .fill('Weather and the conditional base rate lower my launch estimate to 48%.');
  await dialog
    .getByRole('textbox', { name: /Private memo/ })
    .fill('Revisit after the final weather review.');
}

test('forecast commit validates probability, links evidence, and updates event history', async ({
  page,
}) => {
  await reachForecastDesk(page);
  const dialog = page.getByRole('dialog', { name: 'Commit Forecast' });

  const comparison = dialog.getByRole('region', { name: 'Forecast comparison' });
  await expect(comparison).toContainText('Public market61%');
  await expect(comparison).toContainText('Team forecast55%');
  await expect(comparison).toContainText('Prior player—');
  await expect(dialog.getByText('2 selected')).toBeVisible();
  await expect(dialog.getByText(weatherHeadline, { exact: true })).toBeVisible();
  await expect(dialog.getByText(historicalHeadline, { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Buy|Sell|Bet/i })).toHaveCount(0);

  await fillRevision(page);
  const commit = dialog.getByRole('button', { name: 'Commit Forecast · 48%' });
  await expect(commit).toBeEnabled();
  await commit.click();

  await expect(dialog.getByRole('status')).toContainText('Revision committed at 48%');
  await expect(comparison).toContainText('Prior player48%');
  const history = dialog.getByRole('region', { name: 'Forecast path' });
  await expect(history).toContainText('2 commits');
  await expect(history).toContainText('48% YES');
  await expect(history).toContainText('−7 points');
  await expect(history).toContainText(
    'Weather and the conditional base rate lower my launch estimate to 48%.',
  );
  await expect(history).toContainText(weatherHeadline);
  await expect(history).toContainText(historicalHeadline);
  await history.getByText('Private memo', { exact: true }).click();
  await expect(history).toContainText('Revisit after the final weather review.');

  const snapshotResponse = await page.request.get('/api/expeditions/exp-helios3-demo/snapshot');
  const snapshot = (await snapshotResponse.json()) as {
    projection: {
      forecasts: Array<{
        commitId?: string;
        previousProbabilities: Record<string, number>;
        newProbabilities: Record<string, number>;
        uncertainty?: Record<string, { low: number; high: number }>;
        evidenceSignalIds: string[];
        publicNote?: string;
        privateMemo?: string;
      }>;
    };
  };
  const recorded = snapshot.projection.forecasts.at(-1);
  expect(recorded).toMatchObject({
    commitId: expect.stringMatching(/^forecast-/),
    previousProbabilities: { yes: 0.55, no: 0.45 },
    newProbabilities: { yes: 0.48, no: 0.52 },
    uncertainty: {
      yes: { low: 0.44, high: 0.52 },
      no: { low: 0.48, high: 0.56 },
    },
    evidenceSignalIds: ['sig-crosswind', 'sig-base-rate'],
    publicNote: 'Weather and the conditional base rate lower my launch estimate to 48%.',
    privateMemo: 'Revisit after the final weather review.',
  });
  expect(
    Object.values(recorded?.newProbabilities ?? {}).reduce((total, value) => total + value, 0),
  ).toBe(1);
});

test('@visual Forecast desk keeps probability, evidence, rationale, and history legible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await reachForecastDesk(page);
  await fillRevision(page);
  const dialog = page.getByRole('dialog', { name: 'Commit Forecast' });
  await dialog.getByRole('button', { name: 'Commit Forecast · 48%' }).click();
  await expect(dialog.getByRole('status')).toContainText('Revision committed at 48%');

  await expect(page).toHaveScreenshot('forecast-commit-1440x900.png', {
    fullPage: true,
    maxDiffPixels: 100,
  });
});
