'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = fs.readFileSync(path.join(__dirname, '../.github/workflows/independent-pr-review.yml'), 'utf8');

// Owner retired the mandatory two-model gate on 2026-10-15.
// Guard against accidentally re-enabling privileged PR-triggered review.
test('retired independent review has no automatic or privileged PR trigger', () => {
  assert.match(yaml, /name: Independent PR Review \(retired\)/);
  assert.doesNotMatch(yaml, /^\s+pull_request_target:/m);
  assert.doesNotMatch(yaml, /^\s+pull_request:/m);
  assert.doesNotMatch(yaml, /^\s+schedule:/m);
  assert.doesNotMatch(yaml, /checks:\s*write/);
  assert.doesNotMatch(yaml, /WORLD_REVIEW_KEY|secrets\.WORLD|WORLD_CF_AI_API_TOKEN/);
});

test('retired workflow cannot execute review or publish a misleading passing check', () => {
  assert.match(yaml, /^\s+retired:\s*$/m);
  assert.match(yaml, /^\s+if:\s*false\s*$/m);
  assert.doesNotMatch(yaml, /git fetch --no-tags origin/);
  assert.doesNotMatch(yaml, /gh api -X POST.*check-runs/);
  assert.doesNotMatch(yaml, /scripts\/independent-review-gate\.cjs/);
  assert.doesNotMatch(yaml, /World Independent Adversarial Review/);
});

test('manual retirement marker never requests paid AI resources or executes PR code', () => {
  assert.match(yaml, /^\s+workflow_dispatch:/m);
  assert.doesNotMatch(yaml, /cloudflare|CLOUDFLARE|WORLD_CF_WORKERS_FREE_CONFIRMED/i);
  assert.doesNotMatch(yaml, /actions\/checkout|node scripts\//);
});
