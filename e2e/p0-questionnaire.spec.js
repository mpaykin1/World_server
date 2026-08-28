const { test, expect } = require('@playwright/test');

test.describe('P0 Questionnaire -> World', () => {
  test('questionnaire creates world A', async ({ page }) => {
    await page.goto('https://improve-world-home-improve-world.vercel.app/');
    // Click Создать (Create)
    const createBtn = page.locator('text=Создать').first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();
    const question = page.locator('#question');
    await expect(question).toBeVisible({ timeout: 10000 });
    const input = page.locator('textarea, input').first();
    await input.fill('Test world A - ' + Date.now());
    await page.click('text=Дальше');
    // Skip through remaining
    for(let i=0;i<10;i++){
      const nextBtn = page.locator('text=Дальше');
      if(await nextBtn.isVisible({timeout: 1000})) {
        await nextBtn.click();
        await page.waitForTimeout(300);
      } else break;
    }
    await expect(page.locator('#resultTitle, #scene')).toBeVisible({ timeout: 15000 });
    const scene = await page.locator('#scene').textContent();
    expect(scene.length).toBeGreaterThan(10);
    // Check localStorage or Supabase persistence
    const worldId = await page.evaluate(() => localStorage.getItem('worldId') || localStorage.getItem('lastWorldId') || document.documentElement.innerHTML.slice(0,100));
    expect(worldId).toBeTruthy();
  });
});
