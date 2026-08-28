const { test, expect } = require('@playwright/test');

test('ink glyph world V3 builds, animates, navigates, LODs and caches without browser errors', async ({ page }) => {
  const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('/apps/ink-glyph-world/?glyph=%E9%BE%8D&preset=city');
  await expect(page.locator('html')).toHaveAttribute('data-ink-glyph-ready','1',{timeout:45000});
  await expect(page.locator('html')).toHaveAttribute('data-ink-glyph-nav-ready','1',{timeout:45000});
  await expect(page.locator('html')).toHaveAttribute('data-ink-glyph-topology-ready','1',{timeout:45000});
  await expect(page.locator('#status')).toContainText('quality');
  await expect(page.locator('#status')).toContainText('strokes');
  await expect(page.locator('#status')).toContainText('nav');
  await expect(page.locator('#status')).toContainText('landmarks');
  const fonts=['liu-jian-mao-cao','ma-shan-zheng','zhi-mang-xing','long-cang'];
  const presets=['city','temple','mountain','monolith'];
  const glyphs=['龍','山','水','火'];
  for(let i=0;i<4;i++){
    await page.selectOption('#font',fonts[i]);
    await page.selectOption('#preset',presets[i]);
    await page.fill('#glyph',glyphs[i]);
    await page.click('#build');
    await expect(page.locator('#status')).toContainText('generated',{timeout:45000});
    await expect(page.locator('#status')).not.toHaveClass(/error/);
  }
  await page.selectOption('#lod','low');
  await page.click('#animate');
  await expect(page.locator('#animate')).toBeDisabled();
  await page.click('#nav');
  await expect(page.locator('#nav')).toHaveText('Show path');
  await page.click('#build');
  await expect(page.locator('#status')).toContainText('cache',{timeout:45000});
  expect(errors).toEqual([]);
});

test('GLB export starts a download', async ({ page }) => {
  await page.goto('/apps/ink-glyph-world/?glyph=%E5%B1%B1&preset=temple');
  await expect(page.locator('html')).toHaveAttribute('data-ink-glyph-ready','1',{timeout:45000});
  const downloadPromise=page.waitForEvent('download',{timeout:30000});
  await page.click('#exportGlb');
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.glb$/i);
});
