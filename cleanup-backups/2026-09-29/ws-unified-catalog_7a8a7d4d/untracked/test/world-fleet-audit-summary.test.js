'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'world-fleet-audit.js'), 'utf8');

test('fleet audit cannot report batch ready before all requested worlds finish', () => {
  assert.match(source, /auditComplete:rows\.length===worlds\.length/);
  assert.match(source, /currentBatchReady:rows\.length===worlds\.length&&localRows\.length>0&&localRows\.every/);
});
