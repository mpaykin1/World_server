'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { endpoint } = require('../scripts/cas-replication-controller.cjs');

test('CAS replication preserves nested remote function base paths', () => {
  const base = 'https://example.test/functions/v1/world-server-cas-canary';
  assert.equal(
    endpoint(base, 'cas/sha256/' + 'b'.repeat(64)).pathname,
    '/functions/v1/world-server-cas-canary/cas/sha256/' + 'b'.repeat(64),
  );
  assert.equal(
    endpoint(base + '/', '/cas/sha256/' + 'c'.repeat(64)).pathname,
    '/functions/v1/world-server-cas-canary/cas/sha256/' + 'c'.repeat(64),
  );
});