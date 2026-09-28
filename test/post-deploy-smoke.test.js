'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { checkResponse, runSmoke } = require('../scripts/post-deploy-smoke.js');

const origin = 'https://world.example';
const sha = 'a'.repeat(40);
const catalog = '<!doctype html><title>3D Каталог</title><script src="./client.js"></script>' +
  '<script src="/shared/sentry-runtime.js"></script>';
const voxel = '<!doctype html><title>Voxel World</title><script src="./client.js"></script>';
const ai3d = '<!doctype html><title>AI3D Voxel City</title><script src="./client.js"></script>';
const routes = {
  '/api/apps': '{"apps":[]}',
  '/apps/catalog/': catalog,
  '/apps/voxel-world/': voxel,
  '/apps/ai3d-voxel-city/': ai3d,
  '/shared/sentry-runtime.js': 'WorldServerSentry; ingest.de.sentry.io;'
};
function mockFetch(overrides = {}) {
  return async url => {
    const key = new URL(url).pathname;
    const item = Object.hasOwn(overrides, key) ? overrides[key] : routes[key];
    if (item === undefined) throw new Error('Unexpected URL ' + url);
    const output = typeof item === 'string' ? { body: item } : item;
    return {
      ok: (output.status || 200) >= 200 && (output.status || 200) < 300,
      status: output.status || 200,
      url: output.url || url,
      text: async () => output.body
    };
  };
}
const quiet = () => {};
test('complete static smoke passes but never certifies authenticated Fleet POST', async () => {
  const result = await runSmoke(origin, { fetchImpl: mockFetch(), log: quiet });
  assert.equal(result.ok, true);
  assert.equal(result.identity, null);
  assert.deepEqual(result.failures, []);
});
test('200 Site not found HTML fails instead of giving false PASS', async () => {
  const result = await runSmoke(origin, {
    fetchImpl: mockFetch({ '/apps/voxel-world/': '<!doctype html><h1>Site not found</h1>' }),
    log: quiet
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some(x => x.path === '/apps/voxel-world/' && /host\/error/.test(x.reason)));
});
test('200 broken app HTML fails the required bootstrap check', async () => {
  const result = await runSmoke(origin, {
    fetchImpl: mockFetch({ '/apps/catalog/': '<!doctype html><title>3D Каталог</title>' }), log: quiet
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some(x => x.path === '/apps/catalog/' && /bootstrap/.test(x.reason)));
});
test('200 HTML masquerading as /api/apps is rejected', async () => {
  const result = await runSmoke(origin, {
    fetchImpl: mockFetch({ '/api/apps': '<!doctype html><title>Oops</title>' }), log: quiet
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some(x => x.path === '/api/apps' && /non-JSON/.test(x.reason)));
});
test('cross-origin hosting login redirect is rejected even if body is valid', async () => {
  const result = await runSmoke(origin, {
    fetchImpl: mockFetch({ '/apps/voxel-world/': {
      body: voxel, url: 'https://login.example/apps/voxel-world/'
    } }), log: quiet
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some(x => /cross-origin/.test(x.reason)));
});
test('missing Sentry runtime does not pass', async () => {
  const result = await runSmoke(origin, {
    fetchImpl: mockFetch({ '/shared/sentry-runtime.js': 'pretend minified JS' }), log: quiet
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some(x => x.path === '/shared/sentry-runtime.js'));
});
test('exact-SHA mode verifies the canonical deployment identity', async () => {
  const good = await runSmoke(origin, {
    fetchImpl: mockFetch(), log: quiet, expectedSha: sha,
    identityGate: async (url, expected) => {
      assert.equal(url, origin);
      assert.equal(expected, sha);
      return { deployedRevision: sha };
    }
  });
  assert.equal(good.ok, true);
  assert.equal(good.identity.deployedRevision, sha);
  const stale = await runSmoke(origin, {
    fetchImpl: mockFetch(), log: quiet, expectedSha: sha,
    identityGate: async () => ({ deployedRevision: 'b'.repeat(40) })
  });
  assert.equal(stale.ok, false);
  assert.ok(stale.failures.some(x => x.path === 'deployment identity'));
  const invalid = await runSmoke(origin, {
    fetchImpl: mockFetch(), log: quiet, expectedSha: 'unknown',
    identityGate: async () => { throw new Error('must not call gate'); }
  });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.failures.some(x => /invalid expected SHA/.test(x.reason)));
});
test('200 false-ready responses fail even when the expected identity matches', async () => {
  const result = await runSmoke(origin, {
    fetchImpl: mockFetch({ '/apps/voxel-world/': '<h1>DEPLOYMENT_NOT_FOUND</h1>' }),
    log: quiet, expectedSha: sha,
    identityGate: async () => ({ deployedRevision: sha })
  });
  assert.equal(result.ok, false);
});
test('production canary pins post-deploy smoke to the exact deploy SHA', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows',
    'quality-canary.yml'), 'utf8');
  assert.match(workflow, /QUALITY_BASE_URL: \$\{\{ steps\.deploy\.outputs\.url \}\}/);
  assert.match(workflow, /QUALITY_EXPECTED_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /post-deploy-smoke\.js/);
});
test('reject invalid URLs before making requests', async () => {
  await assert.rejects(() => runSmoke('file:///secret', { fetchImpl: mockFetch() }), /HTTP\(S\)/);
});
