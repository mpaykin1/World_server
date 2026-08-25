#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');

function arg(name, fallback = null) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback; }
function safe(s) { return s.replace(/[^a-z0-9._-]+/gi, '__'); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }

async function probe(browser, baseURL, route, device) {
  const context = await browser.newContext(device === 'mobile' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage(); const pageErrors = []; const consoleErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.addInitScript(() => {
    const q = window.__QA_PROBE = { drawCalls: 0, vertices: 0, textureUploads: 0, shaderCompiles: 0, shaderCompileMs: 0, longTasks: 0, webglContextLosses: 0 };
    const wrap = (proto, name, fn) => { if (!proto || !proto[name] || proto[name].__qa) return; const orig = proto[name]; const w = function(...args) { try { fn.call(this, args, q); } catch {} return orig.apply(this, args); }; w.__qa = true; proto[name] = w; };
    for (const proto of [window.WebGLRenderingContext?.prototype, window.WebGL2RenderingContext?.prototype]) {
      wrap(proto, 'drawArrays', (a, q) => { q.drawCalls++; q.vertices += Number(a[2] || 0); });
      wrap(proto, 'drawElements', (a, q) => { q.drawCalls++; q.vertices += Number(a[1] || 0); });
      wrap(proto, 'texImage2D', (_a, q) => { q.textureUploads++; });
      if (proto?.compileShader) { const orig = proto.compileShader; proto.compileShader = function(...a) { const t = performance.now(); const r = orig.apply(this, a); q.shaderCompiles++; q.shaderCompileMs += performance.now() - t; return r; }; }
    }
    addEventListener('webglcontextlost', () => q.webglContextLosses++, true);
    try { new PerformanceObserver(list => { q.longTasks += list.getEntries().length; }).observe({ type: 'longtask', buffered: true }); } catch {}
  });
  const url = new URL(route, baseURL).toString(); const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(800);
  const canvas = page.locator('canvas').first(); const canvasCount = await page.locator('canvas').count();
  if (canvasCount) { try { await canvas.click({ position: { x: 10, y: 10 }, timeout: 1500 }); } catch {} }
  for (const key of ['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space']) { try { await page.keyboard.press(key); } catch {} }
  try { await page.mouse.move(80, 80); await page.mouse.move(180, 120); } catch {}
  if (device === 'mobile') { try { await page.touchscreen.tap(100, 200); } catch {} }
  const runtime = await page.evaluate(async () => {
    const frames = []; const start = performance.now(); let last = start;
    await new Promise(resolve => { function f(t) { frames.push(t - last); last = t; if (t - start >= 2200) resolve(); else requestAnimationFrame(f); } requestAnimationFrame(f); });
    const positive = frames.filter(x => x > 0); const fps = positive.length ? positive.length / ((performance.now() - start) / 1000) : 0;
    const sorted = positive.slice().sort((a,b)=>a-b); const p95Frame = sorted[Math.floor(sorted.length * 0.95)] || 0;
    let contract = null; try { contract = typeof window.__QUALITY_AUTOPILOT_CONTRACT__ === 'function' ? window.__QUALITY_AUTOPILOT_CONTRACT__() : window.__QUALITY_AUTOPILOT_CONTRACT__ || null; } catch {}
    return { fps, fpsP95: p95Frame > 0 ? 1000 / p95Frame : fps, memoryMb: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null, probe: window.__QA_PROBE || {}, contract, visibility: document.visibilityState, title: document.title };
  });
  const visibleCanvas = canvasCount ? await canvas.isVisible().catch(() => false) : false;
  const metrics = { fpsP50: Number(runtime.fps.toFixed(2)), fpsP95: Number(runtime.fpsP95.toFixed(2)), errorRate: pageErrors.length + consoleErrors.length ? 1 : 0, memoryMb: runtime.memoryMb == null ? null : Number(runtime.memoryMb.toFixed(2)), webglContextLossRate: runtime.probe.webglContextLosses ? 1 : 0, p95LatencyMs: null, crashRate: 0 };
  const result = { route, device, url, httpStatus: response?.status() || null, ok: (response?.ok() ?? true) && (!canvasCount || visibleCanvas), canvasCount, visibleCanvas, pageErrors, consoleErrors: consoleErrors.slice(0, 20), metrics, gpu: runtime.probe, contract: runtime.contract, title: runtime.title };
  await context.close(); return result;
}

(async () => {
  const baseURL = arg('--base-url', process.env.QUALITY_CANDIDATE_URL || 'http://localhost:3000/');
  const routes = arg('--routes', process.env.QUALITY_PROJECT_ROUTES || '/apps/ai3d-voxel-city/').split(',').map(s => s.trim()).filter(Boolean);
  const out = arg('--out', path.join('data', 'quality-autopilot', 'browser-probe.json'));
  const telemetryDir = arg('--telemetry-dir', path.join('data', 'quality-autopilot', 'telemetry'));
  const noTelemetry = process.argv.includes('--no-telemetry');
  const browser = await chromium.launch({ headless: true }); const results = [];
  try { for (const route of routes) for (const device of ['desktop','mobile']) results.push(await probe(browser, baseURL, route, device)); } finally { await browser.close(); }
  const aggregate = { generatedAt: new Date().toISOString(), baseURL, ok: results.every(r => r.ok), results };
  writeJson(out, aggregate);
  if (!noTelemetry) for (const route of routes) {
    const rs = results.filter(r => r.route === route); const valid = rs.filter(r => r.metrics.fpsP50 > 0);
    const avg = key => { const a = valid.map(r => r.metrics[key]).filter(Number.isFinite); return a.length ? a.reduce((x,y)=>x+y,0)/a.length : null; };
    writeJson(path.join(telemetryDir, `${safe(route.replace(/^\/+|\/+$/g,''))}.current.json`), { route, generatedAt: aggregate.generatedAt, metrics: { fpsP50: avg('fpsP50'), fpsP95: avg('fpsP95'), errorRate: rs.some(r => r.pageErrors.length || r.consoleErrors.length) ? 1 : 0, memoryMb: avg('memoryMb'), webglContextLossRate: rs.some(r => r.gpu.webglContextLosses) ? 1 : 0, crashRate: rs.some(r => !r.ok) ? 1 : 0 } });
  }
  console.log(`[QUALITY_BROWSER_PROBE] routes=${routes.length} ok=${aggregate.ok}`);
  if (!aggregate.ok) process.exitCode = 2;
})().catch(e => { console.error(e); process.exitCode = 2; });
