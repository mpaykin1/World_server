'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = fs.readFileSync(path.join(__dirname, '../.github/workflows/independent-pr-review.yml'), 'utf8');

test('credentials are only passed to a trusted base checkout', () => {
  assert.match(yaml, /^\s+pull_request_target:/m);
  assert.match(yaml, /ref: \$\{\{ steps\.refs\.outputs\.trusted \}\}/);
  assert.match(yaml, /git\/ref\/heads\/master/);
  assert.match(yaml, /echo "trusted=\$\{TRUSTED\}"/);
  assert.match(yaml, /test "\$BASE_BRANCH" = master/);
  assert.match(yaml, /persist-credentials: false/);
  assert.match(yaml, /WORLD_REVIEW_KEY: \$\{\{ secrets\.WORLD \}\}/);
  assert.doesNotMatch(yaml, /ref: \$\{\{ steps\.refs\.outputs\.head \}\}/);
  assert.doesNotMatch(yaml, /^\s+schedule:/m);
});
test('review binds a PR head SHA and publishes a real required-check candidate', () => {
  assert.match(yaml, /git fetch --no-tags origin/);
  assert.match(yaml, /test "\$\(git rev-parse FETCH_HEAD\)" = "\$EXPECTED_SHA"/);
  assert.match(yaml, /checks: write/);
  assert.match(yaml, /World Independent Adversarial Review/);
  assert.match(yaml, /action_required/);
});

test('Cloudflare fallback stays opt-in and only executes trusted master code', () => {
  assert.match(yaml, /WORLD_CF_WORKERS_FREE_CONFIRMED: \$\{\{ vars\.WORLD_CF_WORKERS_FREE_CONFIRMED \}\}/);
  assert.match(yaml, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.WORLD_CF_AI_API_TOKEN \|\| \(vars\.WORLD_CF_ALLOW_DEPLOY_TOKEN_AI == 'true' && secrets\.CLOUDFLARE_API_TOKEN\) \}\}/);
  assert.match(yaml, /ref: \$\{\{ steps\.refs\.outputs\.trusted \}\}/);
  assert.doesNotMatch(yaml, /ref: \$\{\{ steps\.refs\.outputs\.head \}\}/);
});
