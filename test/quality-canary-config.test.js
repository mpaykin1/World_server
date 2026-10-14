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

// Release gate failed on every master push from 2026-10-07: in a shallow checkout the
// architecture gate has no parent commit and counts every file in the repository as changed.
test('canary checks out full history for the release gate', () => {
  assert.match(workflow, /actions\/checkout@v4\s*\n\s*with:\s*\n\s*fetch-depth: 0/);
});

// Deploy failed from 2026-09-26, when wrangler.jsonc gained a cron trigger: every canary was a
// new worker with that cron, and the Free account has five cron slots (previews strip it too).
test('canary deploys one serialized worker without cron triggers', () => {
  assert.match(workflow, /concurrency:\s*\n\s*group: quality-canary\s*\n\s*cancel-in-progress: false/);
  assert.match(workflow, /x\.triggers=\{crons:\[\]\};fs\.writeFileSync\('\.wrangler-canary\.jsonc'/);
  assert.match(workflow, /--name world-server-canary --config \.wrangler-canary\.jsonc/);
  assert.doesNotMatch(workflow, /world-server-canary-\$\{GITHUB_RUN_ID\}/);
});

test('canary browser failures are readable as check annotations', () => {
  assert.match(workflow, /npx playwright test --reporter=list,github/);
});