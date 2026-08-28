const { test, expect } = require('@playwright/test');

// Visual/DOM baseline for the recovered `improve-world-home` frontend
// (see WORK_IN_PROGRESS.md for recovery provenance). This exists so a
// future backend migration (Supabase persistence, real world creation)
// can prove it didn't change the interface — per the explicit requirement
// that the current design/UX/questionnaire is not a redesign target.
//
// Runs against the live production URL directly rather than the shared
// local dev server: this app is a standalone Vercel project using
// root-relative asset paths (/client.js), not nested under world-server's
// /apps/<name>/ convention, so it can't be served correctly by the shared
// server.js used by every other spec in this file.
const HOME_URL = 'https://improve-world-home-improve-world.vercel.app/';

test('homepage renders the expected landing screen with no Vercel Authentication wall', async ({ page }) => {
  const response = await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });
  expect(response.status()).toBe(200);
  expect(page.url()).toContain('improve-world-home-improve-world.vercel.app');
  await expect(page).toHaveTitle('IMPROVE WORLD');
  await expect(page.getByRole('button', { name: 'Создать' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Присоединиться' })).toBeVisible();
});

test('landing screen visual baseline', async ({ page }) => {
  await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveScreenshot('improve-world-home-landing.png', { fullPage: true, maxDiffPixelRatio: 0.02 });
});

test('questionnaire (Создать) reaches question 1 of 31 with expected controls', async ({ page }) => {
  await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Создать' }).click();
  await expect(page.getByText('1 / 31')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Пропустить' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Дальше →' })).toBeVisible();
});

test('join flow (Присоединиться) lists exactly the 3 known worlds', async ({ page }) => {
  await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Присоединиться' }).click();
  const worldLinks = page.getByRole('link', { name: 'Открыть мир ↗' });
  await expect(worldLinks).toHaveCount(3);
  for (const href of [
    'voxel-gothic-steampunk-world-improve-world.vercel.app',
    'gothic-voxel-city-atlas-v3-mobile-final-improve-world.vercel.app',
    'voxel-gothic-steampunk-mobile-repaired-improve-world.vercel.app'
  ]) {
    await expect(page.locator(`a[href*="${href}"]`)).toHaveCount(1);
  }
});

test('a world link opens without a Vercel Authentication wall', async ({ page, context }) => {
  await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Присоединиться' }).click();
  const [worldPage] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('a[href*="voxel-gothic-steampunk-world-improve-world.vercel.app"]').click()
  ]);
  await worldPage.waitForLoadState('domcontentloaded');
  expect(worldPage.url()).not.toContain('vercel.com');
  await expect(worldPage).not.toHaveTitle(/Login|Sign in/i);
});
