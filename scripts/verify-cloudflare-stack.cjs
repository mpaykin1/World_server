'use strict';

const crypto = require('node:crypto');

async function request(origin, pathname, options = {}) {
  const response = await fetch(new URL(pathname, origin), { redirect: 'follow', signal: AbortSignal.timeout(30000), ...options });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch {}
  return { response, text, body };
}

// Workers routes and global assets can lag a successful Wrangler deployment.
// Retry ONLY transient, initial readiness failures; never mask a broken app
// route or access-control failure as a propagation delay.
async function awaitDeploymentReadiness(origin, expectedSha, {
  requestFn = request, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  attempts = 20, delayMs = 4000
} = {}) {
  for (let index = 0; index < attempts; index++) {
    const home = await requestFn(origin, '/');
    if (home.response.ok && home.text.length >= 120) {
      const config = await requestFn(origin, '/api/config');
      if (config.response.ok && config.body?.deployedRevision === expectedSha) return index + 1;
      if (config.response.ok && config.body?.deployedRevision !== expectedSha) {
        // A previously deployed revision is still propagating globally.
      } else if (![404, 502, 503, 504].includes(config.response.status)) {
        throw new Error('/api/config readiness failed: HTTP ' + config.response.status);
      }
    } else if (![404, 502, 503, 504].includes(home.response.status)) {
      throw new Error('/ readiness failed: HTTP ' + home.response.status);
    }
    if (index < attempts - 1) await sleep(delayMs);
  }
  throw new Error('Cloudflare deployment did not propagate expected SHA within readiness deadline');
}

async function verifyCloudflareStack(origin, expectedSha, options = {}) {
  await awaitDeploymentReadiness(origin, expectedSha, options);
  const results = [];
  for (const pathname of ['/', '/apps/catalog/', '/apps/voxel-world/']) {
    const { response, text } = await request(origin, pathname);
    if (!response.ok || text.length < 120) throw new Error(`${pathname} failed: HTTP ${response.status}`);
    results.push({ pathname, status: response.status });
  }
  for (const pathname of ['/api/apps?all=1', '/api/worlds', '/api/world-factory?limit=1', '/api/canon?worldId=voxel-world&limit=1']) {
    const { response, body } = await request(origin, pathname);
    if (!response.ok || !body) throw new Error(`${pathname} failed: HTTP ${response.status}`);
    results.push({ pathname, status: response.status });
  }
  const config = await request(origin, '/api/config');
  if (!config.response.ok || config.body?.configured !== true) throw new Error('/api/config is not configured');
  if (config.body?.deploymentProvider !== 'cloudflare' || config.body?.deployedRevision !== expectedSha) {
    throw new Error(`/api/config revision mismatch: ${config.body?.deployedRevision || 'missing'}`);
  }
  const guestId = crypto.randomUUID();
  const init = await request(origin, '/api/voxel', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'init', guestId, name: 'Fleet Guest', worldId: 'voxel-world' })
  });
  if (!init.response.ok || !init.body?.world || !init.body?.player) throw new Error(`/api/voxel guest init failed: HTTP ${init.response.status}`);
  results.push({ pathname: '/api/voxel action=init', status: init.response.status });
  for (const pathname of ['/api/world-factory', '/api/canon']) {
    const denied = await request(origin, pathname, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (denied.response.status !== 401) throw new Error(`${pathname} unauthenticated write returned ${denied.response.status}, expected 401`);
    results.push({ pathname: `${pathname} unauthenticated write`, status: 401 });
  }
  return results;
}

async function main() {
  const origin = process.argv[2];
  const expectedSha = process.argv[3] || process.env.GITHUB_SHA;
  if (!origin || !expectedSha) throw new Error('usage: node scripts/verify-cloudflare-stack.cjs <origin> <expected-sha>');
  const results = await verifyCloudflareStack(origin, expectedSha);
  console.log(JSON.stringify({ ok: true, origin, expectedSha, results }, null, 2));
}

if (require.main === module) main().catch(error => { console.error(`[CLOUDFLARE_STACK] FAIL ${error.message}`); process.exit(1); });
module.exports = { request, awaitDeploymentReadiness, verifyCloudflareStack };
