'use strict';
const REF = 'xlcdnlsyvxqtopmkweiy';
const ORIGIN = 'https://' + REF + '.supabase.co';
const TIMEOUT_MS = 10000;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;

function config(env = process.env) {
  const explicitUrl = Object.hasOwn(env, 'WS_TARGET_SUPABASE_URL');
  const explicitKey = Object.hasOwn(env, 'WS_TARGET_SUPABASE_SECRET_KEY');
  if (explicitUrl !== explicitKey) throw Error('Incomplete explicit target configuration; target variables must be a pair');
  const urlValue = explicitUrl ? env.WS_TARGET_SUPABASE_URL : env.SUPABASE_URL;
  const keyValue = explicitKey ? env.WS_TARGET_SUPABASE_SECRET_KEY : env.SUPABASE_SECRET_KEY;
  if (!text(urlValue) || !text(keyValue)) throw Error('Missing target configuration');
  const rawUrl = urlValue.trim();
  // Validate the original string too: URL normalisation must not hide a path or credentials.
  if (!new RegExp('^https://' + REF + '\\.supabase\\.co(?::443)?/?$').test(rawUrl)) {
    throw Error('Unexpected target project URL');
  }
  const parsed = new URL(rawUrl);
  if (parsed.origin !== ORIGIN || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw Error('Unexpected target project URL');
  }
  const key = keyValue.trim();
  // This probe intentionally accepts modern backend secrets only, never browser/legacy keys.
  if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(key)) throw Error('Expected sb_secret format');
  return { url: ORIGIN, key };
}

function openApiVersion(payload) {
  if (!object(payload) || !object(payload.info) || !text(payload.info.title) || !text(payload.info.version) ||
    !object(payload.paths) || !Object.keys(payload.paths).length) return null;
  const version = payload.swagger === '2.0' ? '2.0' :
    typeof payload.openapi === 'string' && /^3\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(payload.openapi) ? payload.openapi : null;
  if (!version) return null;
  const methods = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);
  for (const [path, item] of Object.entries(payload.paths)) {
    if (!path.startsWith('/') || !object(item)) return null;
    const operations = Object.entries(item).filter(([key]) => methods.has(key));
    if (!operations.length || operations.some(([, op]) => !object(op) ||
      !object(op.responses) || !Object.keys(op.responses).length)) return null;
  }
  return version;
}

function documentTargetsExpectedProject(payload) {
  try {
    if (Object.hasOwn(payload, 'host') &&
      (!text(payload.host) || new URL('https://' + payload.host).origin !== ORIGIN)) return false;
    if (Object.hasOwn(payload, 'servers')) {
      if (!Array.isArray(payload.servers)) return false;
      for (const server of payload.servers) {
        if (!text(server?.url) || new URL(server.url, ORIGIN).origin !== ORIGIN) return false;
      }
    }
    return true;
  } catch { return false; }
}

async function probe(env = process.env, request = globalThis.fetch) {
  const { url, key } = config(env);
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const response = await request(url + '/rest/v1/', { method: 'GET', redirect: 'error', signal,
      headers: { apikey: key, Accept: 'application/openapi+json' } });
    if (!response?.ok || response.status !== 200) return { ok: false,
      status: Number.isInteger(response?.status) ? response.status : null, reason: 'http_error' };
    let payload;
    try { payload = await response.json(); }
    catch { return { ok: false, reason: signal.aborted ? 'request_timeout' : 'invalid_json' }; }
    const version = openApiVersion(payload);
    if (!version) return { ok: false, status: response.status, reason: 'invalid_openapi' };
    if (!documentTargetsExpectedProject(payload)) return { ok: false, status: response.status,
      reason: 'unexpected_openapi_origin' };
    return { ok: true, status: response.status, project_ref: REF,
      verification_scope: 'TARGET_REST_SCHEMA_READ_ONLY', openapi_version: version,
      rest_paths: Object.keys(payload.paths).length };
  } catch {
    // Fetch/JSON errors can include request details; never log their messages or response bodies.
    return { ok: false, reason: signal.aborted ? 'request_timeout' : 'request_failed' };
  }
}

if (require.main === module) probe().then(result => {
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}).catch(() => { console.error('TARGET_PROBE_BLOCKED: invalid target configuration'); process.exitCode = 1; });
module.exports = { config, probe };
