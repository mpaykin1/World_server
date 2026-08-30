#!/usr/bin/env node
'use strict';

/**
 * WORLD_SERVER V7.5 Autonomous Blocker Repair V1
 *
 * Production invariants:
 * - reuse existing World_server bootstrap / gates / long-soak;
 * - no SYSTEM_INTEGRATION_SKIP_FULL_VERIFY;
 * - no sudo and no unverified downloads;
 * - no fake device / soak / remote evidence;
 * - deterministic repairs only; code changes are delegated to Desktop AI with exact evidence;
 * - durable timers survive process restarts through state.json;
 * - one repair tick is idempotent and lock protected.
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

const VERSION = '1.0.0';
const MANAGED_BEGIN = '# WORLD_SERVER_BLOCKER_REPAIR_V1_BEGIN';
const MANAGED_END = '# WORLD_SERVER_BLOCKER_REPAIR_V1_END';

function nowIso() { return new Date().toISOString(); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function safeJson(p, fallback = null) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function atomicJson(p, value) {
  ensureDir(path.dirname(p));
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, p);
}
function appendJsonl(p, value) {
  ensureDir(path.dirname(p));
  fs.appendFileSync(p, JSON.stringify(value) + '\n', 'utf8');
}
function sha256File(p) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(p));
  return h.digest('hex');
}
function commandExists(cmd) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
    encoding: 'utf8', windowsHide: true, timeout: 15000
  });
  return r.status === 0;
}
function run(cmd, args = [], opts = {}) {
  const startedAt = nowIso();
  const env = { ...process.env, ...(opts.env || {}) };
  for (const key of (opts.unsetEnv || [])) delete env[key];
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd,
    env,
    encoding: 'utf8',
    windowsHide: true,
    timeout: opts.timeoutMs || 20 * 60 * 1000,
    shell: Boolean(opts.shell),
    maxBuffer: opts.maxBuffer || 10 * 1024 * 1024
  });
  return {
    cmd: [cmd, ...args].join(' '),
    startedAt,
    finishedAt: nowIso(),
    code: typeof r.status === 'number' ? r.status : -1,
    signal: r.signal || null,
    stdout: String(r.stdout || ''),
    stderr: String(r.stderr || ''),
    error: r.error ? String(r.error.message || r.error) : null,
    ok: r.status === 0
  };
}
function tailText(s, lines = 120) {
  const a = String(s || '').split(/\r?\n/);
  return a.slice(Math.max(0, a.length - lines)).join('\n').trim();
}
function redact(s) {
  return String(s || '')
    .replace(/(authorization:\s*bearer\s+)[^\s]+/ig, '$1<REDACTED>')
    .replace(/([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|KEY)[A-Z0-9_]*=)[^\s]+/ig, '$1<REDACTED>');
}
function looksTransientFailure(text) {
  return /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|network|temporary failure|rate limit|HTTP\s+(?:408|425|429|5\d\d)\b/i.test(String(text || ''));
}
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v.startsWith('--')) {
      const k = v.slice(2);
      const n = argv[i + 1];
      if (n != null && !n.startsWith('--')) { out[k] = n; i++; }
      else out[k] = true;
    } else out._.push(v);
  }
  return out;
}
function discoverRoot(explicit) {
  if (explicit) return path.resolve(explicit);
  const git = run('git', ['rev-parse', '--show-toplevel'], { cwd: process.cwd(), timeoutMs: 15000 });
  if (git.ok && git.stdout.trim()) return path.resolve(git.stdout.trim());
  return process.cwd();
}
function loadPolicy(root) {
  const p = path.join(root, 'data', 'blocker-repair-policy.json');
  const policy = safeJson(p);
  if (!policy) throw new Error(`Missing policy: ${p}`);
  return policy;
}
function statePaths(root) {
  const dir = path.join(root, 'state', 'blocker-repair');
  return {
    dir,
    state: path.join(dir, 'state.json'),
    events: path.join(dir, 'events.jsonl'),
    gates: path.join(dir, 'latest-gates.json'),
    evidence: path.join(dir, 'platform-evidence.json'),
    devices: path.join(dir, 'device-evidence.json'),
    ai: path.join(dir, 'DESKTOP_AI_NEXT_ACTION.md'),
    lock: path.join(dir, 'repair.lock'),
    soakLog: path.join(dir, 'long-soak.log'),
    schedulerCmd: path.join(dir, 'blocker-repair-tick.cmd'),
    schedulerSh: path.join(dir, 'blocker-repair-tick.sh')
  };
}
function defaultState() {
  return {
    version: VERSION,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    cycle: 0,
    nextRunAt: null,
    lastRunAt: null,
    scheduler: {},
    longSoak: {},
    blockers: {},
    gates: {},
    mergeSafe: false
  };
}
function loadState(root) {
  const p = statePaths(root).state;
  return { ...defaultState(), ...(safeJson(p, {}) || {}) };
}
function saveState(root, state) {
  state.updatedAt = nowIso();
  atomicJson(statePaths(root).state, state);
}
function event(root, type, data = {}) {
  appendJsonl(statePaths(root).events, { at: nowIso(), type, ...data });
}
function acquireLock(root, staleMs) {
  const p = statePaths(root).lock;
  ensureDir(path.dirname(p));
  try {
    const fd = fs.openSync(p, 'wx');
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, host: os.hostname(), at: nowIso() }));
    fs.closeSync(fd);
    return () => { try { fs.unlinkSync(p); } catch {} };
  } catch (e) {
    const st = safeJson(p, {});
    const age = st.at ? Date.now() - Date.parse(st.at) : Infinity;
    if (age > staleMs) {
      try { fs.unlinkSync(p); } catch {}
      return acquireLock(root, staleMs);
    }
    throw new Error(`Repair lock is active: ${p} pid=${st.pid || '?'} ageMs=${Math.round(age)}`);
  }
}
function setBlocker(state, id, status, detail = {}) {
  const prev = state.blockers[id] || {};
  state.blockers[id] = {
    ...prev,
    id,
    status,
    updatedAt: nowIso(),
    firstSeenAt: prev.firstSeenAt || nowIso(),
    attempts: (prev.attempts || 0) + (detail.attempted ? 1 : 0),
    ...detail
  };
}
function earliestTimer(state) {
  const times = Object.values(state.blockers || {})
    .map(x => x && x.nextRunAt ? Date.parse(x.nextRunAt) : NaN)
    .filter(Number.isFinite);
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
}
function timerAfterMinutes(minutes) {
  return new Date(Date.now() + Math.max(1, Number(minutes || 15)) * 60000).toISOString();
}
function due(blocker) {
  if (!blocker || !blocker.nextRunAt) return true;
  return Date.parse(blocker.nextRunAt) <= Date.now();
}
function writeAiAction(root, title, sections) {
  const p = statePaths(root).ai;
  const body = [
    '# Desktop AI — autonomous blocker repair action',
    '',
    `Generated: ${nowIso()}`,
    `Repair engine: ${VERSION}`,
    '',
    `## ${title}`,
    '',
    ...sections,
    '',
    '## Mandatory repair loop',
    '',
    '1. Diagnose the ROOT CAUSE from the evidence above.',
    '2. Reuse existing World_server systems before creating anything new.',
    '3. Apply the smallest production-safe fix; never use fake PASS, SKIP_FULL_VERIFY, stubs, or fabricated evidence.',
    '4. Add or strengthen a regression test for the root cause.',
    '5. Run `npm run blockers:tick`.',
    '6. If `state/blocker-repair/DESKTOP_AI_NEXT_ACTION.md` is regenerated, continue fixing.',
    '7. Stop only when the engine reports no `requires_ai` blockers; real external blockers may remain honestly WAITING/EXTERNAL.',
    ''
  ].join('\n');
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, body, 'utf8');
  return p;
}
function clearAiAction(root) {
  const p = statePaths(root).ai;
  try { fs.unlinkSync(p); } catch {}
}

function httpsJson(url, timeoutMs = 30000, redirects = 5) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(u, {
      headers: { 'User-Agent': 'WorldServer-BlockerRepair/1.0', 'Accept': 'application/vnd.github+json' },
      timeout: timeoutMs
    }, res => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(httpsJson(new URL(res.headers.location, u).toString(), timeoutMs, redirects - 1));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', d => { data += d; if (data.length > 5 * 1024 * 1024) req.destroy(new Error('response too large')); });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`HTTP ${res.statusCode}: ${url}`));
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`timeout: ${url}`)));
    req.on('error', reject);
  });
}
function downloadFile(url, dest, allowedHosts, timeoutMs = 120000, redirects = 5) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    if (u.protocol !== 'https:') return reject(new Error(`Only HTTPS downloads are allowed: ${u}`));
    if (!allowedHosts.includes(u.hostname)) return reject(new Error(`Download host is not allowlisted: ${u.hostname}`));
    ensureDir(path.dirname(dest));
    const tmp = `${dest}.${process.pid}.tmp`;
    const req = https.get(u, { headers: { 'User-Agent': 'WorldServer-BlockerRepair/1.0' }, timeout: timeoutMs }, res => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume();
        try { fs.unlinkSync(tmp); } catch {}
        return resolve(downloadFile(new URL(res.headers.location, u).toString(), dest, allowedHosts, timeoutMs, redirects - 1));
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}: ${url}`));
      }
      const out = fs.createWriteStream(tmp, { mode: 0o755 });
      res.pipe(out);
      out.on('finish', () => {
        out.close(() => {
          fs.renameSync(tmp, dest);
          try { fs.chmodSync(dest, 0o755); } catch {}
          resolve(dest);
        });
      });
      out.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error(`download timeout: ${url}`)));
    req.on('error', reject);
  });
}

function prependPath(dir) {
  if (!dir || !exists(dir)) return;
  process.env.PATH = `${dir}${path.delimiter}${process.env.PATH || ''}`;
}
function addExistingLocalToolPaths(root) {
  const candidates = [
    path.join(root, '.cache', 'world-server-toolchain', 'wasmtime', 'bin'),
    path.join(root, '.cache', 'world-server-toolchain', 'cosign', 'bin')
  ];
  for (const c of candidates) prependPath(c);
  const cosignRoot = path.join(root, '.cache', 'world-server-toolchain', 'cosign');
  if (exists(cosignRoot)) {
    for (const d of fs.readdirSync(cosignRoot)) {
      const p = path.join(cosignRoot, d, 'bin');
      prependPath(p);
    }
  }
}

async function ensureExistingBootstrap(root, policy, state) {
  const bootstrap = path.join(root, 'scripts', 'toolchain-bootstrap.cjs');
  if (!exists(bootstrap)) {
    setBlocker(state, 'toolchain-bootstrap', 'requires_ai', { reason: 'Existing scripts/toolchain-bootstrap.cjs is missing' });
    return;
  }
  const enabled = policy.repair && policy.repair.reuseExistingToolchainBootstrap !== false;
  if (!enabled) return;
  const r = run(process.execPath, [bootstrap], { cwd: root, timeoutMs: policy.timeouts.toolchainMs });
  event(root, 'toolchain-bootstrap', { ok: r.ok, code: r.code, tail: redact(tailText(r.stdout + '\n' + r.stderr, 80)) });
  if (r.ok) {
    setBlocker(state, 'toolchain-bootstrap', 'pass', { reason: 'Existing bootstrap PASS' });
  } else {
    const outputTail = redact(tailText(r.stdout + '\n' + r.stderr, 120));
    const transient = looksTransientFailure(outputTail);
    setBlocker(state, 'toolchain-bootstrap', transient ? 'waiting' : 'requires_ai', {
      attempted: true,
      reason: transient ? 'Existing bootstrap hit a transient/network failure; scheduled retry' : 'Existing bootstrap failed',
      outputTail,
      nextRunAt: transient ? timerAfterMinutes(policy.timers.networkRetryMinutes) : null
    });
  }
  addExistingLocalToolPaths(root);
}


function probeBootstrappedTools(root, state) {
  addExistingLocalToolPaths(root);

  const wasmtime = run('wasmtime', ['--version'], { cwd: root, timeoutMs: 15000 });
  setBlocker(state, 'wasmtime', wasmtime.ok ? 'pass' : 'requires_ai', {
    reason: wasmtime.ok
      ? tailText(wasmtime.stdout || wasmtime.stderr, 4)
      : `wasmtime unavailable after existing bootstrap: ${tailText(wasmtime.stderr || wasmtime.stdout || wasmtime.error, 12)}`
  });

  const tlcJar = path.join(root, 'vendor', 'tla2tools.jar');
  if (!exists(tlcJar)) {
    setBlocker(state, 'tlc', 'requires_ai', { reason: 'vendor/tla2tools.jar missing after existing bootstrap' });
  } else if (!commandExists('java')) {
    setBlocker(state, 'tlc', 'requires_ai', { reason: 'TLC jar exists but Java runtime is unavailable' });
  } else {
    const tlc = run('java', ['-cp', tlcJar, 'tlc2.TLC', '-help'], { cwd: root, timeoutMs: 30000 });
    const txt = `${tlc.stdout}\n${tlc.stderr}`;
    const ok = tlc.ok || /\bTLC\b|Temporal Logic Checker|Usage:/i.test(txt);
    setBlocker(state, 'tlc', ok ? 'pass' : 'requires_ai', {
      reason: ok ? 'TLC native Java invocation verified' : `TLC verification failed: ${tailText(txt, 20)}`
    });
  }
}

function platformCosignAsset() {
  const arch = process.arch;
  const plat = process.platform;
  if (plat === 'win32' && arch === 'x64') return /^cosign-windows-amd64\.exe$/i;
  if (plat === 'win32' && arch === 'arm64') return /^cosign-windows-arm64\.exe$/i;
  if (plat === 'linux' && arch === 'x64') return /^cosign-linux-amd64$/i;
  if (plat === 'linux' && arch === 'arm64') return /^cosign-linux-arm64$/i;
  if (plat === 'darwin' && arch === 'x64') return /^cosign-darwin-amd64$/i;
  if (plat === 'darwin' && arch === 'arm64') return /^cosign-darwin-arm64$/i;
  return null;
}
async function ensureCosign(root, policy, state) {
  addExistingLocalToolPaths(root);
  const existing = run('cosign', ['version'], { cwd: root, timeoutMs: 15000 });
  if (existing.ok) {
    setBlocker(state, 'native-cosign', 'pass', { reason: tailText(existing.stdout || existing.stderr, 4) });
    return;
  }
  const cfg = policy.freeResources && policy.freeResources.cosign;
  if (!cfg || cfg.enabled === false) {
    setBlocker(state, 'native-cosign', 'external', { reason: 'cosign missing and auto-install disabled' });
    return;
  }
  const re = platformCosignAsset();
  if (!re) {
    setBlocker(state, 'native-cosign', 'external', { reason: `Unsupported platform for auto cosign: ${process.platform}/${process.arch}` });
    return;
  }
  try {
    const release = await httpsJson(cfg.releaseApi);
    const asset = (release.assets || []).find(a => re.test(a.name || ''));
    if (!asset) throw new Error(`No cosign asset for ${process.platform}/${process.arch}`);
    const digest = String(asset.digest || '');
    if (!/^sha256:[a-f0-9]{64}$/i.test(digest)) {
      throw new Error('GitHub release asset has no verifiable sha256 digest; refusing unverified download');
    }
    const ver = String(release.tag_name || 'unknown').replace(/^v/i, '');
    const binDir = path.join(root, '.cache', 'world-server-toolchain', 'cosign', ver, 'bin');
    const exeName = process.platform === 'win32' ? 'cosign.exe' : 'cosign';
    const dest = path.join(binDir, exeName);
    if (!exists(dest) || sha256File(dest).toLowerCase() !== digest.slice(7).toLowerCase()) {
      await downloadFile(asset.browser_download_url, dest, policy.network.allowedDownloadHosts, policy.timeouts.downloadMs);
      const got = sha256File(dest);
      if (got.toLowerCase() !== digest.slice(7).toLowerCase()) {
        try { fs.unlinkSync(dest); } catch {}
        throw new Error(`cosign SHA256 mismatch expected=${digest.slice(7)} actual=${got}`);
      }
      atomicJson(path.join(root, '.cache', 'world-server-toolchain', 'cosign', 'resolved-lock.json'), {
        resolvedAt: nowIso(), version: ver, asset: asset.name, sha256: got, source: asset.browser_download_url
      });
    }
    prependPath(binDir);
    const verify = run(dest, ['version'], { cwd: root, timeoutMs: 15000 });
    if (!verify.ok) throw new Error(`cosign installed but failed validation: ${tailText(verify.stderr || verify.stdout, 20)}`);
    setBlocker(state, 'native-cosign', 'pass', { attempted: true, reason: `installed verified cosign ${ver}` });
    event(root, 'resource-installed', { resource: 'cosign', version: ver, sha256: digest.slice(7) });
  } catch (e) {
    setBlocker(state, 'native-cosign', 'waiting', {
      attempted: true, reason: String(e.message || e), nextRunAt: timerAfterMinutes(policy.timers.networkRetryMinutes)
    });
  }
}

function collectPerformanceEvidence(root, state) {
  const evidence = {
    at: nowIso(),
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    cpus: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    tools: {}
  };
  if (process.platform === 'win32') {
    const logman = run('logman', ['query', 'providers'], { timeoutMs: 30000 });
    evidence.tools.etwLogman = { ok: logman.ok, sample: redact(tailText(logman.stdout || logman.stderr, 20)) };
    const wpr = run('wpr', ['-status'], { timeoutMs: 30000 });
    evidence.tools.wpr = { ok: wpr.ok, sample: redact(tailText(wpr.stdout || wpr.stderr, 20)) };
    if (logman.ok || wpr.ok) {
      setBlocker(state, 'etw-ebpf-perf', 'pass', { reason: 'Real Windows ETW/WPR capability evidence collected; eBPF/perf not falsely required on Windows' });
    } else {
      setBlocker(state, 'etw-ebpf-perf', 'requires_ai', { reason: 'Neither logman ETW provider query nor WPR status succeeded on Windows' });
    }
  } else if (process.platform === 'linux') {
    const perf = run('perf', ['--version'], { timeoutMs: 15000 });
    const bpftool = commandExists('bpftool') ? run('bpftool', ['version'], { timeoutMs: 15000 }) : { ok: false };
    const bpftrace = commandExists('bpftrace') ? run('bpftrace', ['--version'], { timeoutMs: 15000 }) : { ok: false };
    evidence.tools.perf = { ok: perf.ok, sample: tailText(perf.stdout || perf.stderr, 4) };
    evidence.tools.bpftool = { ok: bpftool.ok, sample: tailText(bpftool.stdout || bpftool.stderr, 4) };
    evidence.tools.bpftrace = { ok: bpftrace.ok, sample: tailText(bpftrace.stdout || bpftrace.stderr, 4) };
    setBlocker(state, 'etw-ebpf-perf', perf.ok && (bpftool.ok || bpftrace.ok) ? 'pass' : 'external', {
      reason: perf.ok ? 'perf available; eBPF utility missing without sudo auto-mutation' : 'perf/eBPF tools missing; no sudo auto-install allowed'
    });
  } else {
    setBlocker(state, 'etw-ebpf-perf', 'external', { reason: `Platform-specific tracing evidence not automated for ${process.platform}` });
  }
  atomicJson(statePaths(root).evidence, evidence);
}

function parseAdbPhysical(stdout) {
  return String(stdout || '').split(/\r?\n/)
    .map(x => x.trim()).filter(Boolean)
    .filter(x => /\sdevice(\s|$)/.test(x))
    .filter(x => !/^emulator-/i.test(x))
    .map(x => x.split(/\s+/)[0]);
}
function collectDeviceEvidence(root, policy, state) {
  const out = { at: nowIso(), android: {}, ios: {} };
  if (commandExists('adb')) {
    const r = run('adb', ['devices', '-l'], { timeoutMs: 30000 });
    const physical = r.ok ? parseAdbPhysical(r.stdout) : [];
    out.android = { adb: true, ok: r.ok, physicalDeviceIds: physical, rawTail: tailText(r.stdout || r.stderr, 30) };
    if (physical.length) setBlocker(state, 'fresh-android-device', 'pass', { reason: `${physical.length} physical Android device(s) detected` });
    else setBlocker(state, 'fresh-android-device', 'waiting', {
      reason: 'No physical Android device detected (emulators do not count)',
      nextRunAt: timerAfterMinutes(policy.timers.deviceRetryMinutes)
    });
  } else {
    out.android = { adb: false, physicalDeviceIds: [] };
    setBlocker(state, 'fresh-android-device', 'waiting', {
      reason: 'adb is not available or no physical Android evidence can be collected',
      nextRunAt: timerAfterMinutes(policy.timers.deviceRetryMinutes)
    });
  }

  if (commandExists('idevice_id')) {
    const r = run('idevice_id', ['-l'], { timeoutMs: 30000 });
    const ids = r.ok ? r.stdout.split(/\r?\n/).map(x => x.trim()).filter(Boolean) : [];
    out.ios = { ideviceId: true, ok: r.ok, physicalDeviceIds: ids };
    if (ids.length) setBlocker(state, 'fresh-ios-device', 'pass', { reason: `${ids.length} physical iOS device(s) detected` });
    else setBlocker(state, 'fresh-ios-device', 'waiting', {
      reason: 'No physical iOS device detected',
      nextRunAt: timerAfterMinutes(policy.timers.deviceRetryMinutes)
    });
  } else {
    out.ios = { ideviceId: false, physicalDeviceIds: [] };
    setBlocker(state, 'fresh-ios-device', 'waiting', {
      reason: `No physical iOS probe available on ${process.platform}; simulator/fake evidence is forbidden`,
      nextRunAt: timerAfterMinutes(policy.timers.deviceRetryMinutes)
    });
  }
  atomicJson(statePaths(root).devices, out);
}

async function probeUrl(url, timeoutMs = 15000) {
  return new Promise(resolve => {
    try {
      const u = new URL(url);
      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.request(u, { method: 'HEAD', timeout: timeoutMs, headers: { 'User-Agent': 'WorldServer-BlockerRepair/1.0' } }, res => {
        res.resume();
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 500, statusCode: res.statusCode });
      });
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
      req.on('error', e => resolve({ ok: false, error: String(e.message || e) }));
      req.end();
    } catch (e) { resolve({ ok: false, error: String(e.message || e) }); }
  });
}
async function checkRemoteCas(root, policy, state) {
  const url = process.env.WORLD_SERVER_REMOTE_CAS_URL || process.env.REMOTE_CAS_URL || '';
  if (!url) {
    setBlocker(state, 'remote-cas-peer', 'waiting', {
      reason: 'WORLD_SERVER_REMOTE_CAS_URL/REMOTE_CAS_URL not configured; localhost is not accepted as remote evidence',
      nextRunAt: timerAfterMinutes(policy.timers.remoteRetryMinutes)
    });
    return;
  }
  try {
    const u = new URL(url);
    if (['localhost', '127.0.0.1', '::1'].includes(u.hostname)) {
      setBlocker(state, 'remote-cas-peer', 'external', { reason: 'CAS URL is local; remote peer evidence must be genuinely remote' });
      return;
    }
    const r = await probeUrl(url, policy.timeouts.probeMs);
    if (r.ok) setBlocker(state, 'remote-cas-peer', 'pass', { reason: `Remote CAS responded HTTP ${r.statusCode}` });
    else setBlocker(state, 'remote-cas-peer', 'waiting', {
      reason: `Remote CAS probe failed: ${r.error || r.statusCode}`,
      nextRunAt: timerAfterMinutes(policy.timers.remoteRetryMinutes)
    });
  } catch (e) {
    setBlocker(state, 'remote-cas-peer', 'requires_ai', { reason: `Invalid remote CAS URL: ${e.message}` });
  }
}

function findScriptByPattern(pkg, patterns) {
  const scripts = (pkg && pkg.scripts) || {};
  const keys = Object.keys(scripts);
  return keys.find(k => patterns.every(re => re.test(k))) || null;
}
function checkFencedMigration(root, state) {
  const pkg = safeJson(path.join(root, 'package.json'), {});
  const key = findScriptByPattern(pkg, [/fenc/i, /migrat/i]);
  let r = null;
  if (key) r = run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', key], { cwd: root, timeoutMs: 30 * 60 * 1000 });
  if (!r) {
    const scriptsDir = path.join(root, 'scripts');
    const candidate = exists(scriptsDir)
      ? fs.readdirSync(scriptsDir).find(n => /fenc.*migrat|migrat.*fenc/i.test(n) && /\.(?:c?js|mjs)$/i.test(n))
      : null;
    if (candidate) r = run(process.execPath, [path.join(scriptsDir, candidate)], { cwd: root, timeoutMs: 30 * 60 * 1000 });
  }
  if (!r) {
    setBlocker(state, 'fenced-migration', 'requires_ai', { reason: 'No fenced migration verifier/runner discovered in package scripts or scripts/' });
  } else if (r.ok) {
    setBlocker(state, 'fenced-migration', 'pass', { reason: `${r.cmd} PASS` });
  } else {
    setBlocker(state, 'fenced-migration', 'requires_ai', {
      attempted: true, reason: `${r.cmd} failed`, outputTail: redact(tailText(r.stdout + '\n' + r.stderr, 100))
    });
  }
}

function deepHasLongSoakCertified(value, depth = 0) {
  if (depth > 6 || value == null) return false;
  if (typeof value !== 'object') return false;
  if (value.longSoakCertified === true) return true;
  return Object.values(value).some(v => deepHasLongSoakCertified(v, depth + 1));
}
function findLongSoakEvidence(root) {
  const roots = ['state', 'data', 'reports']
    .map(n => path.join(root, n))
    .filter(exists);
  const candidates = [];
  for (const base of roots) {
    candidates.push(...findFiles(base, 5, (_p, n) => /soak/i.test(n) && /\.json$/i.test(n)));
  }
  for (const p of candidates) {
    const j = safeJson(p);
    if (j && deepHasLongSoakCertified(j)) return { path: p, data: j };
  }
  return null;
}
function isPidAlive(pid) {
  if (!pid) return false;
  try { process.kill(Number(pid), 0); return true; } catch { return false; }
}
function localPrereqsGreen(state) {
  const hard = ['toolchain-bootstrap', 'native-cosign', 'fenced-migration'];
  return hard.every(id => state.blockers[id] && state.blockers[id].status === 'pass');
}
function manageLongSoak(root, policy, state, allowStart) {
  const cert = findLongSoakEvidence(root);
  if (cert) {
    state.longSoak = { certified: true, evidencePath: path.relative(root, cert.path), checkedAt: nowIso() };
    setBlocker(state, '8h-long-soak', 'pass', { reason: `longSoakCertified=true in ${path.relative(root, cert.path)}` });
    return;
  }
  const existing = state.longSoak || {};
  if (existing.pid && isPidAlive(existing.pid)) {
    setBlocker(state, '8h-long-soak', 'waiting', {
      reason: `Real long-soak running pid=${existing.pid}; waiting for certification`,
      nextRunAt: timerAfterMinutes(policy.timers.soakPollMinutes)
    });
    return;
  }
  if (!allowStart || !localPrereqsGreen(state)) {
    setBlocker(state, '8h-long-soak', 'waiting', {
      reason: 'Long-soak will start only after deterministic local prerequisites are green',
      nextRunAt: timerAfterMinutes(policy.timers.soakPollMinutes)
    });
    return;
  }
  const runner = path.join(root, 'scripts', 'long-soak-runner.cjs');
  if (!exists(runner)) {
    setBlocker(state, '8h-long-soak', 'requires_ai', { reason: 'Existing scripts/long-soak-runner.cjs missing' });
    return;
  }
  ensureDir(statePaths(root).dir);
  const out = fs.openSync(statePaths(root).soakLog, 'a');
  const child = spawn(process.execPath, [runner], {
    cwd: root,
    env: { ...process.env, WORLD_SERVER_LONG_SOAK_SECONDS: String(policy.longSoak.productionSeconds) },
    detached: true,
    stdio: ['ignore', out, out],
    windowsHide: true
  });
  child.unref();
  state.longSoak = { certified: false, pid: child.pid, startedAt: nowIso(), seconds: policy.longSoak.productionSeconds };
  setBlocker(state, '8h-long-soak', 'waiting', {
    attempted: true,
    reason: `Started real long-soak pid=${child.pid}; production duration=${policy.longSoak.productionSeconds}s`,
    nextRunAt: timerAfterMinutes(policy.timers.soakPollMinutes)
  });
  event(root, 'long-soak-started', { pid: child.pid, seconds: policy.longSoak.productionSeconds });
}

function npmCmd() { 
  if(process.platform==='win32'){
    const p='C:\\Program Files\\nodejs\\npm.cmd';
    try{ require('fs').accessSync(p); return `"${p}"`; }catch{ return 'npm.cmd'; }
  }
  return 'npm'; 
}
function npxCmd() { 
  if(process.platform==='win32'){
    const p='C:\\Program Files\\nodejs\\npx.cmd';
    try{ require('fs').accessSync(p); return `"${p}"`; }catch{ return 'npx.cmd'; }
  }
  return 'npx'; 
}
function gateSpecs(root, policy) {
  const pkg = safeJson(path.join(root, 'package.json'), {});
  const scripts = (pkg && pkg.scripts) || {};
  const specs = [];
  // Use node + npm-cli directly to avoid Windows shell/PATH issues
  const npmCli = process.platform==='win32' ? 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js' : null;
  for (const name of policy.gates.npmScripts || []) {
    if (scripts[name]){
      if(npmCli && exists(npmCli)){
        specs.push({ id: `npm:${name}`, cmd: process.execPath, args: [npmCli, 'run', name] });
      } else {
        specs.push({ id: `npm:${name}`, cmd: npmCmd(), args: ['run', name] });
      }
    } else specs.push({ id: `npm:${name}`, missing: true });
  }
  const cp = path.join(root, 'scripts', 'system-control-plane.cjs');
  if (exists(cp)) specs.push({ id: 'control-plane-verify', cmd: process.execPath, args: [cp, '--verify'] });
  return specs;
}
function runGates(root, policy, state, selected = null) {
  const results = [];
  const specs = gateSpecs(root, policy).filter(x => !selected || selected.includes(x.id));
  for (const spec of specs) {
    if (spec.missing) {
      results.push({ id: spec.id, ok: false, code: -1, missing: true, outputTail: 'package.json script missing' });
      continue;
    }
    const isNpm = /^(npm|npx)(\.cmd)?$/i.test(spec.cmd);
    const r = run(spec.cmd, spec.args, {
      cwd: root,
      timeoutMs: policy.timeouts.gateMs,
      unsetEnv: ['SYSTEM_INTEGRATION_SKIP_FULL_VERIFY'],
      shell: isNpm ? true : false
    });
    results.push({
      id: spec.id, ok: r.ok, code: r.code, startedAt: r.startedAt, finishedAt: r.finishedAt,
      outputTail: redact(tailText(r.stdout + '\n' + r.stderr, policy.gates.tailLines))
    });
    if (!r.ok && policy.gates.stopOnFirstFailure) break;
  }
  const allPass = results.length > 0 && results.every(x => x.ok);
  state.gates = { at: nowIso(), allPass, results };
  atomicJson(statePaths(root).gates, state.gates);
  setBlocker(state, 'local-gates', allPass ? 'pass' : 'requires_ai', {
    reason: allPass ? `${results.length}/${results.length} gates PASS` : `${results.filter(x => x.ok).length}/${results.length} gates PASS`
  });
  return results;
}

function gitRemoteRepo(root) {
  const r = run('git', ['remote', 'get-url', 'origin'], { cwd: root, timeoutMs: 15000 });
  if (!r.ok) return null;
  const s = r.stdout.trim();
  let m = s.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/i);
  return m ? { owner: m[1], repo: m[2].replace(/\.git$/i, '') } : null;
}
async function checkVercelStatus(root, policy, state) {
  const repo = gitRemoteRepo(root);
  const shaR = run('git', ['rev-parse', 'HEAD'], { cwd: root, timeoutMs: 15000 });
  if (!repo || !shaR.ok) {
    setBlocker(state, 'vercel-deployment', 'requires_ai', { reason: 'Cannot resolve GitHub origin/HEAD for Vercel status check' });
    return;
  }
  const sha = shaR.stdout.trim();
  try {
    const st = await httpsJson(`https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/commits/${sha}/status`, policy.timeouts.probeMs);
    const statuses = st.statuses || [];
    // Prefer world-server project explicitly — other Vercel projects (improve-world-home) share same repo but have different Root Directory and should not block world-server. See VERCEL_ROOT_DIRECTORY_STATUS.json
    let vercel = statuses.find(x => /vercel.*world-server/i.test(String(x.context || ''))) || statuses.find(x => String(x.target_url||'').includes('/world-server/')) || statuses.find(x => /vercel/i.test(String(x.context || '')));
    if (!vercel) {
      setBlocker(state, 'vercel-deployment', 'waiting', {
        reason: `No Vercel commit status yet for ${sha.slice(0, 8)}`,
        nextRunAt: timerAfterMinutes(policy.timers.vercelRetryMinutes)
      });
      return;
    }
    if (vercel.state === 'success') {
      setBlocker(state, 'vercel-deployment', 'pass', { reason: `Vercel PASS for ${sha.slice(0, 8)}`, targetUrl: vercel.target_url || null });
      return;
    }
    const desc = String(vercel.description || '');
    const dpl = desc.match(/\b(dpl_[A-Za-z0-9]+)\b/)?.[1] || null;
    let inspect = null;
    if (vercel.state === 'failure' && dpl) {
      inspect = run(npxCmd(), ['vercel', 'inspect', dpl, '--logs'], { cwd: root, timeoutMs: policy.timeouts.vercelInspectMs });
    }
    setBlocker(state, 'vercel-deployment', vercel.state === 'failure' ? 'requires_ai' : 'waiting', {
      attempted: Boolean(inspect),
      reason: `Vercel state=${vercel.state}: ${desc}`,
      deploymentId: dpl,
      targetUrl: vercel.target_url || null,
      outputTail: inspect ? redact(tailText(inspect.stdout + '\n' + inspect.stderr, 160)) : null,
      nextRunAt: vercel.state === 'failure' ? null : timerAfterMinutes(policy.timers.vercelRetryMinutes)
    });
  } catch (e) {
    setBlocker(state, 'vercel-deployment', 'waiting', {
      reason: `GitHub/Vercel status probe failed: ${e.message}`,
      nextRunAt: timerAfterMinutes(policy.timers.networkRetryMinutes)
    });
  }
}

function summarizeRequiresAi(state) {
  return Object.values(state.blockers || {}).filter(x => x.status === 'requires_ai');
}
function updateAiActionFromState(root, state) {
  const req = summarizeRequiresAi(state);
  if (!req.length) { clearAiAction(root); return null; }
  const sections = [];
  for (const b of req) {
    sections.push(`### ${b.id}`, '', `Status: **${b.status}**`, '', `Reason: ${b.reason || 'unknown'}`, '');
    if (b.outputTail) sections.push('```text', redact(tailText(b.outputTail, 180)), '```', '');
  }
  return writeAiAction(root, `${req.length} blocker(s) require Desktop AI root-cause repair`, sections);
}
function computeMergeSafe(state, policy) {
  const required = policy.merge.requiredBlockers || [];
  const blockersGreen = required.every(id => state.blockers[id] && state.blockers[id].status === 'pass');
  const gatesGreen = state.gates && state.gates.allPass === true;
  state.mergeSafe = Boolean(blockersGreen && gatesGreen);
  return state.mergeSafe;
}

function findFiles(root, maxDepth, predicate) {
  const out = [];
  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let names = [];
    try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of names) {
      if (['node_modules', '.git', '.cache', '.system-integration-backups', '.blocker-repair-backups'].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (predicate(p, e.name)) out.push(p);
    }
  }
  walk(root, 0);
  return out;
}
function injectExistingAutoloop(root) {
  const files = findFiles(root, 4, (_p, n) => /autoloop.*\.ps1$/i.test(n) || /quality.*loop.*\.ps1$/i.test(n));
  if (!files.length) return { found: false, injected: false };
  const target = files[0];
  const src = fs.readFileSync(target, 'utf8');
  if (src.includes(MANAGED_BEGIN)) return { found: true, injected: false, target, already: true };
  const backupDir = path.join(root, '.blocker-repair-backups', `scheduler-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const backupTarget = path.join(backupDir, path.relative(root, target));
  ensureDir(path.dirname(backupTarget));
  fs.copyFileSync(target, backupTarget);
  const rel = path.relative(root, path.join(root, 'scripts', 'autonomous-blocker-repair.cjs')).replace(/\\/g, '/');
  const block = [
    '', MANAGED_BEGIN,
    '$WorldServerRepairRoot = (& git -C $PSScriptRoot rev-parse --show-toplevel 2>$null)',
    'if ($LASTEXITCODE -eq 0 -and $WorldServerRepairRoot) {',
    `  & node (Join-Path $WorldServerRepairRoot '${rel.replace(/\//g, "\\")}') tick`,
    '}',
    MANAGED_END, ''
  ].join('\r\n');
  fs.writeFileSync(target, src.replace(/\s*$/, '') + block, 'utf8');
  return { found: true, injected: true, target };
}
function schedulerTaskName(root) {
  return 'WorldServer-BlockerRepair-' + crypto.createHash('sha1').update(path.resolve(root)).digest('hex').slice(0, 10);
}
function writeSchedulerLauncher(root) {
  const p = statePaths(root);
  ensureDir(p.dir);
  if (process.platform === 'win32') {
    const node = process.execPath.replace(/"/g, '""');
    const script = path.join(root, 'scripts', 'autonomous-blocker-repair.cjs').replace(/"/g, '""');
    const log = path.join(p.dir, 'scheduler.log').replace(/"/g, '""');
    // Headless/hidden: use PowerShell hidden window to avoid flashing CMD
    const hiddenCmd = `@echo off\r\ncd /d "${root}"\r\npowershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '${node}' -ArgumentList '\\\"${script}\\\" tick' -WindowStyle Hidden -NoNewWindow -RedirectStandardOutput '${log}' -RedirectStandardError '${log}' -WorkingDirectory '${root}'"\r\n`;
    fs.writeFileSync(p.schedulerCmd, hiddenCmd, 'utf8');
    return p.schedulerCmd;
  } else {
    fs.writeFileSync(p.schedulerSh, `#!/bin/sh\ncd ${JSON.stringify(root)}\n${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(root, 'scripts', 'autonomous-blocker-repair.cjs'))} tick >> ${JSON.stringify(path.join(p.dir, 'scheduler.log'))} 2>&1\n`, { encoding: 'utf8', mode: 0o755 });
    return p.schedulerSh;
  }
}
function installScheduler(root, policy, state) {
  const injected = injectExistingAutoloop(root);
  if (injected.found) {
    state.scheduler = { mode: 'existing-autoloop', target: path.relative(root, injected.target), injected: injected.injected, at: nowIso() };
    setBlocker(state, 'durable-scheduler', 'pass', { reason: `Reused existing autoloop ${state.scheduler.target}` });
    event(root, 'scheduler', state.scheduler);
    return state.scheduler;
  }
  const launcher = writeSchedulerLauncher(root);
  if (process.platform === 'win32') {
    const name = schedulerTaskName(root);
    const mins = String(Math.max(1, Number(policy.timers.schedulerMinutes || 15)));
    const r = run('schtasks', ['/Create', '/SC', 'MINUTE', '/MO', mins, '/TN', name, '/TR', `"${launcher}"`, '/F'], { timeoutMs: 30000 });
    state.scheduler = { mode: r.ok ? 'windows-task-scheduler' : 'none', taskName: name, launcher, ok: r.ok, outputTail: tailText(r.stdout + '\n' + r.stderr, 30), at: nowIso() };
    if (!r.ok) setBlocker(state, 'durable-scheduler', 'requires_ai', { reason: `schtasks failed: ${state.scheduler.outputTail}` });
    else setBlocker(state, 'durable-scheduler', 'pass', { reason: `Task Scheduler every ${mins} minutes` });
    return state.scheduler;
  }
  state.scheduler = { mode: 'loop-command-required', launcher, at: nowIso() };
  setBlocker(state, 'durable-scheduler', 'external', { reason: 'No automatic system cron mutation on non-Windows; use npm run blockers:loop or existing orchestrator' });
  return state.scheduler;
}
function removeScheduler(root, state) {
  if (process.platform === 'win32') {
    const name = (state.scheduler && state.scheduler.taskName) || schedulerTaskName(root);
    run('schtasks', ['/Delete', '/TN', name, '/F'], { timeoutMs: 30000 });
  }
  state.scheduler = { mode: 'removed', at: nowIso() };
}

function selfTest() {
  const failures = [];
  const assert = (c, m) => { if (!c) failures.push(m); };
  assert(parseAdbPhysical('List of devices attached\nemulator-5554 device product:x\nABC123 device product:y\n').length === 1, 'physical ADB parser');
  assert(parseAdbPhysical('ABC offline\n').length === 0, 'ADB offline excluded');
  const s = defaultState();
  setBlocker(s, 'x', 'waiting', { nextRunAt: timerAfterMinutes(1) });
  assert(Boolean(earliestTimer(s)), 'timer persistence calculation');
  assert(platformCosignAsset() instanceof RegExp || platformCosignAsset() === null, 'cosign platform resolver');
  const h = crypto.createHash('sha256').update('abc').digest('hex');
  assert(h === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'sha256 primitive');
  if (failures.length) {
    console.error(JSON.stringify({ pass: false, failures }, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ pass: true, version: VERSION, tests: 5 }, null, 2));
  }
}

async function tick(root, args) {
  const policy = loadPolicy(root);
  const release = acquireLock(root, Number(policy.lock.staleMinutes || 60) * 60000);
  let state = loadState(root);
  try {
    state.cycle = Number(state.cycle || 0) + 1;
    state.lastRunAt = nowIso();
    event(root, 'tick-start', { cycle: state.cycle, pid: process.pid });
    addExistingLocalToolPaths(root);

    if (!args['no-bootstrap']) await ensureExistingBootstrap(root, policy, state);
    if (!args['no-bootstrap']) probeBootstrappedTools(root, state);
    if (!args['safe-only']) await ensureCosign(root, policy, state);
    collectPerformanceEvidence(root, state);
    collectDeviceEvidence(root, policy, state);
    await checkRemoteCas(root, policy, state);
    if (!args['safe-only']) checkFencedMigration(root, state);

    if (!args['no-gates'] && !args['safe-only']) runGates(root, policy, state);
    if (!args['no-vercel']) await checkVercelStatus(root, policy, state);

    const hardRequiresAiBeforeSoak = summarizeRequiresAi(state).some(b => !['fresh-android-device','fresh-ios-device','remote-cas-peer'].includes(b.id));
    manageLongSoak(root, policy, state, !args['safe-only'] && !hardRequiresAiBeforeSoak && state.gates && state.gates.allPass);

    state.nextRunAt = earliestTimer(state);
    computeMergeSafe(state, policy);
    const aiPath = updateAiActionFromState(root, state);
    saveState(root, state);
    event(root, 'tick-end', {
      cycle: state.cycle,
      mergeSafe: state.mergeSafe,
      nextRunAt: state.nextRunAt,
      requiresAi: summarizeRequiresAi(state).map(x => x.id),
      aiAction: aiPath ? path.relative(root, aiPath) : null
    });

    const counts = {};
    for (const b of Object.values(state.blockers || {})) counts[b.status] = (counts[b.status] || 0) + 1;
    console.log(JSON.stringify({
      pass: summarizeRequiresAi(state).length === 0,
      version: VERSION,
      cycle: state.cycle,
      counts,
      gatesPass: Boolean(state.gates && state.gates.allPass),
      mergeSafe: state.mergeSafe,
      nextRunAt: state.nextRunAt,
      aiAction: aiPath ? path.relative(root, aiPath) : null,
      blockers: state.blockers
    }, null, 2));
    if (summarizeRequiresAi(state).length) process.exitCode = 2;
  } finally {
    release();
  }
}

async function loop(root, args) {
  const policy = loadPolicy(root);
  const interval = Math.max(1, Number(args.minutes || policy.timers.schedulerMinutes || 15));
  while (true) {
    try { await tick(root, args); } catch (e) {
      console.error(`[blocker-repair] tick error: ${e.stack || e}`);
    }
    const state = loadState(root);
    const dueAt = state.nextRunAt ? Date.parse(state.nextRunAt) : Date.now() + interval * 60000;
    const delay = Math.max(15000, Math.min(interval * 60000, dueAt - Date.now()));
    await sleep(delay);
  }
}

function status(root) {
  const s = loadState(root);
  console.log(JSON.stringify(s, null, 2));
}
function schedulerInstall(root) {
  const policy = loadPolicy(root);
  const state = loadState(root);
  const result = installScheduler(root, policy, state);
  saveState(root, state);
  console.log(JSON.stringify(result, null, 2));
  if (result.ok === false) process.exitCode = 1;
}
function schedulerRemove(root) {
  const state = loadState(root);
  removeScheduler(root, state);
  saveState(root, state);
  console.log(JSON.stringify(state.scheduler, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] || 'status';
  const root = discoverRoot(args.root);
  if (cmd === 'self-test') return selfTest();
  if (!exists(path.join(root, 'package.json'))) throw new Error(`Not a World_server-style repo root: ${root}`);
  if (cmd === 'tick') return tick(root, args);
  if (cmd === 'loop') return loop(root, args);
  if (cmd === 'status') return status(root);
  if (cmd === 'scheduler-install') return schedulerInstall(root);
  if (cmd === 'scheduler-remove') return schedulerRemove(root);
  throw new Error(`Unknown command: ${cmd}`);
}
main().catch(e => {
  console.error(`[blocker-repair] FATAL: ${e.stack || e}`);
  process.exitCode = 1;
});
