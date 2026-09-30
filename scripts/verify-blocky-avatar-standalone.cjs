const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium, webkit } = require("@playwright/test");

const ROOT = path.join(__dirname, "..");
const htmlPath = path.join(ROOT, "apps", "blocky-avatar-139", "index.html");
const html = fs.readFileSync(htmlPath, "utf8");
assert.match(html, /WORLD SERVER BLOCKY/);
assert.match(html, /EXPECTED_CLIPS=139/);
assert.ok(Buffer.byteLength(html) > 5_000_000, "standalone HTML should embed the model and animation packs");

async function verify(engine, label, viewport) {
  const browser = await engine.launch({ headless: true });
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.goto("http://127.0.0.1:4173/apps/blocky-avatar-139/", { waitUntil: "load", timeout: 60_000 });
  await page.waitForFunction(() => window.__BLOCKY_TEST__ && typeof window.__BLOCKY_TEST__.ready === "boolean", null, { timeout: 60_000 });
  await page.waitForTimeout(700);
  const state = await page.evaluate(() => ({
    test: window.__BLOCKY_TEST__,
    canvas: { width: document.querySelector("canvas")?.clientWidth, height: document.querySelector("canvas")?.clientHeight },
    title: document.querySelector("#title")?.textContent,
    selected: document.querySelector("#select")?.options.length,
  }));
  assert.equal(state.test.ready, true, label + " boot failed: " + (state.test.error || "unknown error"));
  assert.equal(state.test.clips, 139, label + " must expose all 139 compatible clips");
  assert.equal(state.selected, 139, label + " selector must list all 139 clips");
  assert.ok(state.test.screenHeightRatio >= 0.85, label + " avatar visibility must be >=85%, got " + state.test.screenHeightRatio);
  assert.ok(state.test.screenHeightRatio <= 0.98, label + " avatar must stay inside the viewport");
  assert.equal(state.canvas.width, viewport.width);
  assert.equal(state.canvas.height, viewport.height);
  assert.equal(errors.length, 0, label + " browser errors: " + errors.join(" | "));
  fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  await page.screenshot({ path: path.join(ROOT, "artifacts", "blocky-avatar-" + label + ".png"), fullPage: true });
  await browser.close();
  return state.test;
}

(async () => {
  const desktop = await verify(chromium, "desktop", { width: 1280, height: 800 });
  const iphone = await verify(webkit, "iphone", { width: 414, height: 896 });
  console.log(JSON.stringify({ desktop, iphone }));
})().catch((err) => { console.error(err); process.exit(1); });
