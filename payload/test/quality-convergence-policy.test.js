'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../data/quality-convergence-policy.json');

test('convergence policy forbids false completion', () => {
  assert.equal(policy.safety.blockedIsNotComplete, true);
  assert.equal(policy.safety.neverLowerBaseline, true);
  assert.ok(policy.maxRounds >= 4);
});
