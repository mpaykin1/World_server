'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const lock = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package-lock.json'), 'utf8'));
const packages = lock.packages || {};

const minimums = {
  'node_modules/lighthouse': '13.4.1',
  'node_modules/puppeteer-core': '25.10.0',
  'node_modules/puppeteer-core/node_modules/@puppeteer/browsers': '3.2.2',
  'node_modules/qs': '6.16.0',
  'node_modules/tmp': '0.2.7',
  'node_modules/uuid': '11.1.1',
};

function parts(v) { return String(v).split('.').map((n) => Number(n)); }
function gte(actual, minimum) {
  const a = parts(actual); const b = parts(minimum);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return true;
}
test('security-critical transitive dependencies stay at remediated versions', () => {
  for (const [key, minimum] of Object.entries(minimums)) {
    const entry = packages[key];
    assert.ok(entry && entry.version, `${key} must stay present in package-lock.json`);
    assert.ok(gte(entry.version, minimum), `${key} ${entry.version} regressed below ${minimum}`);
  }
});

test('vulnerable extract-zip is absent from the resolved dependency graph', () => {
  assert.equal(packages['node_modules/extract-zip'], undefined);
});

