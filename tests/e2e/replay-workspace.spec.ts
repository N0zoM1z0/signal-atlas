import { expect, test, type Download, type Page } from '@playwright/test';

const weatherHeadline = 'Crosswind advisory overlaps launch window';
const privateMemo = 'Private replay test memo that must not be exported.';
const publicRationale = 'Fresh weather lowers my launch estimate to 48%.';

test.beforeEach(async ({ request }) => {
  await request.post('/api/testing/reset');
});

test.afterEach(async ({ request }) => {
  await request.post('/api/testing/reset');
});

async function readDownload(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Expected a readable case-file download.');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function reachResolvedReplay(page: Page) {
  await page.goto('/');
  await page.getByLabel('Skip travel').check();
  await page.getByRole('button', { name: 'Simulation speed 1 times' }).click();
  await page.getByRole('button', { name: 'Simulation speed 2 times' }).click();
  await page.locator('.atlas-agent-card[data-agent="mira"]').click();
  await page
    .getByRole('textbox', { name: 'Command Mira' })
    .fill('Check latest weather at Galehaven Weather Tower');
  await page.getByRole('button', { name: 'Review mission' }).click();
  await page.getByRole('button', { name: /^Confirm mission/ }).click();
  await expect(page.getByRole('heading', { name: weatherHeadline })).toBeVisible({
    timeout: 6_000,
  });
  await page.getByRole('button', { name: 'Close mission queue' }).click();

  await page.getByRole('main', { name: 'Interactive world stage' }).focus();
  await page.keyboard.press('c');
  const forecast = page.getByRole('dialog', { name: 'Commit Forecast' });
  await forecast.getByRole('spinbutton', { name: 'YES probability' }).fill('48');
  await forecast.getByRole('textbox', { name: /Public note/ }).fill(publicRationale);
  await forecast.getByRole('textbox', { name: /Private memo/ }).fill(privateMemo);
  await forecast.getByRole('button', { name: 'Commit Forecast · 48%' }).click();
  await expect(forecast.getByRole('status')).toContainText('Revision committed at 48%');
  await forecast.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  const replay = page.getByRole('main', { name: 'Expedition replay case file' });
  await expect(replay).toBeVisible();
  await replay.getByRole('button', { name: 'Resolve fixture case' }).click();
  await expect(replay.getByText('Fixture case resolved')).toBeVisible();
  await expect(
    replay.getByText(/Does not launch before the deadline · 30 Sept 2027/u),
  ).toBeVisible();
  const marketRibbon = page.getByRole('banner', { name: 'Market overview' });
  await expect(marketRibbon.getByRole('button', { name: 'Forecast closed' })).toBeDisabled();
  await expect(marketRibbon).toContainText('ResolvedNO');
  return replay;
}

test('resolved replay scrubs to evidence entry, verifies score, and exports public provenance', async ({
  page,
}, testInfo) => {
  const replay = await reachResolvedReplay(page);
  const projection = replay.getByRole('region', { name: 'Selected world projection' });
  const forecastPath = replay.getByRole('region', { name: 'Forecast and score timeline' });
  const slider = replay.getByRole('slider', { name: 'Replay sequence' });

  await expect(projection).toContainText('Final projection hash · verified');
  await expect(projection.locator('code')).toContainText(/^sha256:/u);
  const verifiedProjectionHash = (await projection.locator('code').textContent())?.trim();
  expect(verifiedProjectionHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
  await testInfo.attach('authoritative-replay-hash.txt', {
    body: `${verifiedProjectionHash}\n`,
    contentType: 'text/plain',
  });
  await expect(forecastPath).toContainText('0.4608 Brier score');
  await expect(forecastPath).toContainText(publicRationale);

  const sourceMarker = replay.getByRole('button', {
    name: /Source entered · Galehaven Crosswind Advisory 18:10Z/u,
  });
  const markerSequence = (await sourceMarker.locator('span').textContent())?.match(/\d+/u)?.[0];
  expect(markerSequence).toBeTruthy();
  await sourceMarker.click();
  await expect(slider).toHaveValue(markerSequence ?? '');
  await expect(projection).toContainText('Source Recorded');
  await expect(projection).toContainText('Sources1');

  await slider.focus();
  await page.keyboard.press('Home');
  await expect(slider).toHaveValue('0');
  await expect(projection).toContainText('Genesis state');
  await expect(projection).toContainText('Sources0');

  await replay.getByRole('button', { name: 'Latest replay sequence' }).click();
  await expect(projection).toContainText('Expedition Resolved');
  const downloadPromise = page.waitForEvent('download');
  await replay.getByRole('button', { name: 'Export public JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('signal-atlas-exp-helios3-demo-case-file.json');
  const exportedText = await readDownload(download);
  const exported = JSON.parse(exportedText) as {
    kind: string;
    finalProjectionHash: string;
    sources: unknown[];
    claims: unknown[];
    signals: unknown[];
    forecastRationales: Array<{ rationale: string }>;
    events: unknown[];
  };
  expect(exported).toMatchObject({
    kind: 'signal-atlas.case-file',
    finalProjectionHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
  });
  expect(exported.finalProjectionHash).not.toBe(verifiedProjectionHash);
  await testInfo.attach('public-export-replay-hash.txt', {
    body: `${exported.finalProjectionHash}\n`,
    contentType: 'text/plain',
  });
  process.stdout.write(
    `REPLAY_HASHES ${JSON.stringify({ authoritative: verifiedProjectionHash, publicExport: exported.finalProjectionHash })}\n`,
  );
  expect(exported.sources).toHaveLength(1);
  expect(exported.claims).toHaveLength(1);
  expect(exported.signals).toHaveLength(1);
  expect(exported.forecastRationales.map((forecast) => forecast.rationale)).toContain(
    publicRationale,
  );
  expect(exported.events.length).toBeGreaterThan(0);
  expect(exportedText).not.toContain(privateMemo);
});

test('@visual resolved case replay keeps landmarks, projection, and scoring legible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await reachResolvedReplay(page);

  await expect(page).toHaveScreenshot('case-file-replay-1440x900.png', {
    fullPage: true,
    mask: [page.locator('.atlas-replay-hash code')],
    maskColor: '#182036',
    maxDiffPixels: 100,
  });
});
