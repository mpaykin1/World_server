'use strict';

const crypto = require('node:crypto');

async function request(origin, pathname, options = {}) {
  const response = await fetch(new URL(pathname, origin), { redirect: 'follow', signal: AbortSignal.timeout(30000), ...options });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch {}
  return { response, text, body };
}

async function verifyCloudflareStack(origin, expectedSha) {
  const results = [];
  for (const pathname of ['/', '/apps/catalog/', '/apps/voxel-world/']) {
    const { response, text } = await request(origin, pathname);
    if (!response.ok || text.length < 120) throw new Error(`${pathname} failed: HTTP ${response.status}`);
    results.push({ pathname, status: response.status });
  }
  for (const pathname of ['/api/apps?all=1', '/api/worlds', '/api/world-factory?limit=1', '/api/canon?limit=1']) {
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
module.exports = { request, verifyCloudflareStack };
