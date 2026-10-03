'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanupDurableCanonState } = require('../lib/durable-canon-cleanup');

test('auth user cleanup still runs when bounded canon purge fails', async () => {
  const deleted = [];
  const admin = {
    rpc: async () => ({ error: { message: 'purge blocked' } }),
    from: () => { throw new Error('profile lookup should not run'); },
    auth: { admin: { deleteUser: async id => { deleted.push(id); return { error: null }; } } }
  };
  const result = await cleanupDurableCanonState(admin, {
    sourceEventKey: 'a'.repeat(64), userId: 'user-1', username: 'fleetcanon_deadbeef00'
  });
  assert.deepEqual(deleted, ['user-1']);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /canon cleanup failed/);
});

test('cleanup collects independent canon and auth failures without short-circuiting', async () => {
  let deleteAttempted = false;
  const admin = {
    rpc: async () => { throw new Error('rpc unavailable'); },
    from: () => { throw new Error('profile lookup should not run'); },
    auth: { admin: { deleteUser: async () => {
      deleteAttempted = true;
      return { error: { message: 'auth cleanup blocked' } };
    } } }
  };
  const result = await cleanupDurableCanonState(admin, {
    sourceEventKey: 'b'.repeat(64), userId: 'user-2', username: 'fleetcanon_deadbeef01'
  });
  assert.equal(deleteAttempted, true);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0].message, /rpc unavailable/);
  assert.match(result.errors[1].message, /auth cleanup blocked/);
});
