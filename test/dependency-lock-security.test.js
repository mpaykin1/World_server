'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../package.json');
const lock = require('../package-lock.json');

function locked(name) { return lock.packages?.[`node_modules/${name}`]?.version || null; }

test('security overrides are materialized in package-lock', () => {
  for (const name of ['lighthouse', 'qs', 'tmp', 'uuid']) {
    assert.equal(locked(name), pkg.overrides[name], `${name} lock drifted from package.json override`);
  }
  assert.equal(locked('@puppeteer/browsers'), null, 'obsolete Puppeteer browser downloader must stay out of lock');
  assert.equal(locked('extract-zip'), null, 'vulnerable extract-zip must stay out of lock');
  assert.equal(locked('@neondatabase/serverless'), '0.10.4');
});
