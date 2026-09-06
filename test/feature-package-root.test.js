'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const registry = require('../lib/world-function-registry');
const env = require('../lib/env');
const auth = require('../lib/world-api-auth');
function response() {
  return { statusCode: 200, setHeader() {}, end(body) { this.body = JSON.parse(body); } };
}
test('moved feature handlers still resolve bundled packages at repository root', async t => {
  const expected = path.resolve(__dirname, '..');
  const roots = [];
  t.mock.method(env, 'createAdminClient', () => ({ from: () => ({ select: () => ({
    then: resolve => resolve({ data: [] }),
    eq: () => ({ eq: async () => ({ data: [{ world_id: '*', rollout_percent: 100 }] }) })
  }) }) }));
  t.mock.method(auth, 'requireUser', async () => ({ id: 'fixture-user' }));
  t.mock.method(registry, 'discover', root => { roots.push(root); return []; });
  t.mock.method(registry, 'loadHandler', (root, id) => {
    roots.push(root);
    assert.equal(id, 'fixture-function');
    return { pkg: { manifest: { capabilities: [], version: '1.0.0' } }, run: async () => ({ fixture: true }) };
  });
  const catalog = require('../lib/api-handlers/function-catalog');
  const invoke = require('../lib/api-handlers/function-invoke');
  const a = response(), b = response();
  await catalog({ method: 'GET' }, a);
  await invoke({ method: 'POST', body: { functionId: 'fixture-function' } }, b);
  assert.equal(a.statusCode, 200);
  assert.equal(b.statusCode, 200);
  assert.deepEqual(b.body.result, { fixture: true });
  assert.deepEqual(roots, [expected, expected]);
});
