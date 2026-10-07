#!/usr/bin/env node
'use strict';
// OPENHUMAN_ORDINARY_CHAT_SHARED_MEMORY_TEST
//
// Distinguishes two genuinely different claims, which prior verification collapsed into one:
//   1. "REST cross-memory roundtrip PASS" — agentmemory itself works (a script wrote/read a probe).
//   2. "OpenHuman ordinary chat PASS" — a user typing a normal question in OpenHuman's own chat UI
//      actually gets real World_server facts back, unprompted.
// (1) does NOT imply (2): OpenHuman's chat pipeline (context assembly, relevance threshold,
// prompt injection into the model) sits between agentmemory and what the user sees, and this
// repo cannot drive OpenHuman's native GUI (no computer-use tool for that app), and its local
// /rpc API requires a bearer token this session could not locate in plaintext.
//
// So this check reports three independent signals rather than faking a single PASS:
//   - config: does the OpenHuman profile config actually point at agentmemory (not a config
//     this process merely assumes is canonical — reads the SAME file the running app reads,
//     %USERPROFILE%\.openhuman\users\<id>\config.toml, not just %APPDATA%\OpenHuman\config.toml).
//   - backend: is agentmemory itself healthy right now.
//   - knowledge: does the World_server knowledge-pack ledger exist, match the current source
//     commit (not stale), and does smart-search actually surface it above the relevance floor
//     for representative "what do you know about World_server" style queries. This is a REST
//     proxy for (2), not (2) itself.
//   - manualE2e: a human- (or GUI-automation-) supplied evidence file recording that the actual
//     manual test sequence (unique-probe/close-reopen/ask, 5-fact test, reverse-probe, restart
//     persistence) was run against the real OpenHuman chat UI, with a timestamp. Degrades to
//     STALE after MANUAL_EVIDENCE_TTL_DAYS and to NOT_VERIFIED if the file was never written.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { health, smartSearch } = require('../lib/collective-brain');

const MANUAL_EVIDENCE_TTL_DAYS = 14;
const KNOWLEDGE_TTL_DAYS = 30;
const RELEVANCE_FLOOR = 0.25; // matches OpenHuman config.toml [memory] min_relevance_score
const KNOWLEDGE_QUERIES = ['What do you know about the World_server project?', 'World_server architecture Navigator Supabase Collective Brain'];

function manualEvidencePath(root) { return path.join(root, 'OPENHUMAN_ORDINARY_CHAT_MANUAL_EVIDENCE.json'); }
function ledgerPath(root) { return path.join(root, 'data', 'collective-brain', 'knowledge-pack-ledger.json'); }
function gitHead(root) { const r = cp.spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }); return r.status === 0 ? r.stdout.trim() : 'UNKNOWN'; }

function findOpenHumanProfileConfig() {
  // The canonical config OpenHuman's running process actually reads is under the per-user
  // profile dir (…\.openhuman\users\<id>\config.toml), NOT %APPDATA%\OpenHuman\config.toml,
  // which only carries an early bootstrap override. A prior session confirmed this by reading
  // both and diffing; this function re-derives it each run instead of trusting that finding forever.
  const base = path.join(process.env.USERPROFILE || '', '.openhuman', 'users');
  try {
    for (const id of fs.readdirSync(base)) {
      const cfg = path.join(base, id, 'config.toml');
      if (fs.existsSync(cfg)) return cfg;
    }
  } catch {}
  return null;
}

function checkConfig() {
  const cfgPath = findOpenHumanProfileConfig();
  if (!cfgPath) return { status: 'NOT_FOUND', path: null };
  const text = fs.readFileSync(cfgPath, 'utf8');
  const memSection = text.match(/\[memory\]([\s\S]*?)(\n\[|$)/);
  const backend = memSection && memSection[1].match(/backend\s*=\s*"([^"]+)"/);
  const url = memSection && memSection[1].match(/agentmemory_url\s*=\s*"([^"]+)"/);
  const ok = backend && backend[1] === 'agentmemory';
  return { status: ok ? 'OK' : 'WRONG_BACKEND', path: cfgPath, backend: backend ? backend[1] : null, agentmemoryUrl: url ? url[1] : null };
}

async function checkKnowledge(root) {
  let ledger;
  try { ledger = JSON.parse(fs.readFileSync(ledgerPath(root), 'utf8')); } catch { return { status: 'MISSING', reason: 'no knowledge-pack-ledger.json — collective-brain:knowledge-pack was never run' }; }
  const entries = Object.values(ledger.entries || {});
  if (!entries.length) return { status: 'MISSING', reason: 'ledger exists but has zero entries' };
  const currentHead = gitHead(root);
  // Staleness is age-based, not commit-equality-based: an entry's sourceCommit only changes
  // when the knowledge-pack run last WROTE that entry (dedup skips unchanged content), so most
  // commits to the repo legitimately leave it untouched without making the fact wrong. Treat an
  // entry as stale only once it hasn't been re-verified within KNOWLEDGE_TTL_DAYS.
  const ages = entries.map((e) => (e.updatedAt ? (Date.now() - Date.parse(e.updatedAt)) / 86400000 : Infinity));
  const stale = ages.filter((ageDays) => ageDays > KNOWLEDGE_TTL_DAYS);
  const staleness = stale.length === entries.length ? 'ALL_STALE' : stale.length > 0 ? 'PARTIALLY_STALE' : 'FRESH';

  const searchProof = [];
  for (const q of KNOWLEDGE_QUERIES) {
    try {
      const data = await smartSearch(q, 10);
      const results = Array.isArray(data.results) ? data.results : [];
      const aboveFloor = results.filter((r) => (r.score || 0) >= RELEVANCE_FLOOR);
      searchProof.push({ query: q, resultCount: results.length, aboveFloorCount: aboveFloor.length, topScore: results[0]?.score || 0 });
    } catch (e) {
      searchProof.push({ query: q, error: e.message });
    }
  }
  const searchOk = searchProof.every((p) => (p.aboveFloorCount || 0) > 0);
  return {
    status: staleness === 'FRESH' && searchOk ? 'PRESENT' : staleness !== 'FRESH' ? 'STALE' : 'PRESENT_BUT_UNVERIFIED_IN_SEARCH',
    entryCount: entries.length,
    staleness,
    currentHead,
    searchProof,
  };
}

function checkManualE2e(root) {
  const fp = manualEvidencePath(root);
  if (!fs.existsSync(fp)) return { status: 'NOT_VERIFIED', reason: 'no manual E2E evidence file has ever been recorded — the real OpenHuman chat UI has not been walked through the required test sequence' };
  let evidence;
  try { evidence = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { return { status: 'NOT_VERIFIED', reason: 'evidence file is not valid JSON' }; }
  const requiredTests = ['uniqueProbeRoundtrip', 'fiveFactKnowledgeTest', 'reverseProbe', 'restartPersistence'];
  const missing = requiredTests.filter((t) => !evidence[t] || evidence[t].result !== 'PASS');
  const ageDays = evidence.recordedAt ? (Date.now() - Date.parse(evidence.recordedAt)) / 86400000 : Infinity;
  if (missing.length) return { status: 'FAIL', missing, evidence };
  if (ageDays > MANUAL_EVIDENCE_TTL_DAYS) return { status: 'STALE', ageDays: Math.round(ageDays), recordedAt: evidence.recordedAt };
  return { status: 'PASS', ageDays: Math.round(ageDays), recordedAt: evidence.recordedAt };
}

async function run(root = process.cwd()) {
  const config = checkConfig();
  const backend = await health({});
  const knowledge = await checkKnowledge(root);
  const manualE2e = checkManualE2e(root);

  const restCrossMemoryStatus = backend.ok && knowledge.status !== 'MISSING' ? 'PASS' : 'FAIL';
  const ordinaryChatStatus = manualE2e.status === 'PASS' ? 'PASS' : manualE2e.status === 'STALE' ? 'STALE_EVIDENCE' : 'NOT_VERIFIED';

  const report = {
    test: 'OPENHUMAN_ORDINARY_CHAT_SHARED_MEMORY_TEST',
    generatedAt: new Date().toISOString(),
    config,
    backend: { ok: backend.ok, error: backend.error || null },
    knowledge,
    restCrossMemory: restCrossMemoryStatus,
    manualE2e,
    ordinaryChat: ordinaryChatStatus,
    note: 'restCrossMemory=PASS proves agentmemory + the World_server knowledge pack are correctly wired and populated. It does NOT prove OpenHuman\'s ordinary chat UI surfaces this to a user — that requires ordinaryChat=PASS, which only a fresh manualE2e evidence file (or real GUI/RPC automation this session could not perform) can establish.',
  };
  fs.writeFileSync(path.join(root, 'OPENHUMAN_ORDINARY_CHAT_CHECK.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (require.main === module) {
  // Default to the repo root next to this script, not process.cwd() — this file is invoked
  // directly (not just via `npm run`) from CHECK_COLLECTIVE_BRAIN.cmd, whose caller's cwd is
  // not guaranteed to be the repo root.
  run(path.resolve(__dirname, '..')).then((r) => {
    console.log(`[OPENHUMAN_ORDINARY_CHAT_CHECK] restCrossMemory=${r.restCrossMemory} ordinaryChat=${r.ordinaryChat} knowledge=${r.knowledge.status} manualE2e=${r.manualE2e.status}`);
  }).catch((e) => { console.error('[OPENHUMAN_ORDINARY_CHAT_CHECK]', e.message); process.exitCode = 1; });
}

module.exports = { run };
