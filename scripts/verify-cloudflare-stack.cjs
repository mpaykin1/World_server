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
    body: JSON.stringify({ action: 'init', guestId, name: 'Fleet Guest', worldId: 'main' })
  });
  if (!init.response.ok || init.response.headers.get('x-world-server-voxel-runtime') !== 'supabase-edge' ||
      init.body?.world?.id !== 'main' || !Number.isSafeInteger(Number(init.body?.world?.seed)) ||
      !init.body?.world?.settings || init.body?.player?.id !== guestId) {
    throw new Error(`/api/voxel authoritative init failed: HTTP ${init.response.status}`);
  }
  results.push({ pathname: '/api/voxel action=init', status: init.response.status });
  const saved = await request(origin, '/api/voxel', {
    method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({action:'player_save',guestId,worldId:'main',
      position:{x:1,y:43,z:1},yaw:0.2,pitch:0.1,selectedBlock:1})
  });
  if(!saved.response.ok || saved.body?.ok !== true)throw new Error('/api/voxel player save did not persist');
  const reloaded = await request(origin, '/api/voxel', {
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({action:'init',guestId,worldId:'main'})
  });
  if(!reloaded.response.ok || Math.abs(Number(reloaded.body?.player?.position?.x)-1)>0.01 ||
      Math.abs(Number(reloaded.body?.player?.position?.z)-1)>0.01) {
    throw new Error('/api/voxel player position was not durably restored');
  }
  results.push({ pathname:'/api/voxel player_save+reconnect',status:200 });
  const chunkResult=await request(origin,'/api/voxel',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({action:'chunks',guestId,worldId:'main',chunks:[{x:0,z:0}]})
  });
  if(!chunkResult.response.ok || !Array.isArray(chunkResult.body?.blocks) ||
      chunkResult.response.headers.get('x-world-server-voxel-runtime')!=='supabase-edge') {
    throw new Error(`/api/voxel authoritative chunk read failed: HTTP ${chunkResult.response.status}`);
  }
  results.push({pathname:'/api/voxel action=chunks',status:200});
  const snapshot = await request(origin, '/api/emergence', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'macro_read', guestId, worldId: 'main' })
  });
  const emergence = snapshot.body?.emergence;
  if (!snapshot.response.ok || snapshot.response.headers.get('x-world-server-emergence-runtime') !== 'supabase-edge' ||
      snapshot.body?.worldId !== 'main' ||
      emergence?.schemaVersion !== '1.0.0' ||
      !Number.isSafeInteger(emergence.revision) || emergence.revision < 1) {
    throw new Error(`/api/emergence authoritative macro_read failed: HTTP ${snapshot.response.status}`);
  }
  results.push({ pathname: '/api/emergence action=macro_read', status: snapshot.response.status });
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
