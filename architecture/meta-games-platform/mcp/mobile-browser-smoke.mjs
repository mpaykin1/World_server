import { chromium } from '@playwright/test';
const root = 'https://mpaykin1.github.io/meta6/';
const cases = [
  ['Twilight Island', 'observer-world-en-v7/'],
  ['Ashen Path', 'ashen-sumerek/'],
  ['Underwater World', 'underwater-world/'],
  ['Three Worlds', 'three-worlds-game/']
];
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
});
try {
  for (const [title, path] of cases) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    const response = await page.goto(root + path, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (!response || response.status() !== 200) throw new Error(title + ': navigation HTTP ' + response?.status());
    await page.waitForTimeout(2000);
    const state = await page.evaluate(() => ({ readyState: document.readyState, canvases: document.querySelectorAll('canvas').length }));
    if (state.canvases < 1) throw new Error(title + ': no canvas found on loaded page');
    console.log('BROWSER PASS ' + title + ': HTTP 200, canvas=' + state.canvases + ', pageErrors=' + errors.length + (errors.length ? ' (first: ' + errors[0] + ')' : ''));
    await context.close();
  }
} finally {
  await browser.close();
}
