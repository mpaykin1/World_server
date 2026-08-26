'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
let failures = [];

function fail(msg) {
  failures.push(msg);
  console.error('[POSTHOG_CHECK] FAIL:', msg);
}

function ok(msg) {
  console.log('[POSTHOG_CHECK] OK:', msg);
}

// 1. posthog-js installed
try {
  require.resolve('posthog-js');
  ok('posthog-js installed');
} catch {
  fail('posthog-js not installed');
}

// 2. esbuild installed
try {
  require.resolve('esbuild');
  ok('esbuild installed');
} catch {
  fail('esbuild not installed');
}

// 3. entry exists and explicitly stays out of Sentry's territory (Session Replay,
// Error Tracking). Checked against the readable source, not the minified bundle,
// since the bundle also contains posthog-js's own internal default values for
// these same option names and a text search can't tell them apart.
const entry = path.join(root, 'shared', 'posthog-runtime.entry.js');
if (fs.existsSync(entry)) {
  ok('shared/posthog-runtime.entry.js exists');
  const entrySrc = fs.readFileSync(entry, 'utf8');
  if (!/disable_session_recording:\s*true/.test(entrySrc)) {
    fail('posthog-runtime.entry.js must set disable_session_recording: true — Sentry already owns Session Replay');
  } else {
    ok('session recording stays disabled in source (no duplication with Sentry)');
  }
  if (!/capture_exceptions:\s*false/.test(entrySrc)) {
    fail('posthog-runtime.entry.js must set capture_exceptions: false — Sentry already owns Error Tracking');
  } else {
    ok('exception capture stays disabled in source (no duplication with Sentry)');
  }
} else {
  fail('shared/posthog-runtime.entry.js missing');
}

// 4. bundle exists and valid
const bundle = path.join(root, 'shared', 'posthog-runtime.js');
if (!fs.existsSync(bundle)) {
  fail('shared/posthog-runtime.js missing (run npm run build:posthog)');
} else {
  const stat = fs.statSync(bundle);
  const content = fs.readFileSync(bundle, 'utf8');
  if (stat.size < 5000) fail(`bundle too small: ${stat.size} bytes`);
  else ok(`bundle exists ${stat.size} bytes`);
  if (!content.includes('WorldServerPostHog')) fail('bundle missing WorldServerPostHog');
  else ok('bundle contains WorldServerPostHog');
}

// 5. all apps/**/index.html contain posthog-runtime and not baseline/assets
const appsDir = path.join(root, 'apps');
const apps = fs.readdirSync(appsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
let injected = 0;
for (const app of apps) {
  const idx = path.join(appsDir, app, 'index.html');
  if (!fs.existsSync(idx)) continue;
  const html = fs.readFileSync(idx, 'utf8');
  if (html.includes('/shared/posthog-runtime.js')) {
    ok(`${app}/index.html has posthog-runtime`);
    injected++;
  } else {
    fail(`${app}/index.html missing <script src="/shared/posthog-runtime.js">`);
  }
}
if (injected < 3) fail(`only ${injected} apps injected, expected >=3`);
else ok(`injected ${injected} apps`);

// 6. baseline/assets never modified (same convention as check-sentry-runtime.js)
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(full);
    } else if (ent.name.toLowerCase().includes('baseline') && ent.name.toLowerCase().endsWith('.html')) {
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes('posthog-runtime')) fail(`baseline file ${full} contains posthog-runtime`);
    }
  }
}
walk(appsDir);
ok('baseline files checked');

if (failures.length) {
  console.error(`\n[POSTHOG_CHECK] ${failures.length} failures`);
  process.exit(1);
} else {
  console.log('\n[POSTHOG_CHECK] PASS all static checks');
}
