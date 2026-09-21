'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'quality-canary.yml'), 'utf8');

test('Cloudflare canary fails closed when deployment authority is unavailable', () => {
  assert.match(workflow, /id: authority[\s\S]*configured=false/);
  assert.match(workflow, /Fail closed when Cloudflare credentials are unavailable/);
  assert.match(workflow, /if: steps\.authority\.outputs\.configured != 'true'/);
  assert.match(workflow, /exit 1/);
});

test('Cloudflare canary exercises exact-SHA deploy, browser, playable and HTTP gates', () => {
  assert.match(workflow, /WORKERS_CI_COMMIT_SHA="\$SOURCE_SHA"/);
  assert.match(workflow, /verify-cloudflare-stack\.cjs[\s\S]*\$SOURCE_SHA/);
  assert.match(workflow, /playwright install --with-deps chromium webkit/);
  assert.match(workflow, /PLAYWRIGHT_BASE_URL: \$\{\{ steps\.deploy\.outputs\.url \}\}/);
  assert.match(workflow, /delivery:verify[\s\S]*--expected-sha="\$SOURCE_SHA"[\s\S]*--game/);
  assert.match(workflow, /QUALITY_BASE_URL: \$\{\{ steps\.deploy\.outputs\.url \}\}/);
  assert.match(workflow, /post-deploy-smoke\.js/);
});