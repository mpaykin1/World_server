'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = fs.readFileSync(path.join(__dirname, '../.github/workflows/independent-pr-review.yml'), 'utf8');

test('credentials are only passed to a trusted base checkout', () => {
  assert.match(yaml, /^\s+pull_request_target:/m);
  assert.match(yaml, /ref: master/);
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
