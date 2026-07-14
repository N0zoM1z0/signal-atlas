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
  await expectNoPageOverflow(page);

  await expect(page).toHaveScreenshot('world-shell-1440x900.png', {
    fullPage: true,
  });
});

test('@visual world shell remains usable at 1280 × 800', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Collapse agent dock' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Collapse signal rail' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Command Mira' })).toBeVisible();
  await expectNoPageOverflow(page);

  await expect(page).toHaveScreenshot('world-shell-1280x800.png', {
    fullPage: true,
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
  await expect(page.getByText('△ Pref disconnected')).toBeVisible();
  await expect(page.getByText('Offline')).toBeVisible();
});
