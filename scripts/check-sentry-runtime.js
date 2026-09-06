'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
let failures = [];

function fail(msg) {
  failures.push(msg);
  console.error('[SENTRY_CHECK] FAIL:', msg);
}

function ok(msg) {
  console.log('[SENTRY_CHECK] OK:', msg);
}

// 1. @sentry/browser installed
try {
  require.resolve('@sentry/browser');
  ok('@sentry/browser installed');
} catch {
  fail('@sentry/browser not installed');
}

// 2. esbuild installed
try {
  require.resolve('esbuild');
  ok('esbuild installed');
} catch {
  fail('esbuild not installed');
}

// 3. entry exists
const entry = path.join(root, 'shared', 'sentry-runtime.entry.js');
if (fs.existsSync(entry)) ok('shared/sentry-runtime.entry.js exists');
else fail('shared/sentry-runtime.entry.js missing');

// 4. bundle exists and valid
const bundle = path.join(root, 'shared', 'sentry-runtime.js');
if (!fs.existsSync(bundle)) {
  fail('shared/sentry-runtime.js missing (run npm run build:sentry)');
} else {
  const stat = fs.statSync(bundle);
  const content = fs.readFileSync(bundle, 'utf8');
  if (stat.size < 10000) fail(`bundle too small: ${stat.size} bytes`);
  else ok(`bundle exists ${stat.size} bytes`);
  if (!content.includes('WorldServerSentry')) fail('bundle missing WorldServerSentry');
  else ok('bundle contains WorldServerSentry');
  if (!content.includes('ingest.de.sentry.io')) fail('bundle missing ingest.de.sentry.io');
  else ok('bundle contains ingest domain');
}

// 5. all apps/**/index.html contain sentry-runtime and not baseline/assets
const appsDir = path.join(root, 'apps');
const apps = fs.readdirSync(appsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
let injected = 0;
for (const app of apps) {
  const idx = path.join(appsDir, app, 'index.html');
  if (!fs.existsSync(idx)) continue;
  const html = fs.readFileSync(idx, 'utf8');
  if (html.includes('/shared/sentry-runtime.js')) {
    ok(`${app}/index.html has sentry-runtime`);
    injected++;
  } else {
    fail(`${app}/index.html missing <script src="/shared/sentry-runtime.js">`);
  }
}
if (injected < 3) fail(`only ${injected} apps injected, expected >=3`);
else ok(`injected ${injected} apps`);

// 6. baseline/assets never modified
const baseline = path.join(root, 'apps', 'ai3d-reference-test', 'assets', 'previous_html_baseline.html');
if (fs.existsSync(baseline)) {
  const bl = fs.readFileSync(baseline, 'utf8');
  if (bl.includes('sentry-runtime')) fail('baseline file was mutated by injector (must never touch baseline)');
  else ok('baseline file untouched');
}
const assetsDir = path.join(root, 'apps', 'ai3d-reference-test', 'assets');
if (fs.existsSync(assetsDir)) {
  for (const f of fs.readdirSync(assetsDir)) {
    if (f.toLowerCase().endsWith('.html')) {
      const full = path.join(assetsDir, f);
      const c = fs.readFileSync(full, 'utf8');
      if (c.includes('sentry-runtime')) fail(`assets html ${f} was mutated`);
    }
  }
  ok('assets/** untouched');
}

// Generic baseline glob
const globBaseline = [];
function walk(dir, relBase) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    const rel = path.join(relBase, ent.name);
    if (ent.isDirectory()) {
      if (ent.name.toLowerCase() === 'assets') {
        // check inside assets and skip deeper injection check (already verified)
        walk(full, rel);
        continue;
      }
      walk(full, rel);
    } else if (ent.name.toLowerCase().includes('baseline')) {
      globBaseline.push(rel);
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes('sentry-runtime')) fail(`baseline file ${rel} contains sentry-runtime`);
    }
  }
}
walk(appsDir, 'apps');
if (globBaseline.length === 0) ok('no baseline files found (expected at least one) - OK if none');
else ok(`${globBaseline.length} baseline files checked`);

if (failures.length) {
  console.error(`\n[SENTRY_CHECK] ${failures.length} failures`);
  process.exit(1);
} else {
  console.log('\n[SENTRY_CHECK] PASS all static checks');
}
