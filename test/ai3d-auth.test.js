'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { issueAi3dToken, verifyAi3dToken } = require('../lib/ai3d-auth');

const secret = 'test-secret-that-is-definitely-long-enough';

test('AI3D token roundtrip succeeds', () => {
  const issued = issueAi3dToken({ secret, ttlSeconds: 120, subject: 'test' });
  const payload = verifyAi3dToken(issued.token, secret, issued.payload.iat + 1);
  assert.equal(payload.sub, 'test');
  assert.equal(payload.v, 1);
});

test('AI3D token rejects tampering and expiry', () => {
  const issued = issueAi3dToken({ secret, ttlSeconds: 60 });
  assert.equal(verifyAi3dToken(`${issued.token}x`, secret, issued.payload.iat), null);
  assert.equal(verifyAi3dToken(issued.token, secret, issued.payload.exp + 1), null);
});
