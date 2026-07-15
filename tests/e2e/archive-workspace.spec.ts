import { expect, test, type Page } from '@playwright/test';

const historicalHeadline = 'Comparable windows often slipped under crosswind advisories';

test.beforeEach(async ({ request }) => {
  await request.post('/api/testing/reset');
});

test.afterEach(async ({ request }) => {
  await request.post('/api/testing/reset');
});

async function discoverHistoricalEvidence(page: Page) {
  await page.goto('/');
  await page.getByLabel('Skip travel').check();
  await page.getByRole('button', { name: 'Simulation speed 1 times' }).click();
  await page.getByRole('button', { name: 'Simulation speed 2 times' }).click();
  await page.locator('.atlas-agent-card[data-agent="orin"]').click();
  await page
    .getByRole('textbox', { name: 'Command Orin' })
    .fill('Search historical delays in Archive Quarter');
  await page.getByRole('button', { name: 'Review mission' }).click();
  await page.getByRole('button', { name: /^Confirm mission/ }).click();
  await expect(page.getByRole('heading', { name: historicalHeadline })).toBeVisible({
    timeout: 5_000,
  });
  await page.getByRole('button', { name: 'Close mission queue' }).click();
}

test('Archive Quarter searches, compares, files, and replays discovered evidence', async ({
  page,
}) => {
  await discoverHistoricalEvidence(page);
  await page.getByRole('main', { name: 'Interactive world stage' }).focus();
  await page.keyboard.press('a');
  const archive = page.getByRole('main', { name: 'Archive Quarter' });
  await expect(archive).toBeVisible();

  const search = page.getByLabel('Search archive');
  await search.fill('eight twenty comparable');
  await page.getByLabel('From', { exact: true }).fill('2027-08-01');
  await page.getByLabel('To', { exact: true }).fill('2027-09-30');
  await page.getByLabel('Place', { exact: true }).selectOption('weather-tower');
  await page.getByLabel('Source class', { exact: true }).selectOption('archive');
  await page.getByLabel('Agent', { exact: true }).selectOption('orin');

  await expect(page.getByText('1 matching source record')).toBeVisible();
  await expect(page.getByRole('button', { name: /Case File: Twenty Comparable/ })).toBeVisible();
  const inspector = page.getByRole('complementary', { name: 'Selected archive record' });
  await expect(inspector).toContainText('Case File: Twenty Comparable Coastal Launch Windows');
  await expect(inspector).toContainText('eight of twenty comparable launch attempts');
  await expect(inspector).toContainText('Archive');

  await inspector.getByRole('button', { name: 'Add to case file' }).click();
  await expect(page.getByText('1 selected')).toBeVisible();
  await inspector.getByRole('button', { name: 'Compare record' }).click();

  const sourceTab = page.getByRole('tab', { name: 'Sources 1' });
  await sourceTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Signals 1' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText('1 matching signal record')).toBeVisible();
  await archive
    .locator('.atlas-archive-results')
    .getByRole('button', { name: new RegExp(historicalHeadline) })
    .click();
  await page.getByRole('button', { name: 'Compare record' }).click();

  const comparison = page.getByRole('region', { name: 'Side-by-side comparison' });
  await expect(comparison).toContainText('Side-by-side evidence');
  await expect(comparison).toContainText('Case File: Twenty Comparable Coastal Launch Windows');
  await expect(comparison).toContainText(historicalHeadline);
  await comparison.getByRole('button', { name: 'Clear comparison' }).click();

  await page.getByRole('button', { name: 'Replay to entry' }).click();
  const replay = page.getByRole('main', { name: 'Expedition replay case file' });
  await expect(replay).toBeVisible();
  await expect(replay.getByRole('region', { name: 'Selected world projection' })).toContainText(
    'Signal Created',
  );
  const replaySequence = await replay.getByRole('slider', { name: 'Replay sequence' }).inputValue();
  await expect(replay.getByRole('region', { name: 'Selected world projection' })).toContainText(
    `World at sequence ${replaySequence}`,
  );

  await page.keyboard.press('Escape');
  const world = page.getByRole('main', { name: 'Interactive world stage' });
  await expect(world).toBeVisible();
  await world.focus();
  await page.keyboard.press('a');
  await expect(page.getByText('1 selected')).toBeVisible();
});

test('@visual Archive Quarter keeps search, shelf, inspector, and case file legible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await discoverHistoricalEvidence(page);
  await page.getByRole('main', { name: 'Interactive world stage' }).focus();
  await page.keyboard.press('a');
  await expect(page.getByRole('main', { name: 'Archive Quarter' })).toBeVisible();
  await page.getByLabel('Search archive').fill('crosswind');

  await expect(page).toHaveScreenshot('archive-quarter-1440x900.png', {
    fullPage: true,
    maxDiffPixels: 100,
  });
});

test('Archive Quarter keeps results and record details reachable at 200 percent reflow', async ({
  page,
}) => {
  await discoverHistoricalEvidence(page);
  await page.setViewportSize({ width: 720, height: 450 });
  await page.getByRole('main', { name: 'Interactive world stage' }).focus();
  await page.keyboard.press('a');

  const archive = page.getByRole('main', { name: 'Archive Quarter' });
  await expect(archive.getByRole('region', { name: 'Archive results' })).toBeVisible();
  await expect(
    archive.getByRole('complementary', { name: 'Selected archive record' }),
  ).toContainText('Case File: Twenty Comparable Coastal Launch Windows');

  const dimensions = await archive.evaluate((element) => ({
    bodyHeight: element.querySelector('.atlas-archive-body')?.clientHeight ?? 0,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(dimensions.bodyHeight).toBeGreaterThan(0);
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);
  await archive.getByRole('button', { name: /Case File: Twenty Comparable/ }).focus();
  await expect(archive.getByRole('button', { name: /Case File: Twenty Comparable/ })).toBeFocused();
});
