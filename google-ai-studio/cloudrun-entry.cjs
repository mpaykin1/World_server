'use strict';

/**
 * Cloud Run adapter for existing World_server.
 * V6 adds structured Google deployment evidence/learning signals, immutable revision identity, W3C trace context and global community/feedback/i18n readiness while preserving, safe headers, runtime budgets and
 * sandbox-only deterministic fault injection without duplicating app state.
 */

const fs = require('fs');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const { URL } = require('url');
const path = require('path');
const crypto = require('crypto');
const { routeClass: learningRouteClass } = require('../lib/world-google-learning');

const root = path.resolve(__dirname, '..');
const externalPort = Number(process.env.PORT || 8080);
const internalPort = Number(process.env.WORLD_INTERNAL_PORT || (externalPort === 3001 ? 3002 : 3001));
const slot = String(process.env.WORLD_SLOT || 'unconfigured').toLowerCase();
const buildSha = process.env.WORLD_BUILD_SHA || process.env.VERCEL_GIT_COMMIT_SHA || 'unknown';
const startedAt = new Date().toISOString();
const cloudService = process.env.K_SERVICE || 'unknown';
const cloudRevision = process.env.K_REVISION || 'unknown';
const cloudConfiguration = process.env.K_CONFIGURATION || 'unknown';
let firstExternalRequest = true;
const configuredEntrypoint = process.env.WORLD_SLOT_ENTRYPOINT || '';
const remoteUpstream = process.env.WORLD_SLOT_UPSTREAM || '';
const allowRemoteUpstream = process.env.ALLOW_REMOTE_SLOT_UPSTREAM === '1';
const faultFlagRequested = process.env.WORLD_ENABLE_SANDBOX_FAULTS === '1';
const enableSandboxFaults = slot === 'sandbox' && faultFlagRequested;
const maxRssMb = Number(process.env.WORLD_MAX_RSS_MB || 1024);
const maxHeapMb = Number(process.env.WORLD_MAX_HEAP_MB || 768);

if (!['navigator', 'sandbox'].includes(slot)) {
  console.error(`WORLD_SLOT must be "navigator" or "sandbox"; got "${slot}"`);
  process.exit(64);
}
if (remoteUpstream && !allowRemoteUpstream) {
  console.error('WORLD_SLOT_UPSTREAM is set but ALLOW_REMOTE_SLOT_UPSTREAM=1 is not. Refusing hidden proxy deployment.');
  process.exit(65);
}
if (slot === 'navigator' && faultFlagRequested) {
  console.error('Fault injection can never be enabled on navigator.');
  process.exit(66);
}

const defaultEntrypoint = slot === 'navigator'
  ? (process.env.WORLD_NAVIGATOR_ENTRYPOINT || '/apps/catalog/')
  : (process.env.WORLD_SANDBOX_ENTRYPOINT || '/apps/catalog/');
const entrypoint = configuredEntrypoint || defaultEntrypoint;

let childReady = false;
let shuttingDown = false;
let childExit = null;

const child = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(internalPort), WORLD_SLOT_CHILD: '1' },
  stdio: ['ignore', 'inherit', 'inherit']
});
child.once('exit', (code, signal) => {
  childReady = false;
  childExit = { code, signal, at: new Date().toISOString() };
  if (!shuttingDown) console.error('World_server child exited unexpectedly', childExit);
});

function correlationId(req) {
  const incoming = String(req.headers['x-world-correlation-id'] || req.headers['x-request-id'] || '').trim();
  return incoming && incoming.length <= 128 ? incoming : crypto.randomUUID();
}
function traceparent(req) {
  const incoming = String(req.headers.traceparent || '').trim().toLowerCase();
  if (/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/.test(incoming)) return incoming;
  return `00-${crypto.randomBytes(16).toString('hex')}-${crypto.randomBytes(8).toString('hex')}-01`;
}

function googleCloudTrace(req) {
  const project = String(process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '').trim();
  const header = String(req.headers['x-cloud-trace-context'] || '').trim();
  const traceId = header.split('/')[0];
  return project && /^[0-9a-f]{32}$/i.test(traceId) ? `projects/${project}/traces/${traceId}` : '';
}

function securityHeaders(id, trace) {
  return {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-frame-options': 'SAMEORIGIN',
    'permissions-policy': 'camera=(), microphone=(self), geolocation=()',
    'x-world-slot': slot,
    'x-world-build-sha': buildSha,
    'x-world-revision': cloudRevision,
    'x-world-correlation-id': id,
    'traceparent': trace || ''
  };
}
function json(res, status, payload, id, extra = {}, trace = '') {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
    ...securityHeaders(id, trace),
    ...extra
  });
  res.end(body);
}
function text(res, status, body, id, extra = {}, trace = '') {
  const buf = Buffer.from(body);
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': buf.length,
    'cache-control': 'no-store',
    ...securityHeaders(id, trace),
    ...extra
  });
  res.end(buf);
}
function requestLocal(pathname, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port: internalPort, path: pathname, headers: { 'x-world-slot-probe': slot } }, (res) => {
      res.resume();
      res.once('end', () => resolve(res.statusCode || 0));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('probe timeout')));
    req.once('error', reject);
  });
}
async function waitForChild() {
  const deadline = Date.now() + Number(process.env.WORLD_CHILD_READY_TIMEOUT_MS || 20000);
  while (Date.now() < deadline) {
    try {
      const status = await requestLocal(entrypoint, 1200);
      if (status >= 200 && status < 400) { childReady = true; return true; }
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}
// The container's real memory pressure comes from the spawned `server.js`
// child (it does the actual rendering/asset/DB work); this wrapper is a
// thin proxy. Cloud Run's OOM killer acts on total container RSS, so a
// budget that only ever measures the wrapper's own low RSS would silently
// stay "ok" while the child alone approaches the container memory limit.
// /proc/<pid>/status is Linux-only (fine — Cloud Run containers are Linux);
// falls back to null (not 0) on any other platform or if the child already
// exited, so callers can tell "known small" apart from "unmeasured".
function childRssMb() {
  if (!child.pid) return null;
  try {
    const status = fs.readFileSync(`/proc/${child.pid}/status`, 'utf8');
    const match = status.match(/^VmRSS:\s+(\d+)\s*kB/m);
    return match ? Math.round(Number(match[1]) / 1024) : null;
  } catch {
    return null;
  }
}
function runtimeBudget() {
  const memory = process.memoryUsage();
  const wrapperRssMb = Math.round(memory.rss / 1024 / 1024);
  const heapMb = Math.round(memory.heapUsed / 1024 / 1024);
  const childMb = childRssMb();
  const rssMb = wrapperRssMb + (childMb || 0);
  return {
    ok: childMb !== null && rssMb <= maxRssMb && heapMb <= maxHeapMb,
    measurementComplete: childMb !== null,
    rssMb,
    heapMb,
    wrapperRssMb,
    childRssMb: childMb,
    childMemorySource: childMb === null ? 'unavailable' : 'proc',
    limits: { maxRssMb, maxHeapMb }
  };
}
function deploymentMeta() {
  return {
    service: 'world-server-google-ai-studio',
    controllerVersion: 6,
    slot,
    buildSha,
    cloudRun: { service: cloudService, revision: cloudRevision, configuration: cloudConfiguration },
    startedAt,
    uptimeSec: Math.round(process.uptime()),
    entrypoint,
    independent: !remoteUpstream,
    remoteUpstream: remoteUpstream || null,
    childReady,
    childExit,
    sandboxFaultInjection: enableSandboxFaults,
    runtimeBudget: runtimeBudget(),
    runtime: { node: process.version, platform: process.platform, arch: process.arch }
  };
}
function proxyToLocal(req, res, overridePath, id, trace) {
  const headers = { ...req.headers, host: `127.0.0.1:${internalPort}` };
  headers['x-world-slot'] = slot;
  headers['x-world-build-sha'] = buildSha;
  headers['x-world-correlation-id'] = id;
  headers.traceparent = trace;
  const p = http.request({ hostname: '127.0.0.1', port: internalPort, method: req.method, path: overridePath || req.url, headers }, (up) => {
    const outHeaders = { ...up.headers, ...securityHeaders(id, trace) };
    res.writeHead(up.statusCode || 502, outHeaders);
    up.pipe(res);
  });
  p.setTimeout(Number(process.env.WORLD_PROXY_TIMEOUT_MS || 30000), () => p.destroy(new Error('local proxy timeout')));
  p.on('error', (err) => {
    if (!res.headersSent) json(res, 502, { ok: false, error: 'local_upstream_error', message: err.message, slot, correlationId: id }, id);
    else res.destroy(err);
  });
  req.pipe(p);
}
function proxyToRemote(req, res, id, trace) {
  const upstream = new URL(remoteUpstream);
  const target = new URL(req.url || '/', upstream);
  const client = target.protocol === 'https:' ? https : http;
  const headers = { ...req.headers, host: target.host };
  delete headers.cookie;
  headers['x-world-slot-migration-bridge'] = slot;
  headers['x-world-correlation-id'] = id;
  headers.traceparent = trace;
  const p = client.request(target, { method: req.method, headers }, (up) => {
    const outHeaders = { ...up.headers, ...securityHeaders(id, trace), 'x-world-independent': 'false' };
    res.writeHead(up.statusCode || 502, outHeaders);
    up.pipe(res);
  });
  p.setTimeout(30000, () => p.destroy(new Error('remote proxy timeout')));
  p.on('error', (err) => {
    if (!res.headersSent) json(res, 502, { ok: false, error: 'remote_upstream_error', message: err.message, slot, correlationId: id }, id);
    else res.destroy(err);
  });
  req.pipe(p);
}
async function applySandboxFault(url, res, id) {
  if (!enableSandboxFaults || !url.pathname.startsWith('/__test/fault/')) return false;
  const kind = url.pathname.split('/').pop();
  if (kind === 'latency') {
    const ms = Math.max(0, Math.min(5000, Number(url.searchParams.get('ms') || 1000)));
    await new Promise(r => setTimeout(r, ms));
    json(res, 200, { ok: true, fault: 'latency', ms, sandboxOnly: true }, id);
    return true;
  }
  if (kind === '429') { json(res, 429, { ok: false, fault: 'rate-limit', sandboxOnly: true }, id); return true; }
  if (kind === '503') { json(res, 503, { ok: false, fault: 'unavailable', sandboxOnly: true }, id); return true; }
  json(res, 400, { ok: false, error: 'unknown sandbox fault' }, id);
  return true;
}

function attachRuntimeSignal(req,res,id,trace,startedNs,coldStart){
  res.once('finish',()=>{
    const elapsed=Number(process.hrtime.bigint()-startedNs)/1e6,mem=process.memoryUsage();
    const pathname=(()=>{try{return new URL(req.url||'/','http://world.local').pathname}catch{return'/'}})();
    const world_runtime_signal={schemaVersion:'6.0.0',at:new Date().toISOString(),ts:new Date().toISOString(),slot,service:cloudService,revision:cloudRevision,configuration:cloudConfiguration,buildSha,route:learningRouteClass(pathname),method:String(req.method||'GET').slice(0,12),status:res.statusCode||0,latencyMs:Math.round(elapsed*100)/100,rssMb:Math.round(mem.rss/1024/1024),heapMb:Math.round(mem.heapUsed/1024/1024),coldStart,correlationId:id,traceparent:trace};
    const cloudTrace=googleCloudTrace(req);
    const entry={severity:world_runtime_signal.status>=500?'ERROR':'INFO',message:'world-runtime-signal',event:'world_runtime_signal',...world_runtime_signal,world_runtime_signal};
    if(cloudTrace)entry['logging.googleapis.com/trace']=cloudTrace;
    console.log(JSON.stringify(entry));
  });
}

const server = http.createServer(async (req, res) => {
  const id = correlationId(req);
  const trace = traceparent(req);
  const startedNs = process.hrtime.bigint();
  const coldStart = firstExternalRequest; firstExternalRequest = false;
  attachRuntimeSignal(req,res,id,trace,startedNs,coldStart);
  const url = new URL(req.url || '/', 'http://world.local');

  if (await applySandboxFault(url, res, id)) return;
  if (url.pathname === '/healthz') return json(res, childExit ? 503 : 200, { ok: !childExit, correlationId: id, traceparent: trace, ...deploymentMeta() }, id, {}, trace);
  if (url.pathname === '/readyz') {
    try {
      const status = await requestLocal(entrypoint, 3000);
      const ready = !shuttingDown && !childExit && status >= 200 && status < 400;
      childReady = ready;
      return json(res, ready ? 200 : 503, { ok: ready, childStatus: status, correlationId: id, traceparent: trace, ...deploymentMeta() }, id, {}, trace);
    } catch (error) {
      childReady = false;
      return json(res, 503, { ok: false, error: error.message, correlationId: id, traceparent: trace, ...deploymentMeta() }, id, {}, trace);
    }
  }
  if (url.pathname === '/api/deployment-meta') return json(res, 200, { ...deploymentMeta(), traceparent: trace }, id, {}, trace);
  if (url.pathname === '/api/google-learning-meta') return json(res, 200, { schemaVersion:'6.0.0', slot, buildSha, service:cloudService, revision:cloudRevision, configuration:cloudConfiguration, structuredLearningLogs:true, logBodies:false, automaticMutation:false, traceparent:trace }, id, {}, trace);
  if (url.pathname === '/api/runtime-budget') {
    const budget = runtimeBudget();
    return json(res, budget.ok ? 200 : 503, { ...budget, traceparent: trace }, id, {}, trace);
  }
  if (url.pathname === '/api/cross-platform-probe') {
    return json(res, 200, { ok: true, nonce: crypto.randomBytes(8).toString('hex'), now: new Date().toISOString(), correlationId: id, traceparent: trace, ...deploymentMeta(), memory: process.memoryUsage() }, id, {}, trace);
  }

  if (remoteUpstream) return proxyToRemote(req, res, id, trace);
  if (url.pathname === '/' && req.method === 'GET') {
    if (!entrypoint.startsWith('/') || entrypoint.startsWith('//') || /[\\\r\n]/.test(entrypoint) || entrypoint === '/') return text(res, 500, 'Entrypoint must be a local application path.', id);
    // Preserve the document URL so relative scripts, styles and module imports
    // resolve inside the selected world instead of the adapter root.
    res.writeHead(302, { location: entrypoint, 'cache-control': 'no-store', ...securityHeaders(id, trace) });
    return res.end();
  }
  return proxyToLocal(req, res, undefined, id, trace);
});

server.headersTimeout = 65000;
server.requestTimeout = 60000;
server.keepAliveTimeout = 5000;

server.listen(externalPort, '0.0.0.0', async () => {
  console.log(`Google AI Studio slot "${slot}" V6 listening on :${externalPort}; internal World_server :${internalPort}`);
  const ok = await waitForChild();
  if (!ok) console.error('World_server child did not become ready within timeout; /readyz will stay red.');
});

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Shutting down on ${signal}`);
  let httpClosed = false;
  let childStopped = child.exitCode !== null || child.signalCode !== null;
  let finished = false;
  const deadline = setTimeout(() => {
    if (finished) return;
    finished = true;
    // child.killed means a signal was sent, not that the child has exited.
    if (!childStopped) child.kill('SIGKILL');
    server.closeAllConnections();
    process.exit(1);
  }, 8000);
  function finish() {
    if (finished || !httpClosed || !childStopped) return;
    finished = true;
    clearTimeout(deadline);
    process.exit(0);
  }
  child.once('exit', () => { childStopped = true; finish(); });
  server.close(() => {
    httpClosed = true;
    finish();
  });
  if (!childStopped) child.kill('SIGTERM');
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
