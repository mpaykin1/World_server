#!/usr/bin/env node
'use strict';
// ANYTHINGLLM_HEALTH_CHECK
//
// Lightweight liveness check for the AnythingLLM <-> Ollama <-> World_server(sandbox)
// integration path. Deliberately does NOT invoke any LLM (no /chat call) — every probe
// here is a cheap HTTP GET or a filesystem stat, same discipline as
// openhuman-local-access-check.js's CONFIGURED-vs-UI_VERIFIED split: this check answers
// "is the plumbing up" fast and safely; actual task quality is a separate, slower E2E
// check (openhuman-local-chat-e2e-check.js's sibling for AnythingLLM, not this file).
const fs = require('fs');
const path = require('path');
const { resolveMainTreeRoot } = require('../lib/world-server-paths');

const ANYTHINGLLM_URL = process.env.ANYTHINGLLM_URL || 'http://127.0.0.1:3001';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const ANYTHINGLLM_API_KEY = process.env.ANYTHINGLLM_API_KEY || null;
const MCP_CONFIG_PATH = path.join(
  process.env.APPDATA || '',
  'anythingllm-desktop', 'storage', 'plugins', 'anythingllm_mcp_servers.json',
);
const BACKEND_LOG_DIR = path.join(
  process.env.APPDATA || '',
  'anythingllm-desktop', 'storage', 'logs',
);
const OPENHUMAN_EXE = 'C:\\Program Files\\OpenHuman\\OpenHuman.exe';
// Any path under a directory named exactly "World_server" (not "World_server AI",
// "World_server_openhuman2", etc.) is the real working tree — never the target for a
// filesystem MCP grant. The sandbox worktree lives outside that tree entirely.
const MAIN_WORLD_SERVER_ROOT = resolveMainTreeRoot();
const SECRET_MARKERS = ['.env.local', 'WORLD_SERVER_SECRETS'];

async function fetchJson(url, opts = {}, timeoutMs = 3000) {
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
    let body = null;
    try { body = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: null, error: e.message };
  }
}

async function checkAnythingLLM() {
  const ping = await fetchJson(`${ANYTHINGLLM_URL}/api/ping`);
  if (!ping.ok) return { up: false, authenticated: null, reason: `ping failed: ${ping.error || ping.status}` };
  if (!ANYTHINGLLM_API_KEY) return { up: true, authenticated: null, reason: 'ANYTHINGLLM_API_KEY not set in env — skipped auth probe' };
  const auth = await fetchJson(`${ANYTHINGLLM_URL}/api/v1/auth`, {
    headers: { Authorization: `Bearer ${ANYTHINGLLM_API_KEY}` },
  });
  return { up: true, authenticated: !!(auth.ok && auth.body && auth.body.authenticated) };
}

async function checkOllama() {
  const tags = await fetchJson(`${OLLAMA_URL}/api/tags`);
  if (!tags.ok) return { up: false, models: [] };
  const models = (tags.body && tags.body.models || []).map((m) => m.name);
  return { up: true, models };
}

async function checkWorkspace() {
  if (!ANYTHINGLLM_API_KEY) return { status: 'NOT_VERIFIED', reason: 'ANYTHINGLLM_API_KEY not set in env' };
  const r = await fetchJson(`${ANYTHINGLLM_URL}/api/v1/workspaces`, {
    headers: { Authorization: `Bearer ${ANYTHINGLLM_API_KEY}` },
  });
  if (!r.ok) return { status: 'FAIL', reason: r.error || r.status };
  const workspaces = (r.body && r.body.workspaces || []).map((w) => ({ slug: w.slug, threads: (w.threads || []).length }));
  return { status: workspaces.length ? 'PRESENT' : 'EMPTY', workspaces };
}

function checkMcpFilesystemConfig(configPath = MCP_CONFIG_PATH) {
  if (!fs.existsSync(configPath)) return { configured: false, reason: 'no anythingllm_mcp_servers.json' };
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) { return { configured: false, reason: `invalid JSON: ${e.message}` }; }
  const servers = cfg.mcpServers || {};
  const names = Object.keys(servers);
  const scopes = names.map((name) => {
    const args = servers[name].args || [];
    const scopedPath = args[args.length - 1] || null;
    // Guard: flag (do not silently pass) any filesystem MCP server whose scoped path is the
    // main World_server tree itself rather than an isolated sandbox worktree/copy.
    const targetsMainTree = scopedPath && path.resolve(scopedPath) === path.resolve(MAIN_WORLD_SERVER_ROOT);
    return { name, scopedPath, targetsMainTree };
  });
  const unsafe = scopes.filter((s) => s.targetsMainTree);
  return { configured: names.length > 0, servers: scopes, unsafeMainTreeGrant: unsafe.length > 0, unsafe };
}

function checkSecretGuard(configPath = MCP_CONFIG_PATH) {
  const mcp = checkMcpFilesystemConfig(configPath);
  if (!mcp.configured) return { status: 'N/A', reason: 'no filesystem MCP server configured' };
  const results = [];
  for (const s of mcp.servers) {
    if (!s.scopedPath || !fs.existsSync(s.scopedPath)) { results.push({ server: s.name, status: 'PATH_MISSING' }); continue; }
    const foundSecrets = [];
    for (const marker of SECRET_MARKERS) {
      if (fs.existsSync(path.join(s.scopedPath, marker))) foundSecrets.push(marker);
    }
    results.push({ server: s.name, scopedPath: s.scopedPath, foundSecrets, status: foundSecrets.length ? 'FAIL_SECRET_PRESENT' : 'PASS_NO_SECRETS' });
  }
  const status = results.every((r) => r.status === 'PASS_NO_SECRETS') ? 'PASS' : results.some((r) => r.status === 'FAIL_SECRET_PRESENT') ? 'FAIL' : 'UNKNOWN';
  return { status, results };
}

function checkSelectiveToolEvidence() {
  // Cheap static check: was IntelligentSkillSelector's tool-count line ever observed in the
  // most recent backend log. This is evidence a real agent turn ran with a bounded tool set,
  // not a live re-test (that requires an LLM call — out of scope for this fast health check).
  try {
    const files = fs.readdirSync(BACKEND_LOG_DIR).filter((f) => f.startsWith('backend-')).sort();
    if (!files.length) return { status: 'NOT_VERIFIED', reason: 'no backend log files found' };
    const latest = path.join(BACKEND_LOG_DIR, files[files.length - 1]);
    const text = fs.readFileSync(latest, 'utf8');
    const matches = [...text.matchAll(/\[IntelligentSkillSelector\][^\n]*/g)].map((m) => m[0]);
    if (!matches.length) return { status: 'NOT_VERIFIED', reason: 'no IntelligentSkillSelector log lines in latest backend log', logFile: latest };
    return { status: 'EVIDENCE_FOUND', logFile: latest, lastLine: matches[matches.length - 1], occurrences: matches.length };
  } catch (e) {
    return { status: 'NOT_VERIFIED', reason: e.message };
  }
}

function checkOpenHumanPath() {
  return { executableExists: fs.existsSync(OPENHUMAN_EXE), path: OPENHUMAN_EXE };
}

async function run() {
  const [anythingllm, ollama, workspace] = await Promise.all([
    checkAnythingLLM(), checkOllama(), checkWorkspace(),
  ]);
  const mcp = checkMcpFilesystemConfig();
  const secretGuard = checkSecretGuard();
  const selectiveTools = checkSelectiveToolEvidence();
  const openhuman = checkOpenHumanPath();

  const criticalChecks = [
    anythingllm.up, ollama.up, mcp.configured, !mcp.unsafeMainTreeGrant,
    secretGuard.status !== 'FAIL',
  ];
  const status = criticalChecks.every(Boolean) ? 'PASS' : 'FAIL';

  const report = {
    test: 'ANYTHINGLLM_HEALTH_CHECK',
    generatedAt: new Date().toISOString(),
    status,
    anythingllm,
    ollama,
    workspace,
    mcpFilesystem: mcp,
    secretGuard,
    selectiveTools,
    openhuman,
    note: 'No LLM was invoked to produce this report (all probes are ping/auth/list/fs-stat). unsafeMainTreeGrant=true is a hard FAIL regardless of other checks — it means a filesystem MCP server is scoped to the live World_server tree instead of an isolated sandbox.',
  };
  fs.writeFileSync(path.join(__dirname, '..', 'ANYTHINGLLM_HEALTH_CHECK.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (require.main === module) {
  run().then((r) => {
    console.log(`[ANYTHINGLLM_HEALTH_CHECK] status=${r.status} anythingllm=${r.anythingllm.up ? 'UP' : 'DOWN'} ollama=${r.ollama.up ? 'UP' : 'DOWN'} mcp=${r.mcpFilesystem.configured ? 'CONFIGURED' : 'MISSING'} secretGuard=${r.secretGuard.status} unsafeMainTreeGrant=${r.mcpFilesystem.unsafeMainTreeGrant}`);
    if (r.status !== 'PASS') process.exitCode = 1;
  }).catch((e) => { console.error(e); process.exitCode = 1; });
}

module.exports = { run, checkMcpFilesystemConfig, checkSecretGuard, MAIN_WORLD_SERVER_ROOT, SECRET_MARKERS };
