'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const { execFileSync } = require('child_process');

const ROOT = process.env.WORLD_REPO_ROOT ? path.resolve(process.env.WORLD_REPO_ROOT) : path.resolve(__dirname, '..');
const STATE_DIR = path.join(ROOT, '.world', 'google-ai-studio');
const CONFIG_FILE = path.join(STATE_DIR, 'slots.json');
const LOCAL_FILE = path.join(STATE_DIR, 'slots.local.json');
const REPORT_DIR = path.join(STATE_DIR, 'reports');
const KNOWN_ISSUES = path.join(STATE_DIR, 'known-issues.json');
const LAST_GREEN = path.join(STATE_DIR, 'last-green.json');
const EVIDENCE_LEDGER = path.join(STATE_DIR, 'evidence-ledger.jsonl');
const PLATFORM_ENV_KEYS = path.join(STATE_DIR, 'platform-env-keys.local.json');
const REQUIRED_ENV = [
  'WORLD_SLOT',
  'WORLD_SLOT_ENTRYPOINT',
  'WORLD_BUILD_SHA'
];
const OPTIONAL_SHARED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SENTRY_DSN',
  'NEXT_PUBLIC_SENTRY_DSN',
  'NEXT_PUBLIC_POSTHOG_KEY',
  'POSTHOG_KEY',
  'GEMINI_API_KEY',
  'WORLD_TRANSLATION_GEMINI_MODEL',
  'WORLD_TRANSLATION_ENDPOINT'
];

function defaultConfig() {
  return {
    schemaVersion: 2,
    maxActiveDeployments: 2,
    policy: {
      requireHttps: true,
      requirePublic: true,
      requireIndependentNavigator: true,
      forbidThirdSlot: true,
      forbidDurableLocalWrites: true,
      promotionRequiresSandboxGreen: true,
      promotionRequiresReferenceComparison: true,
      maxRootLatencyMs: 5000,
      maxHealthLatencyMs: 2500,
      maxReadyLatencyMs: 4000,
      maxProbeLatencyMs: 2500
    },
    slots: {
      navigator: {
        role: 'public-navigator',
        url: '',
        entrypoint: '',
        referenceUrl: 'https://dark-void-navigator.vercel.app/',
        expectedSlot: 'navigator'
      },
      sandbox: {
        role: 'preproduction-sandbox',
        url: '',
        entrypoint: '/apps/catalog/',
        referenceUrl: '',
        expectedSlot: 'sandbox'
      }
    }
  };
}
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}
function appendJsonl(file, value) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify(value) + '\n');
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}
function loadConfig() {
  const base = readJson(CONFIG_FILE, defaultConfig());
  const defaults = defaultConfig();
  base.schemaVersion ||= defaults.schemaVersion;
  base.policy = { ...defaults.policy, ...(base.policy || {}) };
  base.slots = { ...defaults.slots, ...(base.slots || {}) };
  const local = readJson(LOCAL_FILE, {});
  if (local.slots) {
    for (const [name, override] of Object.entries(local.slots)) {
      if (base.slots[name]) base.slots[name] = { ...base.slots[name], ...override };
    }
  }
  return base;
}
function saveBaseConfig(config) {
  const copy = JSON.parse(JSON.stringify(config));
  for (const slot of Object.values(copy.slots)) slot.url = '';
  writeJson(CONFIG_FILE, copy);
}
function saveLocal(config) {
  const local = { schemaVersion: 2, slots: {} };
  for (const [name, slot] of Object.entries(config.slots)) {
    local.slots[name] = {
      url: slot.url || '',
      entrypoint: slot.entrypoint || '',
      referenceUrl: slot.referenceUrl || ''
    };
  }
  writeJson(LOCAL_FILE, local);
}
function validateConfig(config) {
  const errors = [];
  if (config.maxActiveDeployments !== 2) errors.push('maxActiveDeployments must be exactly 2');
  const names = Object.keys(config.slots || {});
  if (names.length !== 2) errors.push(`exactly 2 slots required; found ${names.length}`);
  for (const required of ['navigator', 'sandbox']) if (!names.includes(required)) errors.push(`missing slot: ${required}`);
  for (const [name, slot] of Object.entries(config.slots || {})) {
    if (slot.expectedSlot !== name) errors.push(`${name}.expectedSlot must equal "${name}"`);
    if (slot.url) {
      try {
        const u = new URL(slot.url);
        if (u.protocol !== 'https:') errors.push(`${name}.url must use https`);
      } catch { errors.push(`${name}.url is invalid`); }
    }
    if (slot.entrypoint && /^https?:\/\//i.test(slot.entrypoint)) errors.push(`${name}.entrypoint must be local, not remote`);
  }
  return errors;
}
function init() {
  ensureDir(STATE_DIR);
  if (!fs.existsSync(CONFIG_FILE)) saveBaseConfig(defaultConfig());
  else {
    const existing = readJson(CONFIG_FILE, defaultConfig());
    const merged = { ...defaultConfig(), ...existing, policy: { ...defaultConfig().policy, ...(existing.policy || {}) } };
    saveBaseConfig(merged);
  }
  if (!fs.existsSync(KNOWN_ISSUES)) writeJson(KNOWN_ISSUES, { schemaVersion: 2, issues: [] });
  if (!fs.existsSync(LAST_GREEN)) writeJson(LAST_GREEN, { schemaVersion: 1, navigator: null, sandbox: null });
  console.log(JSON.stringify({ ok: true, schemaVersion: 2, config: path.relative(ROOT, CONFIG_FILE), slots: ['navigator', 'sandbox'] }, null, 2));
}
function parseArgs(argv) {
  const args = [...argv];
  const flags = new Set(args.filter(x => x.startsWith('--')));
  const pos = args.filter(x => !x.startsWith('--'));
  return { pos, flags };
}
function configure(name, url) {
  const config = loadConfig();
  if (!config.slots[name]) throw new Error(`Unknown slot "${name}". Only navigator and sandbox are allowed.`);
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('Deployment URL must use https');
  config.slots[name].url = parsed.toString().replace(/\/$/, '');
  saveLocal(config);
  console.log(JSON.stringify({ ok: true, slot: name, url: config.slots[name].url }, null, 2));
}
function setField(name, field, value) {
  const config = loadConfig();
  if (!config.slots[name]) throw new Error(`Unknown slot "${name}"`);
  config.slots[name][field] = value;
  saveLocal(config);
  console.log(JSON.stringify({ ok: true, slot: name, [field]: value }, null, 2));
}
function guard() {
  const config = loadConfig();
  const errors = validateConfig(config);
  const result = {
    ok: errors.length === 0,
    configured: Object.fromEntries(Object.entries(config.slots).map(([k,v]) => [k, Boolean(v.url)])),
    activeSlotCountPolicy: 2,
    errors
  };
  recordEvidence('guard', result);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
  return result;
}
function walk(dir, out, depth = 0) {
  if (depth > 6) return;
  const ignored = new Set(['node_modules', '.git', '.world', '.next', 'dist', 'build', '.vercel', 'coverage']);
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (ignored.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, out, depth + 1);
    else if (e.name === 'package.json' || e.name === 'index.html' || /navigator|improve.?world/i.test(e.name)) out.push(abs);
  }
}
function discover() {
  const candidates = [];
  walk(ROOT, candidates);
  const scored = [];
  for (const file of candidates) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    let score = 0;
    if (/navigator|improve.?world/i.test(rel)) score += 100;
    if (/apps\//i.test(rel)) score += 20;
    if (/index\.html$/i.test(rel)) score += 10;
    if (/package\.json$/i.test(rel)) {
      score += 5;
      try {
        const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
        const hay = JSON.stringify({ name: pkg.name, description: pkg.description, scripts: pkg.scripts });
        if (/navigator|improve.?world/i.test(hay)) score += 100;
        if (pkg.scripts?.start) score += 10;
        if (pkg.scripts?.build) score += 5;
      } catch {}
    }
    scored.push({ path: rel, score });
  }
  scored.sort((a,b) => b.score - a.score || a.path.localeCompare(b.path));
  const strong = scored.filter(x => x.score >= 100);
  const result = {
    ok: strong.length > 0,
    strongNavigatorCandidates: strong.slice(0, 20),
    topCandidates: scored.slice(0, 30),
    note: strong.length
      ? 'Inspect strong candidates; reuse source-of-truth and do not duplicate it.'
      : 'No strong Navigator source found in this worktree. Locate the Vercel-linked Git source before independent navigator deploy.'
  };
  writeJson(path.join(STATE_DIR, 'source-discovery.json'), result);
  recordEvidence('source-discovery', result);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 2;
  return result;
}
async function fetchTimed(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      ...options,
      signal: controller.signal,
      headers: {
        'user-agent': 'WorldServer-GoogleSlotsVerifier/3.0',
        'x-world-verification-id': crypto.randomUUID(),
        ...(options.headers || {})
      }
    });
    const elapsedMs = Math.round(performance.now() - start);
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      url: res.url,
      elapsedMs,
      headers: Object.fromEntries(res.headers.entries()),
      body: text.slice(0, 100_000)
    };
  } finally {
    clearTimeout(timer);
  }
}
function authWall(result) {
  const u = String(result.url || '').toLowerCase();
  const body = String(result.body || '').toLowerCase();
  const badUrl = /accounts\.google\.com|vercel\.com\/login|vercel\.com\/sso|auth\/login/.test(u);
  const badBody = /(sign in with google|log in to vercel|deployment protection|authentication required)/.test(body);
  return badUrl || badBody;
}
async function retryFetch(url, attempts = 3) {
  let last;
  for (let i=0; i<attempts; i++) {
    try {
      last = await fetchTimed(url);
      if (last.status < 500) return last;
    } catch (error) {
      last = { ok: false, status: 0, url, elapsedMs: null, headers: {}, body: '', error: error.message };
    }
    await new Promise(r => setTimeout(r, 300 * (i + 1)));
  }
  return last;
}
function safeJson(body) { try { return JSON.parse(body); } catch { return null; } }
function budgetCheck(checks, id, elapsedMs, maxMs) {
  if (elapsedMs == null) return;
  if (elapsedMs <= maxMs) checks.push({ id, ok: true, detail: `${elapsedMs}ms <= ${maxMs}ms` });
  else checks.push({ id, ok: false, detail: `${elapsedMs}ms > ${maxMs}ms` });
}
async function verifySlot(name, slotConfig, policy = defaultConfig().policy) {
  const checks = [];
  const fail = (id, detail) => checks.push({ id, ok: false, detail });
  const pass = (id, detail) => checks.push({ id, ok: true, detail });
  const warn = (id, detail) => checks.push({ id, ok: true, warning: true, detail });

  if (!slotConfig.url) {
    fail('configured-url', 'No real deployment URL configured');
    return { slot: name, ok: false, independent: null, checks };
  }
  let base;
  try { base = new URL(slotConfig.url); }
  catch { fail('configured-url', 'Invalid URL'); return { slot: name, ok: false, independent: null, checks }; }
  if (base.protocol === 'https:') pass('https', base.origin); else fail('https', base.origin);

  const root = await retryFetch(new URL('/', base).toString());
  if (root.status >= 200 && root.status < 500) pass('root-http', `${root.status} in ${root.elapsedMs}ms`);
  else fail('root-http', `${root.status || 'network error'} ${root.error || ''}`.trim());
  if (authWall(root)) fail('public-access', `auth wall detected at ${root.url}`);
  else pass('public-access', root.url);

  const health = await retryFetch(new URL('/healthz', base).toString());
  const healthJson = safeJson(health.body);
  if (health.status === 200 && healthJson?.ok) pass('healthz', `${health.status} ${health.elapsedMs}ms`);
  else fail('healthz', `${health.status} ${health.body.slice(0, 200)}`);

  const ready = await retryFetch(new URL('/readyz', base).toString());
  const readyJson = safeJson(ready.body);
  if (ready.status === 200 && readyJson?.ok) pass('readyz', `${ready.status} ${ready.elapsedMs}ms`);
  else fail('readyz', `${ready.status} ${ready.body.slice(0, 200)}`);

  const meta = await retryFetch(new URL('/api/deployment-meta', base).toString());
  const metaJson = safeJson(meta.body);
  if (meta.status === 200 && metaJson) pass('deployment-meta', `${meta.status} ${meta.elapsedMs}ms`);
  else fail('deployment-meta', `${meta.status} invalid/missing JSON`);

  if (metaJson?.slot === name) pass('slot-identity', name);
  else fail('slot-identity', `expected ${name}; got ${metaJson?.slot ?? 'missing'}`);

  const independent = metaJson?.independent === true;
  if (name === 'navigator') {
    if (independent) pass('independent-runtime', 'navigator is not a remote proxy');
    else fail('independent-runtime', 'navigator reports independent=false; migration proxy is not production-ready');
  } else if (independent) pass('independent-runtime', 'sandbox is independent');
  else warn('independent-runtime', 'sandbox is using a temporary remote bridge');

  const probe = await retryFetch(new URL('/api/cross-platform-probe', base).toString());
  const probeJson = safeJson(probe.body);
  if (probe.status === 200 && probeJson?.ok && probeJson?.slot === name) pass('cross-platform-probe', `${probe.elapsedMs}ms`);
  else fail('cross-platform-probe', `${probe.status} invalid probe`);

  const correlation = root.headers['x-world-correlation-id'] || probe.headers['x-world-correlation-id'];
  if (correlation) pass('correlation-id', correlation);
  else warn('correlation-id', 'missing; wrapper V3 should provide one');

  if (root.headers['x-content-type-options']) pass('nosniff-header', root.headers['x-content-type-options']);
  else warn('nosniff-header', 'missing on root response');
  if (root.headers['content-security-policy']) pass('csp-header', 'present');
  else warn('csp-header', 'missing; enable after WebGL/worker compatibility verification');
  if (root.headers['referrer-policy']) pass('referrer-policy', root.headers['referrer-policy']);
  else warn('referrer-policy', 'missing');

  budgetCheck(checks, 'budget-root', root.elapsedMs, policy.maxRootLatencyMs || 5000);
  budgetCheck(checks, 'budget-health', health.elapsedMs, policy.maxHealthLatencyMs || 2500);
  budgetCheck(checks, 'budget-ready', ready.elapsedMs, policy.maxReadyLatencyMs || 4000);
  budgetCheck(checks, 'budget-probe', probe.elapsedMs, policy.maxProbeLatencyMs || 2500);

  const hardFails = checks.filter(c => !c.ok);
  return {
    slot: name,
    ok: hardFails.length === 0,
    url: base.origin,
    independent,
    buildSha: metaJson?.buildSha || null,
    version: metaJson?.controllerVersion || null,
    latencyMs: { root: root.elapsedMs, health: health.elapsedMs, ready: ready.elapsedMs, probe: probe.elapsedMs },
    checks
  };
}
async function verify(options = {}) {
  const config = loadConfig();
  const configErrors = validateConfig(config);
  if (configErrors.length) {
    console.error(JSON.stringify({ ok: false, configErrors }, null, 2));
    process.exitCode = 1;
    return { ok: false, configErrors };
  }
  const allowUnconfigured = Boolean(options.allowUnconfigured);
  const results = [];
  for (const [name, slot] of Object.entries(config.slots)) {
    if (!slot.url && allowUnconfigured) {
      results.push({ slot: name, ok: true, skipped: true, reason: 'unconfigured' });
      continue;
    }
    results.push(await verifySlot(name, slot, config.policy));
  }
  const report = { schemaVersion: 2, generatedAt: new Date().toISOString(), commit: gitSha(), ok: results.every(x => x.ok), results };
  ensureDir(REPORT_DIR);
  writeJson(path.join(REPORT_DIR, 'latest.json'), report);
  writeJson(path.join(REPORT_DIR, `${Date.now()}-verify.json`), report);
  recordEvidence('verify', report);
  if (report.ok) updateLastGreen(report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
  return report;
}
function normalizeHtmlSignature(html) {
  return crypto.createHash('sha256').update(
    String(html || '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/\b(?:build|commit|sha|timestamp)[=:]["']?[\w.:-]+/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200000)
  ).digest('hex');
}
async function compare() {
  const config = loadConfig();
  const results = [];
  for (const [name, slot] of Object.entries(config.slots)) {
    if (!slot.url || !slot.referenceUrl) {
      results.push({ slot: name, ok: true, skipped: true, reason: 'missing slot URL or reference URL' });
      continue;
    }
    const [candidate, reference] = await Promise.all([
      retryFetch(new URL('/', slot.url).toString()),
      retryFetch(new URL('/', slot.referenceUrl).toString())
    ]);
    const candidateAlive = candidate.status >= 200 && candidate.status < 500;
    const referenceAlive = reference.status >= 200 && reference.status < 500;
    const title = html => (String(html).match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '').trim();
    results.push({
      slot: name,
      ok: candidateAlive && referenceAlive && !authWall(candidate),
      candidate: { status: candidate.status, elapsedMs: candidate.elapsedMs, title: title(candidate.body), semanticSignature: normalizeHtmlSignature(candidate.body) },
      reference: { status: reference.status, elapsedMs: reference.elapsedMs, title: title(reference.body), semanticSignature: normalizeHtmlSignature(reference.body) },
      signatureEqual: normalizeHtmlSignature(candidate.body) === normalizeHtmlSignature(reference.body),
      note: 'Signature mismatch is evidence, not automatic failure; browser replay/visual parity decides UX equivalence.'
    });
  }
  const report = { schemaVersion: 2, generatedAt: new Date().toISOString(), ok: results.every(x => x.ok), results };
  writeJson(path.join(REPORT_DIR, 'compare-latest.json'), report);
  recordEvidence('compare', report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
  return report;
}
function gitSha() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim(); }
  catch { return 'unknown'; }
}
function recordEvidence(kind, payload) {
  appendJsonl(EVIDENCE_LEDGER, { at: new Date().toISOString(), kind, commit: gitSha(), ok: payload?.ok ?? null, summary: compactSummary(payload) });
}
function compactSummary(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  if (Array.isArray(payload.results)) return payload.results.map(x => ({ slot: x.slot, ok: x.ok, skipped: x.skipped, buildSha: x.buildSha }));
  return { errors: payload.errors || undefined, configured: payload.configured || undefined };
}
function updateLastGreen(report) {
  const state = readJson(LAST_GREEN, { schemaVersion: 1, navigator: null, sandbox: null });
  for (const result of report.results || []) {
    if (!result.ok || result.skipped) continue;
    state[result.slot] = { at: report.generatedAt, commit: report.commit, url: result.url, buildSha: result.buildSha, latencyMs: result.latencyMs };
  }
  writeJson(LAST_GREEN, state);
}
function envContract() {
  const config = loadConfig();
  const values = Object.fromEntries([...REQUIRED_ENV, ...OPTIONAL_SHARED_ENV].map(k => [k, process.env[k] ? 'present' : 'missing']));
  const aliases = {
    supabaseUrl: Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabasePublicKey: Boolean(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    sentry: Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
    posthog: Boolean(process.env.POSTHOG_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY)
  };
  const errors = [];
  if (process.env.WORLD_SLOT && !config.slots[process.env.WORLD_SLOT]) errors.push(`WORLD_SLOT invalid: ${process.env.WORLD_SLOT}`);
  if (process.env.WORLD_SLOT_ENTRYPOINT && /^https?:\/\//i.test(process.env.WORLD_SLOT_ENTRYPOINT)) errors.push('WORLD_SLOT_ENTRYPOINT must be a local route');
  const result = { ok: errors.length === 0, values, aliases, errors, note: 'Only presence is recorded; secret values are never emitted.' };
  writeJson(path.join(REPORT_DIR, 'env-contract-latest.json'), result);
  recordEvidence('env-contract', result);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
  return result;
}
function setEnvKeys(target, csv) {
  const allowed = ['google-navigator', 'google-sandbox', 'vercel-reference'];
  if (!allowed.includes(target)) throw new Error(`Unknown env-key target ${target}`);
  const state = readJson(PLATFORM_ENV_KEYS, { schemaVersion: 1, targets: {} });
  state.targets[target] = [...new Set(String(csv).split(',').map(x => x.trim()).filter(Boolean))].sort();
  writeJson(PLATFORM_ENV_KEYS, state);
  console.log(JSON.stringify({ ok: true, target, count: state.targets[target].length, keys: state.targets[target] }, null, 2));
  return state;
}
function envParity() {
  const state = readJson(PLATFORM_ENV_KEYS, { schemaVersion: 1, targets: {} });
  const targets = state.targets || {};
  const nav = new Set(targets['google-navigator'] || []);
  const sand = new Set(targets['google-sandbox'] || []);
  const ref = new Set(targets['vercel-reference'] || []);
  const criticalAliases = [
    ['SUPABASE_URL','NEXT_PUBLIC_SUPABASE_URL'],
    ['SUPABASE_PUBLISHABLE_KEY','NEXT_PUBLIC_SUPABASE_ANON_KEY']
  ];
  const hasAlias = (set, aliases) => aliases.some(k => set.has(k));
  const errors = [];
  if (!nav.size || !sand.size) errors.push('Google navigator/sandbox env key inventories are not both recorded');
  for (const aliases of criticalAliases) {
    if (nav.size && !hasAlias(nav, aliases)) errors.push(`google-navigator missing one of: ${aliases.join(',')}`);
    if (sand.size && !hasAlias(sand, aliases)) errors.push(`google-sandbox missing one of: ${aliases.join(',')}`);
  }
  const sharedGoogle = [...nav].filter(k => sand.has(k)).sort();
  const onlyNavigator = [...nav].filter(k => !sand.has(k)).sort();
  const onlySandbox = [...sand].filter(k => !nav.has(k)).sort();
  const referenceMissingInGoogle = ref.size ? [...ref].filter(k => !nav.has(k) && !sand.has(k)).sort() : [];
  const result = {
    ok: errors.length === 0,
    errors,
    counts: { navigator: nav.size, sandbox: sand.size, vercelReference: ref.size },
    sharedGoogle,
    onlyNavigator,
    onlySandbox,
    referenceMissingInGoogle,
    note: 'Compares key NAMES only; values/secrets are never stored.'
  };
  writeJson(path.join(REPORT_DIR, 'env-parity-latest.json'), result);
  recordEvidence('env-parity', result);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
  return result;
}
function quotaGuard() {
  const config = loadConfig();
  const configured = Object.values(config.slots).filter(x => x.url).length;
  const reported = process.env.WORLD_GOOGLE_ACTIVE_APP_COUNT ? Number(process.env.WORLD_GOOGLE_ACTIVE_APP_COUNT) : null;
  const usagePairs = [
    ['requests', 'WORLD_GOOGLE_REQUESTS_CURRENT', 'WORLD_GOOGLE_REQUESTS_LIMIT'],
    ['cpuSeconds', 'WORLD_GOOGLE_CPU_SECONDS_CURRENT', 'WORLD_GOOGLE_CPU_SECONDS_LIMIT']
  ];
  const usage = {};
  const warnings = [];
  const errors = [];
  if (configured > 2) errors.push(`configured slot count ${configured} exceeds 2`);
  if (reported != null && Number.isFinite(reported) && reported > 2) errors.push(`platform reports ${reported} active apps; maximum is 2`);
  for (const [name, curKey, limKey] of usagePairs) {
    const current = process.env[curKey] ? Number(process.env[curKey]) : null;
    const limit = process.env[limKey] ? Number(process.env[limKey]) : null;
    const ratio = current != null && limit ? current / limit : null;
    usage[name] = { current, limit, ratio };
    if (ratio != null && ratio >= 0.85) warnings.push(`${name} usage is ${Math.round(ratio*100)}% of configured limit`);
  }
  const result = { ok: errors.length === 0, configuredSlots: configured, reportedActiveApps: reported, usage, warnings, errors };
  writeJson(path.join(REPORT_DIR, 'quota-guard-latest.json'), result);
  recordEvidence('quota-guard', result);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
  return result;
}
function fsGuard() {
  const allowed = [
    /^\.world\//,
    /^test\//,
    /^e2e\//,
    /^scripts\//,
    /^google-ai-studio\//,
    /^logs\//,
    /^tmp\//,
    /^coverage\//
  ];
  const riskyPatterns = [
    /writeFileSync\s*\(\s*['"`]\/?(?:data|state|users|worlds|sessions)\//i,
    /createWriteStream\s*\(\s*['"`]\/?(?:data|state|users|worlds|sessions)\//i,
    /appendFileSync\s*\(\s*['"`]\/?(?:data|state|users|worlds|sessions)\//i
  ];
  const findings = [];
  const files = [];
  function visit(dir, depth = 0) {
    if (depth > 6) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (['node_modules','.git','.world','.next','dist','build','coverage'].includes(e.name)) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) visit(abs, depth + 1);
      else if (/\.(?:c?js|mjs|ts|tsx|jsx)$/.test(e.name)) files.push(abs);
    }
  }
  visit(ROOT);
  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    if (allowed.some(rx => rx.test(rel))) continue;
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    for (const rx of riskyPatterns) if (rx.test(text)) findings.push({ file: rel, pattern: String(rx) });
  }
  const result = { ok: findings.length === 0, scannedFiles: files.length, findings, note: 'Heuristic guard: durable application state must remain in Supabase/shared services, not Cloud Run disk.' };
  writeJson(path.join(REPORT_DIR, 'filesystem-guard-latest.json'), result);
  recordEvidence('filesystem-guard', result);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
  return result;
}
function classifyFailure(check) {
  const id = check.id || 'unknown';
  if (/public-access|https/.test(id)) return 'ACCESS_OR_TLS';
  if (/health|ready|root-http/.test(id)) return 'RUNTIME_OR_ENTRYPOINT';
  if (/slot-identity|independent-runtime/.test(id)) return 'SLOT_CONFIGURATION';
  if (/budget/.test(id)) return 'PERFORMANCE_REGRESSION';
  if (/correlation|csp|header|referrer/.test(id)) return 'OBSERVABILITY_OR_SECURITY';
  return 'UNKNOWN';
}
function diagnose() {
  const verifyReport = readJson(path.join(REPORT_DIR, 'latest.json'), null);
  const compareReport = readJson(path.join(REPORT_DIR, 'compare-latest.json'), null);
  if (!verifyReport) throw new Error('No verification report. Run verify first.');
  const failures = [];
  for (const r of verifyReport.results || []) for (const c of r.checks || []) if (!c.ok) failures.push({ slot: r.slot, ...c, class: classifyFailure(c) });
  if (compareReport && !compareReport.ok) failures.push({ slot: 'cross-runtime', id: 'reference-compare', ok: false, class: 'REFERENCE_PARITY', detail: 'Candidate/reference HTTP comparison failed' });
  const result = {
    ok: failures.length === 0,
    failures,
    recommendedActions: [...new Set(failures.map(f => ({
      ACCESS_OR_TLS: 'Make deployment public, remove auth wall, verify HTTPS URL.',
      RUNTIME_OR_ENTRYPOINT: 'Inspect Cloud Run logs, WORLD_SLOT_ENTRYPOINT and server child readiness.',
      SLOT_CONFIGURATION: 'Fix WORLD_SLOT/entrypoint and remove remote proxy from navigator.',
      PERFORMANCE_REGRESSION: 'Compare last-green latency, inspect cold start/assets/API timing, then optimize without lowering graphics quality.',
      OBSERVABILITY_OR_SECURITY: 'Restore wrapper security/correlation headers and trace propagation.',
      REFERENCE_PARITY: 'Run browser replay/visual parity and inspect route/config drift.',
      UNKNOWN: 'Inspect latest evidence and add a regression test before retry.'
    }[f.class])))],
    repairLoop: 'fix root cause -> add regression test -> redeploy same slot -> guard -> verify -> compare -> promotion-gate'
  };
  writeJson(path.join(REPORT_DIR, 'diagnosis-latest.json'), result);
  recordEvidence('diagnose', result);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 2;
  return result;
}
function learnIssue(code, cause, fix, regression = '') {
  const db = readJson(KNOWN_ISSUES, { schemaVersion: 2, issues: [] });
  const existing = db.issues.find(x => x.code === code);
  const item = { code, cause, fix, regression: regression || null, updatedAt: new Date().toISOString(), occurrences: (existing?.occurrences || 0) + 1 };
  if (existing) Object.assign(existing, item); else db.issues.push(item);
  writeJson(KNOWN_ISSUES, db);
  recordEvidence('known-issue', { ok: true, code });
  console.log(JSON.stringify({ ok: true, issue: item }, null, 2));
  return item;
}
function promotionGate() {
  const config = loadConfig();
  const verifyReport = readJson(path.join(REPORT_DIR, 'latest.json'), null);
  const compareReport = readJson(path.join(REPORT_DIR, 'compare-latest.json'), null);
  const lastGreen = readJson(LAST_GREEN, { navigator: null, sandbox: null });
  const errors = [];
  if (!verifyReport) errors.push('missing verify report');
  const sandbox = verifyReport?.results?.find(x => x.slot === 'sandbox');
  if (!sandbox?.ok || sandbox?.skipped) errors.push('sandbox is not verified green');
  if (config.policy.promotionRequiresReferenceComparison && (!compareReport || !compareReport.ok)) errors.push('reference comparison is not green');
  if (!lastGreen.sandbox) errors.push('sandbox has no last-green evidence');
  const result = {
    ok: errors.length === 0,
    action: errors.length ? 'BLOCK_PROMOTION' : 'PROMOTION_ALLOWED',
    errors,
    sandboxBuildSha: sandbox?.buildSha || null,
    lastGreen: lastGreen.sandbox || null,
    note: 'This command never creates a third slot. Promote by updating the existing navigator slot only.'
  };
  writeJson(path.join(REPORT_DIR, 'promotion-gate-latest.json'), result);
  recordEvidence('promotion-gate', result);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
  return result;
}
function rollbackPlan() {
  const lastGreen = readJson(LAST_GREEN, { navigator: null, sandbox: null });
  const latest = readJson(path.join(REPORT_DIR, 'latest.json'), null);
  const broken = (latest?.results || []).filter(x => !x.ok && !x.skipped).map(x => x.slot);
  const plan = broken.map(slot => ({
    slot,
    target: lastGreen[slot],
    action: lastGreen[slot]
      ? `Redeploy/update existing ${slot} slot to last-green build ${lastGreen[slot].buildSha || lastGreen[slot].commit}`
      : `No last-green build recorded for ${slot}; repair current deployment instead of deleting/recreating it.`
  }));
  const result = { ok: broken.length === 0 || plan.every(x => x.target), broken, plan, neverCreateThirdSlot: true };
  writeJson(path.join(REPORT_DIR, 'rollback-plan-latest.json'), result);
  recordEvidence('rollback-plan', result);
  console.log(JSON.stringify(result, null, 2));
  return result;
}
function readinessScore() {
  const verifyReport = readJson(path.join(REPORT_DIR, 'latest.json'), {});
  const compareReport = readJson(path.join(REPORT_DIR, 'compare-latest.json'), {});
  const verifyLive = Boolean(verifyReport?.ok) && Array.isArray(verifyReport.results) && verifyReport.results.length === 2 && verifyReport.results.every(x => x.ok && !x.skipped);
  const compareLive = Boolean(compareReport?.ok) && Array.isArray(compareReport.results) && compareReport.results.some(x => !x.skipped) && compareReport.results.filter(x => !x.skipped).every(x => x.ok);
  const checks = {
    exactTwoSlotPolicy: validateConfig(loadConfig()).length === 0,
    sourceDiscovery: Boolean(readJson(path.join(STATE_DIR, 'source-discovery.json'), {})?.ok),
    liveVerifyBothSlots: verifyLive,
    liveReferenceCompare: compareLive,
    filesystemGuard: Boolean(readJson(path.join(REPORT_DIR, 'filesystem-guard-latest.json'), {})?.ok),
    envContract: Boolean(readJson(path.join(REPORT_DIR, 'env-contract-latest.json'), {})?.ok),
    envParity: Boolean(readJson(path.join(REPORT_DIR, 'env-parity-latest.json'), {})?.ok),
    quotaGuard: Boolean(readJson(path.join(REPORT_DIR, 'quota-guard-latest.json'), {})?.ok),
    promotionGate: Boolean(readJson(path.join(REPORT_DIR, 'promotion-gate-latest.json'), {})?.ok),
    lastGreenNavigator: Boolean(readJson(LAST_GREEN, {})?.navigator),
    lastGreenSandbox: Boolean(readJson(LAST_GREEN, {})?.sandbox)
  };
  const done = Object.values(checks).filter(Boolean).length;
  const score = Math.round(done / Object.keys(checks).length * 100);
  const result = { ok: score === 100, readinessPercent: score, checks, blockers: Object.entries(checks).filter(([,v]) => !v).map(([k]) => k) };
  writeJson(path.join(REPORT_DIR, 'readiness-score-latest.json'), result);
  recordEvidence('readiness-score', result);
  console.log(JSON.stringify(result, null, 2));
  return result;
}
async function fullGate({ allowUnconfigured = false } = {}) {
  const outputs = {};
  outputs.guard = guard();
  outputs.env = envContract();
  outputs.fs = fsGuard();
  outputs.quota = quotaGuard();
  outputs.verify = await verify({ allowUnconfigured });
  outputs.compare = await compare();
  if (!allowUnconfigured && outputs.verify?.ok) outputs.promotion = promotionGate();
  const ok = Object.values(outputs).filter(Boolean).every(x => x.ok !== false);
  const result = { ok, generatedAt: new Date().toISOString(), outputs: Object.fromEntries(Object.entries(outputs).map(([k,v]) => [k, v?.ok])) };
  writeJson(path.join(REPORT_DIR, 'full-gate-latest.json'), result);
  recordEvidence('full-gate', result);
  console.log(JSON.stringify(result, null, 2));
  if (!ok) process.exitCode = 1;
  return result;
}
function toolsPlan() {
  const result = {
    ok: true,
    reuseFirst: true,
    recommendedOptionalOpenSource: [
      { tool: 'Playwright', purpose: 'same replay across Google/Vercel, mobile/desktop device matrix, screenshots', installOnlyIfMissing: true },
      { tool: 'Lighthouse CI', purpose: 'continuous performance/accessibility/best-practice budgets', installOnlyIfMissing: true },
      { tool: 'Grafana k6', purpose: 'protocol + browser load/performance tests without changing app runtime', installOnlyIfMissing: true },
      { tool: 'Toxiproxy', purpose: 'deterministic network latency/drop/reconnect chaos in sandbox only', installOnlyIfMissing: true },
      { tool: 'OpenTelemetry JS', purpose: 'trace-context propagation across Node services; V3 already propagates W3C traceparent; reuse Sentry/PostHog if already sufficient', installOnlyIfMissing: true },
      { tool: 'Argos Translate / LibreTranslate', purpose: 'optional offline CPU translation fallback; do not install when Gemini or existing translation provider is sufficient', installOnlyIfMissing: true },
      { tool: 'Gemini 3.5 Live Translate', purpose: 'optional future low-latency voice translation; text chat must remain functional without it', installOnlyIfMissing: true }
    ],
    rule: 'Do not install a duplicate if World_server already has equivalent capability. Integrate into existing quality loop.'
  };
  writeJson(path.join(REPORT_DIR, 'tools-plan.json'), result);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

async function main() {
  const { pos, flags } = parseArgs(process.argv.slice(2));
  const cmd = pos.shift() || 'help';
  if (cmd === 'init') return init();
  if (cmd === 'guard') return guard();
  if (cmd === 'discover') return discover();
  if (cmd === 'configure') {
    if (pos.length !== 2) throw new Error('Usage: configure <navigator|sandbox> <https://...run.app>');
    return configure(pos[0], pos[1]);
  }
  if (cmd === 'set-entrypoint') {
    if (pos.length !== 2) throw new Error('Usage: set-entrypoint <navigator|sandbox> </path/>');
    if (/^https?:\/\//i.test(pos[1])) throw new Error('Entrypoint must be a local path. Remote URL belongs only to explicit migration bridge.');
    return setField(pos[0], 'entrypoint', pos[1]);
  }
  if (cmd === 'set-reference') {
    if (pos.length !== 2) throw new Error('Usage: set-reference <navigator|sandbox> <https://reference/>');
    new URL(pos[1]);
    return setField(pos[0], 'referenceUrl', pos[1]);
  }
  if (cmd === 'verify') return verify({ allowUnconfigured: flags.has('--allow-unconfigured') });
  if (cmd === 'compare') return compare();
  if (cmd === 'env-contract') return envContract();
  if (cmd === 'fs-guard') return fsGuard();
  if (cmd === 'set-env-keys') {
    if (pos.length !== 2) throw new Error('Usage: set-env-keys <google-navigator|google-sandbox|vercel-reference> <KEY1,KEY2,...>');
    return setEnvKeys(pos[0], pos[1]);
  }
  if (cmd === 'env-parity') return envParity();
  if (cmd === 'quota-guard') return quotaGuard();
  if (cmd === 'diagnose') return diagnose();
  if (cmd === 'learn') {
    if (pos.length < 3) throw new Error('Usage: learn <CODE> <CAUSE> <FIX> [REGRESSION_TEST]');
    return learnIssue(pos[0], pos[1], pos[2], pos[3] || '');
  }
  if (cmd === 'promotion-gate') return promotionGate();
  if (cmd === 'rollback-plan') return rollbackPlan();
  if (cmd === 'readiness') return readinessScore();
  if (cmd === 'full-gate') return fullGate({ allowUnconfigured: flags.has('--allow-unconfigured') });
  if (cmd === 'tools-plan') return toolsPlan();

  console.log(`World_server Google AI Studio 2-slot controller V3\n\nCommands:\n  init\n  discover\n  guard\n  configure <navigator|sandbox> <https://...run.app>\n  set-entrypoint <navigator|sandbox> </local/path/>\n  set-reference <navigator|sandbox> <https://reference/>\n  verify [--allow-unconfigured]\n  compare\n  env-contract\n  fs-guard\n  set-env-keys <google-navigator|google-sandbox|vercel-reference> <KEY1,KEY2,...>\n  env-parity\n  quota-guard\n  diagnose\n  learn <CODE> <CAUSE> <FIX> [REGRESSION_TEST]\n  promotion-gate\n  rollback-plan\n  readiness\n  full-gate [--allow-unconfigured]\n  tools-plan\n`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(JSON.stringify({ ok: false, error: error.stack || error.message }, null, 2));
    process.exit(1);
  });
}

module.exports = {
  defaultConfig,
  validateConfig,
  verifySlot,
  authWall,
  normalizeHtmlSignature,
  classifyFailure,
  compactSummary
};
