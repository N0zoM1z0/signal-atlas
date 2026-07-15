import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.post('/api/testing/reset');
});

test.afterEach(async ({ request }) => {
  await request.post('/api/testing/reset');
});

async function tabTo(page: Page, target: Locator, limit = 160): Promise<void> {
  await target.waitFor({ state: 'visible' });
  for (let index = 0; index < limit; index += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Keyboard focus did not reach ${await target.getAttribute('aria-label')}.`);
}

async function expectNoPageOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    bodyHeight: document.body.scrollHeight,
    bodyWidth: document.body.scrollWidth,
    viewportHeight: document.documentElement.clientHeight,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewportWidth);
  expect(overflow.bodyHeight).toBeLessThanOrEqual(overflow.viewportHeight);
}

async function expectNoSeriousAxeViolations(page: Page, state: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const violations = results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => ({
      help: violation.help,
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.flatMap((node) => node.target.map(String)),
    }));
  expect(violations, `${state} has serious or critical accessibility violations`).toEqual([]);
}

test('the required expedition journey is completable with keyboard input and restores focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('.signal-atlas-shell')).toHaveAttribute(
    'data-event-stream-state',
    'live',
  );

  await page.getByRole('main', { name: 'Interactive world stage' }).focus();
  await page.keyboard.press('2');
  await expect(page.locator('.atlas-agent-card[data-agent="orin"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('1');
  await expect(page.locator('.atlas-agent-card[data-agent="mira"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.keyboard.press('/');
  const command = page.getByRole('textbox', { name: 'Command Mira' });
  await expect(command).toBeFocused();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Check latest weather at Galehaven Weather Tower');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Mission draft' })).toBeVisible();

  const confirm = page.getByRole('button', { name: /^Confirm mission/ });
  await tabTo(page, confirm);
  await page.keyboard.press('Enter');
  await expect(page.getByText('Mira → Galehaven Weather Tower · traveling')).toBeVisible();

  const skipTravel = page.getByRole('button', { name: 'Skip travel' });
  await tabTo(page, skipTravel);
  await page.keyboard.press('Enter');
  const inspectSource = page.getByRole('button', {
    name: 'Inspect sources for Crosswind advisory overlaps launch window',
  });
  await expect(inspectSource).toBeVisible({ timeout: 6_000 });
  await tabTo(page, inspectSource);
  await page.keyboard.press('Enter');

  const sourceDialog = page.getByRole('dialog', {
    name: 'Crosswind advisory overlaps launch window',
  });
  await expect(sourceDialog).toBeVisible();
  await expect(sourceDialog.getByRole('button', { name: 'Close' })).toBeFocused();
  await expect(sourceDialog).toContainText('Galehaven Crosswind Advisory 18:10Z');
  await page.keyboard.press('Escape');
  await expect(sourceDialog).toBeHidden();
  await expect(page.getByRole('tab', { name: 'New 0' })).toBeFocused();

  await page.getByRole('main', { name: 'Interactive world stage' }).focus();
  await page.keyboard.press('a');
  const archive = page.getByRole('main', { name: 'Archive Quarter' });
  await expect(archive).toBeVisible();
  await expect(archive).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-workspace-target="archive"]')).toBeFocused();

  await page.getByRole('main', { name: 'Interactive world stage' }).focus();
  await page.keyboard.press('p');
  const professor = page.getByRole('main', { name: "Professor Vale's Study" });
  await expect(professor).toBeVisible();
  await expect(professor).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-workspace-target="professor"]')).toBeFocused();

  await page.getByRole('main', { name: 'Interactive world stage' }).focus();
  await page.keyboard.press('c');
  const forecast = page.getByRole('dialog', { name: 'Commit Forecast' });
  await expect(forecast).toBeVisible();
  await expect(forecast.getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(forecast).toBeHidden();
  await expect(page.getByRole('main', { name: 'Interactive world stage' })).toBeFocused();

  await page.getByRole('main', { name: 'Interactive world stage' }).focus();
  await page.keyboard.press('r');
  const replay = page.getByRole('main', { name: 'Expedition replay case file' });
  await expect(replay).toBeVisible();
  await expect(replay).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-workspace-target="replay"]')).toBeFocused();

  await page.getByRole('main', { name: 'Interactive world stage' }).focus();
  await page.keyboard.press('m');
  const meeting = page.getByRole('main', { name: 'Lantern Square meeting' });
  await expect(meeting).toBeVisible();
  await expect(meeting).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('main', { name: 'Interactive world stage' })).toBeFocused();
});

test('semantic mirrors expose every canvas place, agent movement, route, and world action', async ({
  page,
}) => {
  await page.goto('/');
  const textView = page.getByRole('region', { name: 'World state text view' });
  await expect(textView).toContainText('Agents and movement');
  await expect(textView).toContainText('Mira · Idle · Meridian Observatory');
  await expect(textView).toContainText('Places and available missions');
  await expect(textView).toContainText('Galehaven Weather Tower');
  await expect(textView).toContainText('Routes');
  await expect(textView).toContainText('Meridian Observatory to Lantern Square');
  await expect(page.locator('.atlas-place-mirror-layer .atlas-place')).toHaveCount(6);
  await expect(page.locator('.atlas-agent-list .atlas-agent-card')).toHaveCount(3);
  await expect(page.getByRole('navigation', { name: 'World views' })).toBeVisible();
});

test('world, archive, professor, forecast, and replay have no serious automated violations', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('.signal-atlas-shell')).toHaveAttribute(
    'data-event-stream-state',
    'live',
  );
  await expectNoSeriousAxeViolations(page, 'World');

  await page.locator('[data-workspace-target="archive"]').click();
  await expect(page.getByRole('main', { name: 'Archive Quarter' })).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'Archive');
  await page.keyboard.press('Escape');

  await page.locator('[data-workspace-target="professor"]').click();
  await expect(page.getByRole('main', { name: "Professor Vale's Study" })).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'Professor');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Commit Forecast' }).click();
  await expect(page.getByRole('dialog', { name: 'Commit Forecast' })).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'Forecast');
  await page.keyboard.press('Escape');

  await page.locator('[data-workspace-target="replay"]').click();
  await expect(page.getByRole('main', { name: 'Expedition replay case file' })).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'Replay');
});

test('200 percent zoom equivalent reflows core controls and preserves reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 450 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: /Will the Helios-3 mission launch/ }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open agents drawer' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open signals drawer' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Command Mira' })).toBeVisible();
  await expect(page.locator('.atlas-world-canvas')).toHaveAttribute('data-reduced-motion', 'true');
  await expect(page.locator('.atlas-world-canvas')).toHaveAttribute(
    'data-agent-animation-paused',
    'true',
  );
  await expectNoPageOverflow(page);

  await page.getByRole('button', { name: 'Open agents drawer' }).click();
  await expect(page.getByRole('complementary', { name: 'Agents' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary', { name: 'Agents' })).toBeHidden();
  await page.locator('[data-workspace-target="archive"]').click();
  await expect(page.getByRole('main', { name: 'Archive Quarter' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Return to World/ })).toBeVisible();
  await expectNoPageOverflow(page);
});

test('forced-colors mode preserves focus, selected state, and control boundaries', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await page.goto('/');

  const weatherTower = page.getByRole('button', { name: /^Galehaven Weather Tower\./ });
  await weatherTower.focus();
  await expect(weatherTower).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(weatherTower).toHaveAttribute('aria-pressed', 'true');
  const affordance = await weatherTower.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      borderStyle: style.borderStyle,
      borderWidth: style.borderWidth,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
  expect(affordance.borderStyle).not.toBe('none');
  expect(affordance.borderWidth).not.toBe('0px');
  expect(affordance.outlineStyle).not.toBe('none');
  expect(affordance.outlineWidth).not.toBe('0px');
  await expect(page.locator('.atlas-world-canvas')).toHaveAttribute('data-reduced-motion', 'true');
});
