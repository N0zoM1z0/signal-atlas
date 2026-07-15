import { expect, test, type Page } from '@playwright/test';

async function expectNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    bodyHeight: document.body.scrollHeight,
    bodyWidth: document.body.scrollWidth,
    viewportHeight: document.documentElement.clientHeight,
    viewportWidth: document.documentElement.clientWidth,
  }));

  expect(overflow.bodyHeight).toBeLessThanOrEqual(overflow.viewportHeight);
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewportWidth);
}

test('@visual world shell matches the five-region direction at 1440 × 900', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await expect(
    page.getByRole('heading', {
      name: 'Will the Helios-3 mission launch before September 30?',
    }),
  ).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Agents' })).toBeVisible();
  await expect(page.getByRole('main', { name: 'Interactive world stage' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Signals' })).toBeVisible();
  await expect(page.getByRole('contentinfo', { name: 'Agent command desk' })).toBeVisible();
  await expect(page.locator('.atlas-world-canvas')).toHaveAttribute('data-scene-ready', 'true');
  await expect(page.locator('.atlas-world-canvas')).toHaveAttribute('data-reduced-motion', 'true');
  await expectNoPageOverflow(page);

  await expect(page).toHaveScreenshot('world-shell-1440x900.png', {
    fullPage: true,
    maxDiffPixels: 100,
  });
});

test('@visual world shell remains usable at 1280 × 800', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Collapse agent dock' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Collapse signal rail' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Command Mira' })).toBeVisible();
  await expect(page.locator('.atlas-world-canvas')).toHaveAttribute('data-scene-ready', 'true');
  await expect(page.locator('.atlas-world-canvas')).toHaveAttribute('data-reduced-motion', 'true');
  await expectNoPageOverflow(page);

  await expect(page).toHaveScreenshot('world-shell-1280x800.png', {
    fullPage: true,
    maxDiffPixels: 100,
  });
});

test('desktop panels collapse independently and keyboard shortcuts preserve focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  const shell = page.locator('.signal-atlas-shell');
  await page.getByRole('button', { name: 'Collapse agent dock' }).click();
  await expect(shell).toHaveAttribute('data-agent-collapsed', 'true');
  await expect(shell).toHaveAttribute('data-signal-collapsed', 'false');

  await page.getByRole('button', { name: 'Collapse signal rail' }).click();
  await expect(shell).toHaveAttribute('data-signal-collapsed', 'true');
  await expectNoPageOverflow(page);

  await page.locator('body').click({ position: { x: 640, y: 400 } });
  await page.keyboard.press('/');
  await expect(page.getByRole('textbox', { name: 'Command Mira' })).toBeFocused();
  await page.keyboard.press('Escape');
  await page.getByRole('main', { name: 'Interactive world stage' }).focus();
  await page.keyboard.press('2');
  await expect(page.locator('.atlas-agent-card[data-agent="orin"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('narrow layout exposes mutually exclusive agent and signal drawers', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');

  const agents = page.getByRole('complementary', { name: 'Agents' });
  const signals = page.getByRole('complementary', { name: 'Signals' });
  await page.getByRole('button', { name: 'Open agents drawer' }).click();
  await expect(agents).toHaveAttribute('data-mobile-open', 'true');
  await expect(signals).toHaveAttribute('data-mobile-open', 'false');

  await page.getByRole('button', { name: 'Open signals drawer' }).click();
  await expect(agents).toHaveAttribute('data-mobile-open', 'false');
  await expect(signals).toHaveAttribute('data-mobile-open', 'true');
  await page.keyboard.press('Escape');
  await expect(signals).toHaveAttribute('data-mobile-open', 'false');
  await expectNoPageOverflow(page);
});

test('fixture, loading, and disconnected runtime states are explicit', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByText('● Fixture ready')).toBeVisible();

  await page.goto('/?state=loading');
  await expect(page.getByText('◌ Loading fixture')).toBeVisible();
  await expect(page.getByText('Charting Meridian Coast')).toBeVisible();
  await expect(page.getByRole('main', { name: 'Interactive world stage' })).toHaveAttribute(
    'aria-busy',
    'true',
  );

  await page.goto('/?state=disconnected');
  await expect(page.getByText('△ Orchestrator offline')).toBeVisible();
  await expect(page.getByText('Offline', { exact: true })).toBeVisible();
});

test('Phaser owns a crisp 48 × 30 world while the DOM mirror and camera stay synchronized', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const scene = page.locator('.atlas-world-canvas');
  const canvas = scene.locator('canvas');
  await expect(scene).toHaveAttribute('data-scene-ready', 'true');
  await expect(scene).toHaveAttribute('data-pixel-scale', '18');
  await expect(scene).toHaveAttribute('data-reduced-motion', 'true');
  await expect(scene).toHaveAttribute('data-agent-animation-paused', 'true');
  await expect(scene).toHaveAttribute('data-rendered-agent', 'mira');
  await expect(canvas).toHaveCount(1);
  await expect
    .poll(() => canvas.evaluate((element) => ({ height: element.height, width: element.width })))
    .toEqual({ height: 540, width: 864 });

  const placeButtons = page.locator('.atlas-place-mirror-layer .atlas-place');
  await expect(placeButtons).toHaveCount(6);
  const weatherTower = page.getByRole('button', { name: /^Galehaven Weather Tower\./ });
  await weatherTower.focus();
  await page.keyboard.press('Enter');
  await expect(weatherTower).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(scene).toHaveAttribute('data-zoom-step', '1');
  const centerBeforePan = Number(await scene.getAttribute('data-camera-center-x'));
  const canvasBounds = await canvas.boundingBox();
  expect(canvasBounds).not.toBeNull();
  if (!canvasBounds) throw new Error('Phaser canvas bounds are required for pan coverage.');
  await page.locator('.atlas-place').evaluateAll((elements) => {
    elements.forEach((element) => {
      (element as HTMLElement).style.pointerEvents = 'none';
    });
  });
  await page.mouse.move(canvasBounds.x + 432, canvasBounds.y + 270);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(canvasBounds.x + 332, canvasBounds.y + 270, { steps: 5 });
  await page.mouse.up({ button: 'middle' });
  await expect
    .poll(async () => Number(await scene.getAttribute('data-camera-center-x')))
    .not.toBe(centerBeforePan);
  await page.locator('.atlas-place').evaluateAll((elements) => {
    elements.forEach((element) => {
      (element as HTMLElement).style.pointerEvents = '';
    });
  });
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect(scene).toHaveAttribute('data-zoom-step', '0');

  await page.getByRole('main', { name: 'Interactive world stage' }).focus();
  await page.keyboard.press('f');
  await expect(scene).toHaveAttribute('data-following-agent', 'mira');
  await page.keyboard.press('Home');
  await expect(scene).toHaveAttribute('data-following-agent', '');

  await expect
    .poll(async () => Number(await scene.getAttribute('data-fps')), { timeout: 10_000 })
    .toBeGreaterThan(30);

  const observatory = page.getByRole('button', { name: /^Meridian Observatory\./ });
  await observatory.click();
  await expect(observatory).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.atlas-place').evaluateAll((elements) => {
    elements.forEach((element) => {
      (element as HTMLElement).style.pointerEvents = 'none';
    });
  });
  await canvas.click({ position: { x: 666, y: 80 } });
  await expect(weatherTower).toHaveAttribute('aria-pressed', 'true');
});

test('agent cards and procedural sprites synchronize selection, follow, and motion state', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const scene = page.locator('.atlas-world-canvas');
  const canvas = scene.locator('canvas');
  await expect(scene).toHaveAttribute('data-scene-ready', 'true');
  await expect(scene).toHaveAttribute('data-agent-animation-paused', 'true');

  const mira = page.locator('.atlas-agent-card[data-agent="mira"]');
  const orin = page.locator('.atlas-agent-card[data-agent="orin"]');
  const kestrel = page.locator('.atlas-agent-card[data-agent="kestrel"]');
  await expect(mira).toContainText('Field scout');
  await expect(mira).toContainText('Idle');
  await expect(mira).toContainText('Meridian Observatory');
  await expect(mira).toContainText('Awaiting mission');
  await expect(mira).toContainText('56%');
  await expect(orin).toContainText('Archivist');
  await expect(kestrel).toContainText('Skeptical analyst');

  await orin.focus();
  await page.keyboard.press('Enter');
  await expect(orin).toHaveAttribute('aria-pressed', 'true');
  await expect(scene).toHaveAttribute('data-rendered-agent', 'orin');
  await expect(page.locator('.atlas-command-agent strong')).toHaveText('Orin');
  await page.getByRole('button', { name: 'Follow Orin' }).click();
  await expect(scene).toHaveAttribute('data-following-agent', 'orin');

  await page.getByRole('button', { name: 'Center map' }).click();
  await page.locator('.atlas-place').evaluateAll((elements) => {
    elements.forEach((element) => {
      (element as HTMLElement).style.pointerEvents = 'none';
    });
  });
  await canvas.click({ position: { x: 218, y: 242 } });
  await expect(kestrel).toHaveAttribute('aria-pressed', 'true');
  await expect(scene).toHaveAttribute('data-rendered-agent', 'kestrel');
  await expect(page.locator('.atlas-command-agent strong')).toHaveText('Kestrel');
  await page.getByRole('button', { name: 'Follow Kestrel' }).click();
  await expect(scene).toHaveAttribute('data-following-agent', 'kestrel');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(scene).toHaveAttribute('data-agent-animation-paused', 'false');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(scene).toHaveAttribute('data-agent-animation-paused', 'true');
});
