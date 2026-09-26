#!/usr/bin/env node
'use strict';
// HTTP evidence only. This is NOT authenticated Fleet POST or browser/device QA.
const BASE_PATHS = ['/api/apps', '/apps/catalog/', '/apps/voxel-world/', '/apps/ai3d-voxel-city/'];
const HOST_ERRORS = ['site not found', 'page not found', '404: not_found',
  'deployment_not_found', 'vercel login', 'not found - request id', 'internal server error'];
const HTML_MARKERS = {
  '/apps/catalog/': ['<title>3D Каталог</title>', 'src="./client.js"'],
  '/apps/voxel-world/': ['<title>Voxel World</title>', 'src="./client.js"'],
  '/apps/ai3d-voxel-city/': ['<title>AI3D Voxel City</title>', 'src="./client.js"']
};
const SHA = /^[a-f0-9]{40}$/i;

function checkResponse(path, response, body, origin) {
  if (!response.ok) return 'HTTP ' + response.status;
  if (response.url && new URL(response.url).origin !== new URL(origin).origin) {
    return 'unexpected cross-origin redirect';
  }
  const lower = body.toLowerCase();
  if (HOST_ERRORS.some(marker => lower.includes(marker))) return 'host/error page marker';
  if (path === '/api/apps') {
    try {
      const json = JSON.parse(body);
      if (!json || typeof json !== 'object') return 'invalid apps JSON shape';
    } catch { return 'apps endpoint returned non-JSON'; }
  } else {
    if (!/<!doctype html/i.test(body)) return 'expected real HTML document';
    if (!HTML_MARKERS[path].every(marker => body.includes(marker))) {
      return 'missing required app title/client bootstrap';
    }
  }
  return null;
}

async function runSmoke(base, {
  fetchImpl = fetch, log = console.log, expectedSha = '',
  identityGate = async (url, sha) => require('./verify-working-link.cjs').cloudflareIdentityGate(url, sha)
} = {}) {
  if (!base) throw new Error('QUALITY_BASE_URL required');
  const origin = new URL(base);
  if (!['https:', 'http:'].includes(origin.protocol)) throw new Error('HTTP(S) origin required');
  const host = origin.origin;
  const failures = [];
  let identity = null;
  if (expectedSha) {
    if (!SHA.test(expectedSha)) failures.push({ path: 'deployment identity', reason: 'invalid expected SHA' });
    else {
      try {
        identity = await identityGate(host, expectedSha);
        if (identity.deployedRevision !== expectedSha) throw new Error('deployed revision mismatch');
      } catch (err) {
        failures.push({ path: 'deployment identity', reason: String(err.message || err) });
      }
    }
  }
  for (const path of BASE_PATHS) {
    const started = Date.now();
    try {
      const response = await fetchImpl(host + path, {
        redirect: 'follow', signal: AbortSignal.timeout(15000)
      });
      const body = await response.text();
      const reason = checkResponse(path, response, body, host);
      if (reason) failures.push({ path, status: response.status, reason });
      else log('[POST_DEPLOY_SMOKE] ' + path + ' ' + response.status + ' ' + (Date.now() - started) + 'ms');
    } catch (err) { failures.push({ path, reason: String(err.message || err) }); }
  }
  try {
    const response = await fetchImpl(host + '/shared/sentry-runtime.js', {
      redirect: 'follow', signal: AbortSignal.timeout(15000)
    });
    const body = await response.text();
    if (!response.ok || (response.url && new URL(response.url).origin !== host) ||
        !body.includes('WorldServerSentry') || !body.includes('ingest.de.sentry.io')) {
      failures.push({ path: '/shared/sentry-runtime.js', reason: 'missing or invalid runtime bundle' });
    } else {
      log('[POST_DEPLOY_SMOKE] /shared/sentry-runtime.js ' + response.status + ' OK');
    }
    const catalog = await fetchImpl(host + '/apps/catalog/', {
      redirect: 'follow', signal: AbortSignal.timeout(15000)
    });
    const catalogBody = await catalog.text();
    if (checkResponse('/apps/catalog/', catalog, catalogBody, host) ||
        !catalogBody.includes('/shared/sentry-runtime.js')) {
      failures.push({ path: '/apps/catalog/ marker', reason: 'missing Sentry marker or invalid catalog' });
    }
  } catch (err) {
    failures.push({ path: 'Sentry integration', reason: String(err.message || err) });
  }
  return { ok: failures.length === 0, identity, failures };
}

async function main() {
  const result = await runSmoke(process.env.QUALITY_BASE_URL, {
    expectedSha: process.env.QUALITY_EXPECTED_SHA || ''
  });
  if (!result.ok) {
    console.error('[POST_DEPLOY_SMOKE] FAIL ' + JSON.stringify(result.failures, null, 2));
    process.exitCode = 20;
    return;
  }
  console.log('[POST_DEPLOY_SMOKE] HTTP' +
    (result.identity ? '_AND_EXACT_SHA' : '') + '_PASS; authenticated Fleet POST and device QA remain separate');
}
if (require.main === module) main().catch(err => {
  console.error('[POST_DEPLOY_SMOKE] FAIL ' + String(err.message || err));
  process.exitCode = 20;
});
module.exports = { HOST_ERRORS, HTML_MARKERS, checkResponse, runSmoke };
