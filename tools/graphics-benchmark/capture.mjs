#!/usr/bin/env node
/**
 * Reproducible graphics evidence capture. Requires an installed Playwright package
 * and Chromium (npx playwright install chromium). Never claims real iPhone FPS.
 *
 * node tools/graphics-benchmark/capture.mjs \
 *   --candidate experiments/creature-civilizations/index.html \
 *   --reference /path/to/claude.html --out /tmp/graphics-evidence
 */
import { chromium } from 'playwright';
import { resolve, join } from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--') || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('Expected --key value: ' + key);
    out[key.slice(2)] = argv[++i];
  }
  if (!out.candidate || !out.reference || !out.out) throw new Error('Required: --candidate FILE --reference FILE --out DIR');
  return out;
}
const opts = args(process.argv.slice(2));
const width = Number(opts.width || 390), height = Number(opts.height || 844);
const duration = Number(opts.duration || 5000);
if (![width, height, duration].every(Number.isFinite) || width < 100 || height < 100 || duration < 1000) throw new Error('Invalid viewport or duration');
const outDir = resolve(opts.out);
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const evidence = {
  protocol: 'graphics-benchmark-v1',
  viewport: { width, height, deviceScaleFactor: 1 },
  durationMs: duration,
  browser: browser.version(),
  environment: 'desktop Chromium mobile emulation; NOT real iPhone',
  comparable: false,
  reference: null,
  candidate: null,
  verdict: 'UNKNOWN: requires human visual review and real-device testing'
};
async function capture(name, file) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'no-preference'
  });
  const errors = [];
  const blockedRequests = [];
  const failedRequests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', request => { if (/^https?:/i.test(request.url())) blockedRequests.push(request.url()); });
  page.on('requestfailed', request => failedRequests.push({ url: request.url(), failure: request.failure()?.errorText || 'unknown' }));
  page.on('response', response => { if (response.status() >= 400) failedRequests.push({ url: response.url(), status: response.status() }); });
  await page.addInitScript(() => {
    let seed = 1337;
    Math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    window.__graphicsFrameSamples = [];
    const original = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => original(t => {
      window.__graphicsFrameSamples.push(t);
      cb(t);
    });
  });
  const url = pathToFileURL(resolve(file)).href;
  const response = await page.goto(url, { waitUntil: 'load', timeout: 20000 });
  const frames = [];
  for (const [index, interval] of [duration / 3, duration / 3, duration / 3].entries()) {
    await page.waitForTimeout(interval);
    const frameName = name + '-t' + (index + 1) + '.png';
    await page.screenshot({ path: join(outDir, frameName), fullPage: false });
    frames.push({ elapsedMs: Math.round((index + 1) * duration / 3), screenshot: frameName });
  }
  await page.screenshot({ path: join(outDir, name + '.png'), fullPage: false });
  const data = await page.evaluate(() => {
    const samples = window.__graphicsFrameSamples || [];
    const deltas = samples.slice(1).map((t, i) => t - samples[i]).filter(n => n > 0 && n < 1000).sort((a,b) => a-b);
    const percentile = p => deltas.length ? deltas[Math.min(deltas.length-1, Math.floor((deltas.length-1)*p))] : null;
    const p50 = percentile(.5), p95 = percentile(.95);
    return {
      title: document.title,
      canvasCount: document.querySelectorAll('canvas').length,
      frameSamples: samples.length,
      frameTimeP50Ms: p50,
      frameTimeP95Ms: p95,
      fpsFromP50: p50 ? 1000/p50 : null,
      fpsFromP95: p95 ? 1000/p95 : null,
      note: 'requestAnimationFrame scheduling, not GPU render duration',
      visibleCanvas: [...document.querySelectorAll('canvas')].filter(c => c.width > 0 && c.height > 0).length,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight
    };
  });
  await page.close();
  return { path: resolve(file), url, httpStatus: response?.status() ?? null, screenshot: name+'.png', frames, errors, blockedRequests, failedRequests, ...data };
}
try {
  evidence.reference = await capture('reference', opts.reference);
  evidence.candidate = await capture('candidate', opts.candidate);
  evidence.comparable = [evidence.reference, evidence.candidate].every(run => run.errors.length === 0 && run.blockedRequests.length === 0 && run.failedRequests.length === 0 && run.visibleCanvas > 0 && run.frameSamples >= 2);
  // Byte equality is a deterministic integrity check, not an artistic-quality score.
  // PNGs may differ because of timestamps or non-deterministic rendering even when
  // two scenes are visually indistinguishable.
  const { createHash } = await import('node:crypto');
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  const refBytes = await readFile(join(outDir, evidence.reference.screenshot));
  const candidateBytes = await readFile(join(outDir, evidence.candidate.screenshot));
  evidence.pixelEvidence = {
    referenceSha256: digest(refBytes),
    candidateSha256: digest(candidateBytes),
    byteIdentical: refBytes.equals(candidateBytes),
    interpretation: 'Byte equality only. NOT perceptual similarity or artistic parity.'
  };

  evidence.verdict = evidence.comparable ? 'READY FOR HUMAN VISUAL REVIEW; visual parity UNKNOWN' : 'INVALID CAPTURE: errors, missing assets, external dependencies, no canvas or no animation; visual parity UNKNOWN';
  await writeFile(join(outDir, 'evidence.json'), JSON.stringify(evidence, null, 2)+'\n');
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const panels = ['reference', 'candidate'].map(side => {
    const run = evidence[side];
    const stats = 'JS errors: ' + run.errors.length + ' | external requests: ' + run.blockedRequests.length +
      ' | failed requests: ' + run.failedRequests.length + ' | RAF samples: ' + run.frameSamples +
      ' | p95 interval: ' + (run.frameTimeP95Ms == null ? 'N/A' : run.frameTimeP95Ms.toFixed(1) + 'ms');
    const images = [run.screenshot, ...run.frames.map(frame => frame.screenshot)];
    return '<section><h2>' + escapeHtml(side.toUpperCase()) + '</h2><p>' + escapeHtml(stats) + '</p>' +
      images.map((name, index) => '<figure><img loading="lazy" src="' + encodeURIComponent(name) +
        '" alt="' + escapeHtml(side + ' frame ' + index) + '"><figcaption>' +
        escapeHtml(name) + '</figcaption></figure>').join('') + '</section>';
  }).join('');
  const report = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Graphics comparison evidence</title><style>body{font:15px system-ui;background:#10151d;color:#f2f4fa;margin:20px}' +
    'main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}section{min-width:0}' +
    'img{max-width:100%;height:auto;border:1px solid #536073;border-radius:8px}figure{margin:14px 0}' +
    'figcaption{color:#a9b5c6}p{overflow-wrap:anywhere}@media(max-width:700px){main{grid-template-columns:1fr}}</style></head><body>' +
    '<h1>Graphics production evidence</h1><p>' + escapeHtml(evidence.verdict) +
    '</p><p>Desktop Chromium emulation, not a real iPhone. Images require human review; this report does not prove Claude parity.</p>' +
    '<main>' + panels + '</main></body></html>';
  await writeFile(join(outDir, 'report.html'), report);

  console.log(JSON.stringify(evidence, null, 2));
  if (!evidence.comparable) process.exitCode = 2;
} finally {
  await browser.close();
}
