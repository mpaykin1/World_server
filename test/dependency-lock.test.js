'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../package.json');
const lock = require('../package-lock.json');
test('exact dependency overrides are reflected in every locked package instance', () => {
  for (const [name, version] of Object.entries(pkg.overrides || {})) {
    if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) continue;
    const entries = Object.entries(lock.packages).filter(([p]) => p.endsWith('node_modules/' + name));
    assert.ok(entries.length > 0, `stale override: ${name}`);
    for (const [p, value] of entries) assert.equal(value.version, version, `${p}: run npm install --package-lock-only, then npm ci`);
  }
});
