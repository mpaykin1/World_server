'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('Netlify preview keeps game and quality telemetry routes alive', () => {
  const game = read('netlify/functions/game.mts');
  const quality = read('netlify/functions/quality-telemetry.mts');
  assert.match(game, /path: '\/api\/game'/);
  assert.match(game, /proxyCanonical\(request, '\/api\/game'\)/);
  assert.match(quality, /path: '\/api\/quality-telemetry'/);
  assert.match(quality, /runLegacy\(request, legacyHandler\)/);
});

test('Sentry Replay is disabled only on Netlify deploy previews', () => {
  const entry = read('shared/sentry-runtime.entry.js');
  assert.match(entry, /isNetlifyDeployPreview/);
  assert.match(entry, /deploy-preview-/);
  assert.match(entry, /if \(!isNetlifyDeployPreview\) integrations\.push\(Sentry\.replayIntegration\(\)\)/);
  assert.match(entry, /browserTracingIntegration\(\)/);
  assert.match(entry, /replaysSessionSampleRate: isNetlifyDeployPreview \? 0 : 0\.05/);
  assert.match(entry, /replaysOnErrorSampleRate: isNetlifyDeployPreview \? 0 : 1\.0/);
});
