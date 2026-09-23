'use strict';

// A deployed Worker can become reachable before its static asset binding does.
// Fail closed unless all public entrypoints AND the exact Git revision are live.
const PATHS = ['/', '/apps/catalog/', '/apps/voxel-world/'];
const SHA = /^[0-9a-f]{40}$/i;

async function probeCloudflareReadiness(origin, expectedSha, fetchImpl = fetch) {
  for (const pathname of PATHS) {
    const response = await fetchImpl(new URL(pathname, origin), {
      redirect: 'follow',
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      throw new Error(pathname + ': HTTP ' + response.status + '; final URL ' + (response.url || 'unknown'));
    }
    const body = await response.text();
    if (body.length < 120) throw new Error(pathname + ': unexpectedly short response (' + body.length + ' bytes)');
  }
  const response = await fetchImpl(new URL('/api/config', origin), {
    redirect: 'follow',
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('/api/config: HTTP ' + response.status);
  const config = await response.json();
  if (config.configured !== true || config.deploymentProvider !== 'cloudflare') {
    throw new Error('/api/config: Cloudflare deployment is not configured');
  }
  if (config.deployedRevision !== expectedSha) {
    throw new Error('/api/config: expected ' + expectedSha + ', got ' + (config.deployedRevision || 'missing'));
  }
  return { deployedRevision: config.deployedRevision, checkedPaths: [...PATHS, '/api/config'] };
}

async function waitForCloudflareReadiness(origin, expectedSha, options = {}) {
  if (!origin || !SHA.test(expectedSha || '')) throw new Error('Expected Cloudflare origin and exact 40-character SHA');
  const {
    probe = probeCloudflareReadiness,
    timeoutMs = 120000,
    intervalMs = 4000,
    now = Date.now,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    log = message => console.error(message)
  } = options;
  const started = now();
  let attempts = 0;
  for (;;) {
    attempts += 1;
    try {
      const result = await probe(origin, expectedSha);
      log('[CLOUDFLARE_READY] READY after ' + attempts + ' probe(s); SHA ' + result.deployedRevision);
      return { ...result, attempts };
    } catch (error) {
      const remaining = timeoutMs - (now() - started);
      if (remaining <= 0) {
        throw new Error('Timed out after ' + attempts + ' probe(s); last error: ' + error.message);
      }
      log('[CLOUDFLARE_READY] probe ' + attempts + ': ' + error.message + '; retrying (' + Math.ceil(remaining / 1000) + 's remain)');
      await sleep(Math.min(intervalMs, remaining));
    }
  }
}

async function main() {
  const [origin, expectedSha] = process.argv.slice(2);
  const ready = await waitForCloudflareReadiness(origin, expectedSha);
  console.log(JSON.stringify({ ok: true, origin, ...ready }));
}

if (require.main === module) {
  main().catch(error => { console.error('[CLOUDFLARE_READY] FAIL ' + error.message); process.exitCode = 1; });
}
module.exports = { probeCloudflareReadiness, waitForCloudflareReadiness };
