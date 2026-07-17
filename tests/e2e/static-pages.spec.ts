import { expect, test, type Download, type Page } from '@playwright/test';

const weatherHeadline = 'Crosswind advisory overlaps launch window';
const historicalHeadline = 'Comparable windows often slipped under crosswind advisories';

function enforceStaticNetworkBoundary(page: Page): string[] {
  const violations: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    if (
      url.origin !== 'http://127.0.0.1:4174' ||
      url.pathname.startsWith('/api/') ||
      request.resourceType() === 'websocket'
    ) {
      violations.push(`${request.method()} ${request.resourceType()} ${request.url()}`);
    }
  });
  page.on('websocket', (socket) => violations.push(`WEBSOCKET ${socket.url()}`));
  return violations;
}

async function readDownload(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Expected a readable static case-file download.');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function startHelios(page: Page) {
  await page.goto('./?view=lobby');
  await page.getByRole('button', { name: 'Start Helios-3 Launch Window' }).click();
  await expect(page.getByRole('main', { name: 'Interactive world stage' })).toBeVisible();
  await expect(page.getByRole('banner', { name: 'Market overview' })).toContainText(
    'Static authored runtime',
  );
}

async function completeEvidenceMission(
  page: Page,
  agentId: 'mira' | 'orin',
  objective: string,
  headline: string,
) {
  const agentName = agentId === 'mira' ? 'Mira' : 'Orin';
  await page.locator(`.atlas-agent-card[data-agent="${agentId}"]`).click();
  await page.getByRole('textbox', { name: `Command ${agentName}` }).fill(objective);
  await page.getByRole('button', { name: 'Review mission' }).click();
  await page.getByRole('button', { name: /^Confirm mission/ }).click();
  await expect(page.getByRole('heading', { name: headline })).toBeVisible({ timeout: 5_000 });
  await page.getByRole('button', { name: 'Close mission queue' }).click();
}

test('the Pages artifact completes the authored research loop without any service request', async ({
  page,
}) => {
  const violations = enforceStaticNetworkBoundary(page);
  await startHelios(page);

  const connections = page.getByRole('region', { name: 'Runtime connections' });
  await expect(connections.getByText('Authored Sources')).toBeVisible();
  await expect(connections.getByText('Static Runtime')).toBeVisible();
  await page.getByLabel('Skip travel').check();
  await completeEvidenceMission(
    page,
    'mira',
    'Check latest weather at Galehaven Weather Tower',
    weatherHeadline,
  );

  const weatherCard = page.locator('.atlas-signal-card').filter({ hasText: weatherHeadline });
  await weatherCard.getByRole('button', { name: `Inspect sources for ${weatherHeadline}` }).click();
  const inspector = page.getByRole('dialog', { name: weatherHeadline });
  await expect(inspector).toContainText('Galehaven Crosswind Advisory 18:10Z');
  await expect(inspector).toContainText('Source record');
  await inspector.getByRole('button', { name: 'Done' }).click();

  await completeEvidenceMission(
    page,
    'orin',
    'Search historical delays in Archive Quarter',
    historicalHeadline,
  );

  await page.getByRole('main', { name: 'Interactive world stage' }).focus();
  await page.keyboard.press('a');
  const archive = page.getByRole('main', { name: 'Archive Quarter' });
  await expect(archive).toBeVisible();
  await archive.getByRole('searchbox', { name: 'Search archive' }).fill('crosswind');
  await expect(archive.getByText('2 matching source records')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Convene at Lantern Square' }).click();
  const meeting = page.getByRole('main', { name: 'Lantern Square meeting' });
  await expect(meeting.getByRole('heading', { name: 'Exchange recorded' })).toBeVisible();
  await expect(meeting.getByRole('region', { name: 'Shared signals' })).toContainText(
    '2 signals now shared',
  );
  await page.keyboard.press('Escape');

  await page.getByRole('main', { name: 'Interactive world stage' }).focus();
  await page.keyboard.press('p');
  const study = page.getByRole('main', { name: "Professor Vale's Study" });
  await expect(study.getByText('4 selected records')).toBeVisible();
  await study.getByRole('button', { name: 'Ask Professor' }).click();
  const response = study.getByRole('article', { name: 'Professor response' });
  await expect(response).toContainText('The signals are related but not duplicates');
  await expect(response).toContainText('Scripted fixture');
  await expect(response).toContainText('Evidence used · 4');
  await page.keyboard.press('Escape');

  await page.getByRole('main', { name: 'Interactive world stage' }).focus();
  await page.keyboard.press('c');
  const forecast = page.getByRole('dialog', { name: 'Commit Forecast' });
  await forecast.getByRole('spinbutton', { name: 'YES probability' }).fill('48');
  await forecast
    .getByRole('textbox', { name: /Public note/ })
    .fill('Static weather and the conditional base rate lower my estimate to 48%.');
  await forecast
    .getByRole('textbox', { name: /Private memo/ })
    .fill('Private static memo that must never enter the public export.');
  await forecast.getByRole('button', { name: 'Commit Forecast · 48%' }).click();
  await expect(forecast.getByRole('status')).toContainText('Revision committed at 48%');
  await forecast.getByRole('button', { name: 'Close' }).click();

  await page.reload();
  await page.getByRole('tab', { name: 'All 2' }).click();
  await expect(page.getByRole('heading', { name: weatherHeadline })).toBeVisible();
  await expect(page.getByRole('heading', { name: historicalHeadline })).toBeVisible();
  await expect(page.getByRole('banner', { name: 'Market overview' })).toContainText(
    'Static authored runtime',
  );

  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  const replay = page.getByRole('main', { name: 'Expedition replay case file' });
  await replay.getByRole('button', { name: 'Resolve fixture case' }).click();
  await expect(replay.getByText('Fixture case resolved')).toBeVisible();
  await expect(replay.getByRole('region', { name: 'Selected world projection' })).toContainText(
    'Final projection hash · verified',
  );
  const downloadPromise = page.waitForEvent('download');
  await replay.getByRole('button', { name: 'Export public JSON' }).click();
  const exported = await readDownload(await downloadPromise);
  expect(exported).toContain('signal-atlas.case-file');
  expect(exported).not.toContain('Private static memo that must never enter the public export.');

  expect(violations).toEqual([]);
});

test('the static Lobby creates all authored worlds and resets only browser demo state', async ({
  page,
}) => {
  const violations = enforceStaticNetworkBoundary(page);
  await page.goto('./?view=lobby');
  await expect(page.getByText('Browser-only authored showcase')).toBeVisible();
  await expect(page.getByText('No Pref, Codex, MCP, or API connection is used.')).toBeVisible();

  for (const title of [
    'Helios-3 Launch Window',
    'Northbridge Monetary Council',
    'Northlight Harbor Watch',
  ]) {
    await page.getByRole('button', { name: `Start ${title}` }).click();
    await expect(page.getByRole('main', { name: 'Interactive world stage' })).toBeVisible();
    await page.getByRole('button', { name: 'Open Expedition Lobby' }).click();
  }
  await expect(page.getByText('3 recorded events')).toHaveCount(0);
  await expect(page.getByText(/2 recorded events/)).toHaveCount(3);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Reset static demo' }).click();
  await expect(page.getByText('Saved workspaces').locator('..')).toContainText('0');
  await expect(page.getByRole('button', { name: /^Start / })).toHaveCount(3);
  expect(violations).toEqual([]);
});

test('the static Lobby defers the world renderer until an authored world opens', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));

  await page.goto('./?view=lobby');
  await expect(page.getByRole('heading', { name: 'Signal Atlas Expeditions' })).toBeVisible();
  expect(requests.some((url) => /\/phaser-[^/]+\.js$/u.test(url))).toBe(false);
  expect(requests.some((url) => /\/WorldShell-[^/]+\.js$/u.test(url))).toBe(false);

  await page.getByRole('button', { name: 'Start Helios-3 Launch Window' }).click();
  await expect(page.locator('.atlas-world-canvas')).toHaveAttribute('data-scene-ready', 'true');
  expect(requests.some((url) => /\/WorldShell-[^/]+\.js$/u.test(url))).toBe(true);
  expect(requests.some((url) => /\/phaser-[^/]+\.js$/u.test(url))).toBe(true);
});

test('@visual the static showcase preserves the five-part world at 1440 × 900', async ({
  page,
}) => {
  const violations = enforceStaticNetworkBoundary(page);
  await startHelios(page);
  await page.goto('./?expedition=exp-helios3-demo&capture=1');
  await expect(page.locator('.atlas-world-canvas')).toHaveAttribute('data-scene-ready', 'true');
  await expect(page).toHaveScreenshot('static-showcase-world-1440x900.png', {
    fullPage: true,
    maxDiffPixels: 100,
  });
  expect(violations).toEqual([]);
});
