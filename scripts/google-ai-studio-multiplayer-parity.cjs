'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = process.env.WORLD_REPO_ROOT ? path.resolve(process.env.WORLD_REPO_ROOT) : path.resolve(__dirname, '..');
const REPORT = path.join(ROOT, '.world', 'google-ai-studio', 'reports', 'multiplayer-parity-latest.json');
const required = process.argv.includes('--require');
function write(v) { fs.mkdirSync(path.dirname(REPORT), { recursive: true }); fs.writeFileSync(REPORT, JSON.stringify(v, null, 2) + '\n'); console.log(JSON.stringify(v, null, 2)); }
async function getJson(base, probePath, session) {
  const url = new URL(probePath, base);
  url.searchParams.set('paritySession', session);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'x-world-parity-session': session } });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text: text.slice(0, 1000) };
  } finally { clearTimeout(timer); }
}
async function main() {
  const nav = process.env.GOOGLE_NAVIGATOR_URL || '';
  const sandbox = process.env.GOOGLE_SANDBOX_URL || '';
  const probePath = process.env.WORLD_MULTIPLAYER_PROBE_PATH || '';
  if (!nav || !sandbox || !probePath) {
    const out = { ok: !required, skipped: true, reason: 'Set GOOGLE_NAVIGATOR_URL, GOOGLE_SANDBOX_URL and WORLD_MULTIPLAYER_PROBE_PATH to a real app endpoint that returns shared-world parity data.' };
    write(out); if (required) process.exitCode = 2; return;
  }
  const session = crypto.randomUUID();
  const [a,b] = await Promise.all([getJson(nav, probePath, session), getJson(sandbox, probePath, session)]);
  const fields = (process.env.WORLD_MULTIPLAYER_COMPARE_FIELDS || 'worldId,stateHash').split(',').map(x => x.trim()).filter(Boolean);
  const comparisons = fields.map(field => ({ field, navigator: a.json?.[field], sandbox: b.json?.[field], equal: a.json?.[field] != null && a.json?.[field] === b.json?.[field] }));
  const out = { schemaVersion: 1, generatedAt: new Date().toISOString(), session, ok: a.status < 500 && b.status < 500 && comparisons.every(x => x.equal), probePath, comparisons, statuses: { navigator: a.status, sandbox: b.status } };
  write(out); if (!out.ok) process.exitCode = 1;
}
main().catch(e => { write({ ok:false, error:e.message }); process.exit(1); });
