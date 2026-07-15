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
  const agentName = agentId === 'mira' ? 'Mira' : 'Orin';
  await page.locator(`.atlas-agent-card[data-agent="${agentId}"]`).click();
  await page.getByRole('textbox', { name: `Command ${agentName}` }).fill(objective);
  await page.getByRole('button', { name: /Dispatch/ }).click();
  await page.getByRole('button', { name: 'Confirm mission' }).click();
  await expect(page.getByRole('heading', { name: headline })).toBeVisible({ timeout: 6_000 });
  await page.getByRole('button', { name: 'Close mission queue' }).click();
}

async function reachProfessorJourney(page: Page) {
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
  await page.getByRole('button', { name: 'Convene at Lantern Square' }).click();
  const meeting = page.getByRole('main', { name: 'Lantern Square meeting' });
  await expect(meeting.getByRole('heading', { name: 'Exchange recorded' })).toBeVisible({
    timeout: 5_000,
  });
  await page.keyboard.press('Escape');
  await page.getByRole('main', { name: 'Interactive world stage' }).focus();
  await page.keyboard.press('p');
  await expect(page.getByRole('main', { name: "Professor Vale's Study" })).toBeVisible();
}

test('Professor Vale cites only selected evidence and states an insufficient selection', async ({
  page,
}) => {
  await reachProfessorJourney(page);
  const study = page.getByRole('main', { name: "Professor Vale's Study" });
  const tray = study.getByRole('region', { name: 'Evidence selection tray' });
  await expect(study.getByText('2 selected records')).toBeVisible();
  await expect(tray.getByLabel(weatherHeadline)).toBeChecked();
  await expect(tray.getByLabel(historicalHeadline)).toBeChecked();

  const correlationTab = study.getByRole('tab', { name: 'Correlation check' });
  await expect(correlationTab).toHaveAttribute('aria-selected', 'true');
  await correlationTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(study.getByRole('tab', { name: 'Forecast impact' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('ArrowLeft');
  await expect(correlationTab).toHaveAttribute('aria-selected', 'true');

  await study.getByRole('button', { name: 'Ask Professor' }).click();
  const response = study.getByRole('article', { name: 'Professor response' });
  await expect(response).toContainText('The signals are related but not duplicates');
  await expect(response).toContainText('Evidence used · 2');
  await expect(response).toContainText(weatherHeadline);
  await expect(response).toContainText(historicalHeadline);
  await expect(response).toContainText('Assumptions');
  await expect(response).toContainText('Limitations');
  await expect(response).toContainText('The archive sample is small');
  await expect(response).not.toContainText('Galehaven Crosswind Advisory');
  await expect(
    page.getByRole('complementary', { name: 'Signals' }).getByText('Correlated'),
  ).toHaveCount(2);

  await tray.getByLabel(historicalHeadline).uncheck();
  await study.getByRole('button', { name: 'Ask Professor' }).click();
  await expect(response).toContainText('Insufficient evidence');
  await expect(response).toContainText('Evidence used · 1');
  await expect(response).not.toContainText(historicalHeadline);

  await tray.getByLabel(historicalHeadline).check();
  await study.getByRole('button', { name: 'Ask Professor' }).click();
  await response.getByRole('button', { name: 'Prepare mission' }).click();
  await expect(page.getByRole('main', { name: 'Interactive world stage' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mission draft' })).toBeVisible();
  await expect(page.getByLabel('Mission objective')).toHaveValue(
    'Check the exact launch window and latest weather review.',
  );
  await expect(page.getByLabel('Mission agent')).toHaveValue('kestrel');
  await expect(page.getByLabel('Mission destination')).toHaveValue('newsroom');
});

test('@visual Professor study keeps the selected evidence and bounded answer readable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await reachProfessorJourney(page);
  const study = page.getByRole('main', { name: "Professor Vale's Study" });
  await study.getByRole('button', { name: 'Ask Professor' }).click();
  await expect(study.getByRole('article', { name: 'Professor response' })).toContainText(
    'related but not duplicates',
  );

  await expect(page).toHaveScreenshot('professor-study-1440x900.png', {
    fullPage: true,
    maxDiffPixels: 100,
  });
});
