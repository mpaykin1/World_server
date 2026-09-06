'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'quality-canary.yml'), 'utf8');

test('missing Vercel credentials do not create a false-red source CI failure', () => {
  assert.match(workflow, /id: config[\s\S]*configured=false/);
  assert.doesNotMatch(workflow, /name: Require Vercel configuration/);
  assert.match(workflow, /configured: \$\{\{ steps\.config\.outputs\.configured \}\}/);
});

test('all deploy and promotion gates remain conditional on verified configuration', () => {
  const gatedSteps = (workflow.match(/if: steps\.config\.outputs\.configured == 'true'/g) || []).length;
  assert.equal(gatedSteps, 6);
  assert.match(workflow, /if: needs\.canary\.outputs\.configured == 'true'/);
});
