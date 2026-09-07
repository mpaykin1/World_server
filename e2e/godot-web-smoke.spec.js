const { test, expect } = require('@playwright/test');

const GODOT_WEB_PATH = '/apps/godot-web/';

test.describe('Godot Web Runtime Smoke Gate', () => {
  test('HTTP GET /apps/godot-web/ returns 200 status', async ({ request }) => {
    const resp = await request.get(GODOT_WEB_PATH);
    expect(resp.status()).toBe(200);
    const text = await resp.text();
    expect(text.length).toBeGreaterThan(100);
    expect(text.toLowerCase()).toContain('<canvas');
  });

  test('Godot Web app loads canvas and initializes without fatal browser errors', async ({ page }) => {
    const pageErrors = [];
    const consoleErrors = [];

    page.on('pageerror', (err) => {
      pageErrors.push(String(err));
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    const resp = await page.goto(GODOT_WEB_PATH, { waitUntil: 'domcontentloaded' });
    expect(resp.status()).toBe(200);

    const canvas = page.locator('canvas');
    await expect(canvas.first()).toBeVisible({ timeout: 15000 });

    // Allow runtime initialization window
    await page.waitForTimeout(2000);

    const fatalErrors = pageErrors.filter((e) =>
      !e.includes('SharedArrayBuffer') && !e.includes('Cross-Origin')
    );
    expect(fatalErrors, 'Fatal page errors found during Godot Web runtime start').toEqual([]);

    const fatalConsoleErrors = consoleErrors.filter((e) =>
      e.includes('Uncaught') || e.includes('TypeError') || e.includes('ReferenceError')
    );
    expect(fatalConsoleErrors, 'Fatal console errors found during Godot Web runtime start').toEqual([]);
  });
});
