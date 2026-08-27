'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Regression guard for the recovered `improve-world-home` frontend.
// Recovered 2026-08-26: first from the live production deployment's
// served assets, then corrected/supplemented against the real Vercel
// Deployment Files API (`vercel api "/v6/deployments/{id}/files"`),
// which turned out to be fully accessible via the existing CLI
// authentication — no separate token needed. That API call returned the
// project's true source tree (`check.js`, `package.json`, `vercel.json`,
// `public/app.js`, `public/index.html`); `public/app.js`/`public/index.html`
// were confirmed byte-identical to the earlier live-asset reconstruction
// (only the intentional `/app.js` script path was ever a deliberate
// deviation, now reverted). `check.js`/`package.json`/`vercel.json` are
// restored here verbatim from that API response — this is the project's
// real regression-gate build step, not a simplification of it. See
// WORK_IN_PROGRESS.md for full provenance.

const APP_DIR = path.join(__dirname, '..', 'apps', 'improve-world-home');
const PUBLIC_DIR = path.join(APP_DIR, 'public');

test('apps/improve-world-home/public/index.html and public/app.js exist', () => {
  assert.ok(fs.existsSync(path.join(PUBLIC_DIR, 'index.html')));
  assert.ok(fs.existsSync(path.join(PUBLIC_DIR, 'app.js')));
});

test('app.js keeps the exact CREATE (31) and JOIN (28) questionnaire lengths', () => {
  const source = fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf8');
  // The file also reads localStorage.iwStoryId/iwWorldId and registers a
  // window 'online' listener at top-level module scope (recovery-cache and
  // offline-sync state for the story/world backend wiring) — stub just
  // enough of both for evaluation outside a real browser.
  const previousLocalStorage = global.localStorage;
  const previousWindow = global.window;
  global.localStorage = {};
  global.window = { addEventListener() {} };
  try {
    // eslint-disable-next-line no-new-func
    const { CREATE, JOIN } = new Function(`${source}\nreturn { CREATE, JOIN };`.replace(
      // The recovered file calls verifyContract()/home() at load time, which
      // touch `document`/`location` — stub just enough to evaluate the file
      // for its data arrays without a real DOM.
      'verifyContract();location.hash===\'#why\'?showWhy():home();',
      ''
    ))();
    assert.equal(CREATE.length, 31, 'CREATE questionnaire must stay at 31 questions (IW_CONTRACT)');
    assert.equal(JOIN.length, 28, 'JOIN questionnaire must stay at 28 questions (IW_CONTRACT)');
  } finally {
    global.localStorage = previousLocalStorage;
    global.window = previousWindow;
  }
});

test('app.js still contains its own IW_CONTRACT runtime regression guard', () => {
  const source = fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf8');
  assert.ok(source.includes('IW_CONTRACT'), 'the app\'s own built-in regression guard must not be removed');
  assert.ok(source.includes("rule:'ADD_ONLY'"), 'the ADD_ONLY contract rule must not be weakened');
});

test('index.html declares the same ADD_ONLY regression contract in its meta tag', () => {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  assert.match(html, /iw-regression-contract/);
  assert.match(html, /create=31/);
  assert.match(html, /join=28/);
});

test('index.html references app.js as a root-relative script (standalone Vercel deployment, not nested under /apps/)', () => {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  assert.match(html, /<script src="\/app\.js">/);
});

test('apps/improve-world-home/vercel.json restores the real original build pipeline (npm run build -> node check.js -> public/)', () => {
  const config = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'vercel.json'), 'utf8'));
  assert.equal(config.buildCommand, 'npm run build');
  assert.equal(config.outputDirectory, 'public');
});

test('apps/improve-world-home/vercel.json proxies /api/* to the main world-server API (cross-project, no CORS needed)', () => {
  // improve-world-home is its own Vercel project (rootDirectory-scoped to
  // this directory) -- it has no api/ of its own, so a same-origin fetch
  // like /api/story from public/app.js would 404 in production without
  // this. An external rewrite keeps the browser's call same-origin (no CORS
  // headers to maintain on the API side) while Vercel's edge proxies it to
  // the real api/narrative.js router on the main deployment.
  const config = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'vercel.json'), 'utf8'));
  const rewrite = (config.rewrites || []).find((r) => r.source === '/api/:path*');
  assert.ok(rewrite, 'vercel.json must proxy /api/* to the main world-server deployment');
  assert.equal(rewrite.destination, 'https://world-server.vercel.app/api/:path*');
});

test('check.js regression gate exists and actually passes against the recovered public/ files', () => {
  const checkPath = path.join(APP_DIR, 'check.js');
  assert.ok(fs.existsSync(checkPath));
  const result = require('node:child_process').spawnSync(process.execPath, [checkPath], { cwd: APP_DIR, encoding: 'utf8' });
  assert.equal(result.status, 0, `check.js must exit 0 (stdout: ${result.stdout} stderr: ${result.stderr})`);
  assert.match(result.stdout, /ADD_ONLY_REGRESSION_GATE PASS create=31 join=28/);
});

test('package.json wires the build script to the real regression gate', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.build, 'node check.js');
});
