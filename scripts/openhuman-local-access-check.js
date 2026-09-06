#!/usr/bin/env node
'use strict';
// OPENHUMAN_LOCAL_WORLD_SERVER_ACCESS_CHECK
//
// Separates two genuinely different claims, same discipline as
// openhuman-ordinary-chat-check.js's restCrossMemory vs ordinaryChat split:
//   - CONFIGURED: a mechanism exists (this session's launcher, or a persisted
//     action_dir_override) that WOULD point OpenHuman's action_dir at the live
//     local World_server checkout on next launch. Verifiable without touching
//     the running OpenHuman process.
//   - UI_VERIFIED: OpenHuman's ordinary chat actually read a live local file
//     (the OPENHUMAN_LOCAL_ACCESS_PROBE.txt probe) in a real session. Requires
//     a manual pass through the real GUI (or authenticated /rpc access this
//     session did not have) — never inferred from CONFIGURED alone.
const fs = require('fs');
const path = require('path');

const WORLD_SERVER_ROOT = 'C:\\Users\\user\\Desktop\\World_server';
// Desktop hygiene policy: all AI-created support tools live under "World_server AI",
// with a single canonical Desktop shortcut/launcher — see World_server AI\README_RU.txt.
// Older single-purpose launcher paths are kept as a fallback for one release cycle in case
// this check runs before a given machine's cleanup has happened.
const LAUNCHER_CMD_CANDIDATES = [
  'C:\\Users\\user\\Desktop\\World_server AI\\Launchers\\WORLD_SERVER_AI.cmd',
  'C:\\Users\\user\\Desktop\\World_server AI\\Launchers\\OPENHUMAN_WORLD_SERVER.cmd',
  'C:\\Users\\user\\Desktop\\OPENHUMAN_WORLD_SERVER.cmd',
];
const LAUNCHER_LNK_CANDIDATES = [
  'C:\\Users\\user\\Desktop\\World_server AI.lnk',
  'C:\\Users\\user\\Desktop\\OpenHuman World_server.lnk',
];
const PROBE_FILE = path.join(WORLD_SERVER_ROOT, 'OPENHUMAN_LOCAL_ACCESS_PROBE.txt');
const MANUAL_EVIDENCE_FILE = path.join(WORLD_SERVER_ROOT, 'OPENHUMAN_LOCAL_ACCESS_MANUAL_EVIDENCE.json');
const MANUAL_EVIDENCE_TTL_DAYS = 14;

function fileSetsActionDir(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    // Matches both `set "OPENHUMAN_ACTION_DIR=...` (.cmd) and `$env:OPENHUMAN_ACTION_DIR = '...` (.ps1).
    return new RegExp(`OPENHUMAN_ACTION_DIR['"]?\\s*=\\s*['"]?${WORLD_SERVER_ROOT.replace(/\\/g, '\\\\')}`, 'i').test(text);
  } catch { return false; }
}

function checkLauncher() {
  const cmdPath = LAUNCHER_CMD_CANDIDATES.find((p) => fs.existsSync(p)) || null;
  const lnkPath = LAUNCHER_LNK_CANDIDATES.find((p) => fs.existsSync(p)) || null;
  let cmdSetsActionDir = false;
  if (cmdPath) {
    cmdSetsActionDir = fileSetsActionDir(cmdPath);
    // The canonical launcher delegates to a sibling .ps1 (kept small/testable rather than a
    // giant single-line cmd -Command string) — check every file in that directory too.
    if (!cmdSetsActionDir) {
      const dir = path.dirname(cmdPath);
      try {
        cmdSetsActionDir = fs.readdirSync(dir)
          .filter((f) => f.endsWith('.cmd') || f.endsWith('.ps1'))
          .some((f) => fileSetsActionDir(path.join(dir, f)));
      } catch {}
    }
  }
  return { cmdExists: !!cmdPath, cmdPath, lnkExists: !!lnkPath, lnkPath, cmdSetsActionDir };
}

function checkPersistedOverride() {
  // action_dir is NOT currently a key in either known OpenHuman config.toml (confirmed by
  // direct read this session) — action_dir_source defaults to "default" until either
  // OPENHUMAN_ACTION_DIR (env) or a persisted override (via Settings / config_update_agent_paths
  // RPC) is set. This function only reports what's on disk; it does not call the running
  // OpenHuman process's RPC (no bearer token available, and doing so live is out of scope for
  // a read-only check anyway).
  const candidates = [
    path.join(process.env.USERPROFILE || '', '.openhuman', 'users'),
  ];
  let found = null;
  try {
    const usersDir = candidates[0];
    for (const id of fs.readdirSync(usersDir)) {
      const cfg = path.join(usersDir, id, 'config.toml');
      if (fs.existsSync(cfg)) {
        const text = fs.readFileSync(cfg, 'utf8');
        const m = text.match(/^action_dir\s*=\s*"([^"]*)"/m);
        if (m) { found = { configPath: cfg, actionDir: m[1] }; break; }
      }
    }
  } catch {}
  return found;
}

function checkManualEvidence() {
  if (!fs.existsSync(MANUAL_EVIDENCE_FILE)) {
    return { status: 'NOT_VERIFIED', reason: 'no manual evidence file — the real OpenHuman ordinary chat UI has not been asked to read OPENHUMAN_LOCAL_ACCESS_PROBE.txt yet' };
  }
  let evidence;
  try { evidence = JSON.parse(fs.readFileSync(MANUAL_EVIDENCE_FILE, 'utf8')); } catch { return { status: 'NOT_VERIFIED', reason: 'evidence file is not valid JSON' }; }
  // Real PASS requires the actual value read by OpenHuman to match the expected probe value,
  // not just a top-level result:"PASS" flag someone could set without a real match.
  const valuesMatch = evidence.expectedValue && evidence.actualValue && evidence.expectedValue === evidence.actualValue;
  if (evidence.result !== 'PASS' || !valuesMatch) return { status: 'FAIL', evidence };
  const ageDays = evidence.recordedAt ? (Date.now() - Date.parse(evidence.recordedAt)) / 86400000 : Infinity;
  if (ageDays > MANUAL_EVIDENCE_TTL_DAYS) return { status: 'STALE', ageDays: Math.round(ageDays) };
  return { status: 'PASS', ageDays: Math.round(ageDays), probeValue: evidence.actualValue };
}

function run() {
  const launcher = checkLauncher();
  const persisted = checkPersistedOverride();
  const configured = (launcher.cmdExists && launcher.cmdSetsActionDir) || !!persisted;
  const uiVerified = checkManualEvidence();

  const report = {
    test: 'OPENHUMAN_LOCAL_WORLD_SERVER_ACCESS_CHECK',
    generatedAt: new Date().toISOString(),
    worldServerRoot: WORLD_SERVER_ROOT,
    launcher,
    persistedOverride: persisted,
    configured: configured ? 'CONFIGURED' : 'NOT_CONFIGURED',
    uiVerified: uiVerified.status,
    uiVerifiedDetail: uiVerified,
    note: 'CONFIGURED means a launcher or persisted override exists that WOULD give OpenHuman direct filesystem access to World_server on its next launch. It does NOT mean OpenHuman has actually done so in a real chat turn — that is uiVerified, which starts NOT_VERIFIED until a real manual GUI test records OPENHUMAN_LOCAL_ACCESS_MANUAL_EVIDENCE.json.',
  };
  fs.writeFileSync(path.join(__dirname, '..', 'OPENHUMAN_LOCAL_ACCESS_CHECK.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (require.main === module) {
  const r = run();
  console.log(`[OPENHUMAN_LOCAL_ACCESS_CHECK] configured=${r.configured} uiVerified=${r.uiVerified}`);
}

module.exports = { run };
