'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../package.json');

test('dependency security overrides pin audited non-vulnerable toolchain versions', () => {
  const o = pkg.overrides || {};
  assert.equal(o.tmp, '0.2.7');
  assert.equal(o.uuid, '11.1.1');
  assert.equal(o.qs, '6.16.0');
  assert.equal(o.lighthouse, '13.4.1');
  assert.equal(o['puppeteer-core'], '25.10.0');
  assert.equal(o['@puppeteer/browsers'], '3.2.2');
});
