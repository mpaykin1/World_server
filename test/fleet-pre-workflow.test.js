'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = fs.readFileSync(path.join(__dirname,
  '../.github/workflows/fleet-pre-exact-sha.yml'),'utf8');

test('Ocean eligibility requires a non-draft PR at the exact candidate SHA',()=>{
  assert.match(yaml,/pull-requests: read/);
  assert.match(yaml,/PR_NUMBER: \$\{\{ github\.event\.pull_request\.number \}\}/);
  assert.match(yaml,/test -n "\$PR_NUMBER"/);
  assert.match(yaml,/\.draft, \.head\.sha/);
  assert.match(yaml,/test "\$DRAFT" = false/);
  assert.match(yaml,/test "\$PR_HEAD" = "\$EXPECTED"/);
});

test('Ocean eligibility requires a successful independent review on exact head',()=>{
  assert.match(yaml,/World Independent Adversarial Review/);
  assert.match(yaml,/check-runs/);
  assert.match(yaml,/\.status == "completed"/);
  assert.match(yaml,/\.conclusion == "success"/);
  assert.match(yaml,/test "\$APPROVED" = true/);
  assert(yaml.indexOf('test "$APPROVED" = true')<
    yaml.indexOf('READY_FOR_OCEAN=YES'));
});
