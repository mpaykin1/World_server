'use strict';
/**
 * scripts/lib/session-safe-to-delete-registry.cjs
 *
 * Implements the GLOBAL SESSION SAFE-TO-DELETE policy: ONE shared folder
 * (Desktop\SESSION_SAFE_TO_DELETE) and ONE shared README.txt, used by every
 * AI/agent that works on this machine (Claude, Codex, ChatGPT, OpenCode,
 * OpenHuman, AnythingLLM, local models, browser-agents, future agents).
 *
 * Distinct from (and does not replace) the per-session worktree/junk cleanup
 * in desktop-ai-session-housekeeping.cjs's `run` command, which already has
 * its own tested SAFE_TO_DELETE-per-session flow for that script's own
 * output. This module is the durable, cross-agent, cross-session ledger for
 * objects that could NOT be safely auto-deleted or auto-moved by any agent.
 *
 * Hard rules (do not relax without updating the tests in
 * test/session-safe-to-delete-policy.test.js):
 *   - Never move/delete a worktree with uncommitted changes.
 *   - Never move/delete a worktree/branch with commits not reachable from
 *     any remote-tracking ref (possible unique unpushed work).
 *   - Never move/delete a path guarded by a live lock marker.
 *   - Never create a second SAFE_TO_DELETE-style folder; detect and flag
 *     existing duplicates instead.
 *   - README.txt is always appended to inside marker blocks, never
 *     overwritten wholesale — other agents' entries must survive.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const README_NAME = 'README.txt';
const ENTRIES_START = '<!-- SAFE_TO_DELETE_ENTRIES_START -->';
const ENTRIES_END = '<!-- SAFE_TO_DELETE_ENTRIES_END -->';
const MANUAL_START = '<!-- MANUAL_DELETE_CANDIDATES_START -->';
const MANUAL_END = '<!-- MANUAL_DELETE_CANDIDATES_END -->';

const DUPLICATE_NAME_PATTERNS = [
  /^SAFE_TO_DELETE.*/i,
  /^SESSION_SAFE_TO_DELETE_.+/i,
  /backup[-_]?final/i,
  /tmp[-_]?copy/i,
  /temp[-_]?backup/i,
  /old[-_]?copy/i,
  /session[-_]?junk/i,
];

// DESKTOP ZERO-CHAOS (STRICT, no exceptions): the ONLY World_server-related
// items ever permanently allowed on Desktop are the single main checkout
// (World_server). Quarantine, keep archives, worktrees, logs and caches must
// live outside Desktop under LOCALAPPDATA. There is deliberately no "but it's a real
// registered git worktree" / "but it's clean and pushed" / "but it's a
// named launcher, not AI clutter" exception -- a worktree or copy that still
// holds useful work must be committed+pushed to origin, or archived into
// WORLD_SERVER_KEEP.zip, or moved off-Desktop entirely before session end.
// Any other file or folder whose name contains "world"+"server" (any
// separator, any case) is FAIL.
const ALLOWED_DESKTOP_WORLD_SERVER_NAMES = new Set([
  'world_server',
]);

function isAllowedDesktopWorldServerName(name) {
  return ALLOWED_DESKTOP_WORLD_SERVER_NAMES.has(name.toLowerCase());
}

function defaultDesktopRoot() {
  return process.env.SESSION_SAFE_TO_DELETE_DESKTOP_ROOT || path.join(os.homedir(), 'Desktop');
}

function defaultRoot() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return process.env.SESSION_SAFE_TO_DELETE_ROOT || path.join(local, 'WorldServerAI', 'Quarantine');
}

function git(cwd, args, timeoutMs = 15000) {
  const r = cp.spawnSync('git', args, { cwd, encoding: 'utf8', timeout: timeoutMs, windowsHide: true });
  return { status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

function header() {
  return [
    'WORLD_SERVER -- GLOBAL SESSION SAFE-TO-DELETE',
    'Shared by ALL AI agents on this machine: Claude, Claude Code, ChatGPT, Codex,',
    'OpenCode, OpenHuman, AnythingLLM, local models, browser-agents, and any future',
    'AI/agent system working on this project.',
    '',
    'Do NOT create SAFE_TO_DELETE_2 / _NEW / _FINAL / backup-final / tmp-copy / any',
    'other duplicate folder. Reuse this one folder and this one README.txt. Append',
    'new entries inside the marker blocks below; never remove another agent\'s entry.',
    '',
  ].join('\n');
}

function emptyBody() {
  return header() +
    '=== REGISTERED ITEMS (moved here -- see each entry\'s SAFE TO DELETE MANUALLY line) ===\n' +
    ENTRIES_START + '\n' + ENTRIES_END + '\n\n' +
    '=== MANUAL_DELETE_CANDIDATES (left in place -- could not be safely deleted or moved automatically) ===\n' +
    MANUAL_START + '\n' + MANUAL_END + '\n';
}

function ensureRoot(root) {
  fs.mkdirSync(root, { recursive: true });
  const readmePath = path.join(root, README_NAME);
  if (!fs.existsSync(readmePath)) fs.writeFileSync(readmePath, emptyBody());
  return readmePath;
}

function formatEntry(fields) {
  return [
    `- [${fields.timestamp}] ${fields.originalPath}`,
    `    name: ${fields.name}`,
    `    reason: ${fields.reason}`,
    `    why_not_auto_deleted: ${fields.whyNotAuto || 'n/a'}`,
    `    size: ${fields.size != null ? fields.size + ' bytes' : 'unknown'}`,
    `    related: ${fields.related || 'n/a'}`,
    `    agent: ${fields.agent || 'unknown'}`,
    `    SAFE TO DELETE MANUALLY: ${fields.safeToDeleteManually}`,
  ].join('\n');
}

function insertIntoSection(content, startMarker, endMarker, newBlock) {
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error('SESSION_SAFE_TO_DELETE/README.txt markers missing or corrupt -- refusing to append blindly (would risk destroying another agent\'s entries)');
  }
  const before = content.slice(0, startIdx + startMarker.length);
  const existing = content.slice(startIdx + startMarker.length, endIdx).replace(/^\n+|\n+$/g, '');
  const after = content.slice(endIdx);
  const body = existing ? existing + '\n' + newBlock : newBlock;
  return before + '\n' + body + '\n' + after;
}

function appendToSection(root, startMarker, endMarker, fields) {
  const readmePath = ensureRoot(root);
  const content = fs.readFileSync(readmePath, 'utf8');
  const updated = insertIntoSection(content, startMarker, endMarker, formatEntry(fields));
  fs.writeFileSync(readmePath, updated);
  return readmePath;
}

function normalizeFields(itemPath, opts) {
  return {
    timestamp: opts.timestamp || new Date().toISOString(),
    originalPath: itemPath,
    name: path.basename(itemPath),
    reason: opts.reason || 'unspecified',
    whyNotAuto: opts.whyNotAuto || 'unspecified',
    size: opts.sizeBytes,
    related: opts.related,
    agent: opts.agent || 'unknown',
    safeToDeleteManually: opts.safeToDeleteManually || 'UNKNOWN',
  };
}

/** Register an entry describing an item that WAS moved into the shared folder. */
function registerMoved(root, itemPath, opts = {}) {
  return appendToSection(root, ENTRIES_START, ENTRIES_END, normalizeFields(itemPath, { safeToDeleteManually: 'YES', ...opts }));
}

/** Register an entry for an item left in place because it could not be safely deleted or moved. */
function registerManualCandidate(root, itemPath, opts = {}) {
  return appendToSection(root, MANUAL_START, MANUAL_END, normalizeFields(itemPath, opts));
}

// ---------------------------------------------------------------------------
// Safety checks
// ---------------------------------------------------------------------------

/** Refuses if the path is a git worktree with uncommitted changes or commits
 *  not reachable from any remote-tracking ref (possible unique unpushed work). */
function worktreeSafetyCheck(worktreePath) {
  if (!fs.existsSync(worktreePath)) return { safe: false, reason: 'path does not exist' };
  const status = git(worktreePath, ['status', '--porcelain', '--untracked-files=normal']);
  if (status.status !== 0) return { safe: false, reason: `git status failed: ${status.stderr || status.stdout}` };
  if (status.stdout.trim() !== '') return { safe: false, reason: 'dirty working tree (uncommitted changes present)' };

  const branch = git(worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout;
  if (!branch || branch === 'HEAD') return { safe: true }; // detached but clean; caller decides via archive-branch policy elsewhere

  const upstream = git(worktreePath, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (upstream.status === 0 && upstream.stdout) {
    const ahead = git(worktreePath, ['rev-list', '--count', `${upstream.stdout}..HEAD`]);
    if (ahead.status === 0 && parseInt(ahead.stdout, 10) > 0) {
      return { safe: false, reason: `unique unpushed commit(s) ahead of ${upstream.stdout} (${ahead.stdout} commit(s))` };
    }
    return { safe: true };
  }
  // No upstream at all: only safe if HEAD is already an ancestor of some
  // known-good ref (master/main); otherwise the branch may hold unique work.
  for (const ref of ['refs/heads/master', 'refs/heads/main']) {
    if (git(worktreePath, ['merge-base', '--is-ancestor', 'HEAD', ref]).status === 0) return { safe: true };
  }
  return { safe: false, reason: 'no upstream tracking branch and HEAD is not an ancestor of master/main -- possible unique unpushed work' };
}

/** Best-effort active-use check via this project's own lock-file conventions. */
function isLocked(targetPath) {
  return fs.existsSync(`${targetPath}.lock`) || fs.existsSync(`${targetPath}.release.lock`);
}

/**
 * Move an item into the shared SAFE_TO_DELETE folder, iff every safety check
 * passes. On any refusal, nothing is touched and a manual-candidate entry is
 * NOT auto-created (callers decide whether refusal -> manual-candidate).
 */
function moveToSafeToDelete(root, itemPath, opts = {}) {
  if (!fs.existsSync(itemPath)) return { moved: false, reason: 'not_found' };
  if (opts.isWorktree) {
    const check = worktreeSafetyCheck(itemPath);
    if (!check.safe) return { moved: false, reason: check.reason };
  }
  if (isLocked(itemPath)) return { moved: false, reason: 'locked by an active process/marker' };

  ensureRoot(root);
  const movedDir = path.join(root, '_moved');
  fs.mkdirSync(movedDir, { recursive: true });
  const dest = path.join(movedDir, `${path.basename(itemPath)}-${opts.uniqueSuffix != null ? opts.uniqueSuffix : Date.now()}`);
  fs.renameSync(itemPath, dest);
  registerMoved(root, itemPath, { ...opts, related: opts.related });
  return { moved: true, dest };
}

/** Delete outright ONLY for artifacts proven zero-risk (matches an orphaned
 *  atomic-temp-file pattern with no plausible owner). Never used for
 *  directories, worktrees, or anything reachable from git. */
function autoDeleteIfProvenSafe(itemPath, { pattern = /\.tmp-\d+-\d+$/, agent = 'unknown', reason = 'orphaned atomic-write temp file' } = {}) {
  if (!fs.existsSync(itemPath)) return { deleted: false, reason: 'not_found' };
  if (!pattern.test(path.basename(itemPath))) return { deleted: false, reason: 'does not match a proven-safe pattern' };
  if (fs.statSync(itemPath).isDirectory()) return { deleted: false, reason: 'directories are never auto-deleted, only moved for review' };
  if (isLocked(itemPath)) return { deleted: false, reason: 'locked by an active process/marker' };
  fs.unlinkSync(itemPath);
  return { deleted: true, reason, agent };
}

function detectDuplicateSafeFolders(desktopRoot = defaultDesktopRoot(), canonicalRoot = defaultRoot()) {
  let entries = [];
  try { entries = fs.readdirSync(desktopRoot, { withFileTypes: true }); } catch { return []; }
  const canonicalName = path.basename(canonicalRoot);
  return entries
    .filter((e) => e.isDirectory() && e.name !== canonicalName && DUPLICATE_NAME_PATTERNS.some((re) => re.test(e.name)))
    .map((e) => e.name);
}

/**
 * DESKTOP ZERO-CHAOS (STRICT): scan Desktop for any file/folder whose name
 * contains "world"+"server" (case/separator-insensitive) that is not one of
 * the three permanently allowed items (see ALLOWED_DESKTOP_WORLD_SERVER_NAMES
 * above). No git-worktree-registration allowlist exists -- a real, clean,
 * pushed worktree is flagged exactly the same as an ad-hoc backup copy. Any
 * `registeredWorktreePaths`-style parameter some caller still passes is
 * intentionally not accepted here; it would only reintroduce the removed
 * exception.
 */
function scanForbiddenDesktopClutter(desktopRoot = defaultDesktopRoot()) {
  let entries = [];
  try { entries = fs.readdirSync(desktopRoot, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => /world[-_ ]?server/i.test(e.name))
    .filter((e) => !isAllowedDesktopWorldServerName(e.name))
    .map((e) => e.name);
}

/**
 * DESKTOP ZERO-CHAOS HARD GATE. Filesystem-only check (does not itself know
 * about git commit/push state across worktrees - the agent running this
 * gate must separately confirm useful work is committed/pushed, per
 * AGENTS.md sec 19.2). Returns { verdict: PASS|FAIL, reasons }.
 * FAIL: a duplicate SAFE_TO_DELETE-style folder exists, or ANY World_server-
 *       named Desktop item exists beyond the single permanently allowed main checkout --
 *       with no exception for a registered/clean/pushed worktree or a
 *       named launcher folder.
 * PASS: neither condition holds (Desktop has at most the canonical World_server checkout).
 */
function desktopZeroChaosGate({ desktopRoot = defaultDesktopRoot(), root = defaultRoot() } = {}) {
  const reasons = [];
  let verdict = 'PASS';
  const duplicateSafeFolders = detectDuplicateSafeFolders(desktopRoot, root);
  if (duplicateSafeFolders.length) {
    verdict = 'FAIL';
    reasons.push(`duplicate SAFE_TO_DELETE-style folder(s) found: ${duplicateSafeFolders.join(', ')}`);
  }
  const clutter = scanForbiddenDesktopClutter(desktopRoot);
  if (clutter.length) {
    verdict = 'FAIL';
    reasons.push(`World_server-related Desktop item(s) beyond the single allowed canonical World_server checkout: ${clutter.join(', ')}`);
  }
  return { checkedAt: new Date().toISOString(), desktopRoot, duplicateSafeFolders, clutter, verdict, reasons };
}

/**
 * End-of-session housekeeping gate. Returns { verdict: PASS|WARN|FAIL, reasons }.
 * FAIL: proven-safe junk left outside the shared folder, or a duplicate
 *       SAFE_TO_DELETE-style folder exists.
 * WARN: candidates that cannot be auto-confirmed exist (should already be in
 *       MANUAL_DELETE_CANDIDATES; if not, that itself is a WARN, not FAIL --
 *       give the agent a chance to register before hard-failing).
 * PASS: nothing outstanding.
 */
function gate({ desktopRoot = defaultDesktopRoot(), root = defaultRoot(), unregisteredJunk = [] } = {}) {
  const reasons = [];
  let verdict = 'PASS';

  const duplicates = detectDuplicateSafeFolders(desktopRoot, root);
  if (duplicates.length) {
    verdict = 'FAIL';
    reasons.push(`duplicate SAFE_TO_DELETE-style folder(s) found next to the canonical one: ${duplicates.join(', ')}`);
  }

  const readmePath = path.join(root, README_NAME);
  const rootExists = fs.existsSync(root);
  const readmeExists = fs.existsSync(readmePath);
  if (rootExists && !readmeExists) {
    verdict = verdict === 'FAIL' ? 'FAIL' : 'WARN';
    reasons.push('SESSION_SAFE_TO_DELETE exists without a README.txt (every moved/registered item must be documented)');
  }

  const provenSafeUnregistered = unregisteredJunk.filter((j) => j.provenSafe);
  if (provenSafeUnregistered.length) {
    verdict = 'FAIL';
    reasons.push(`proven-safe junk left outside SESSION_SAFE_TO_DELETE and not registered: ${provenSafeUnregistered.map((j) => j.path).join(', ')}`);
  }
  const uncertainUnregistered = unregisteredJunk.filter((j) => !j.provenSafe);
  if (uncertainUnregistered.length) {
    if (verdict === 'PASS') verdict = 'WARN';
    reasons.push(`unconfirmed candidate(s) not yet registered in MANUAL_DELETE_CANDIDATES: ${uncertainUnregistered.map((j) => j.path).join(', ')}`);
  }

  return { checkedAt: new Date().toISOString(), root, readmeExists, duplicates, verdict, reasons };
}

module.exports = {
  README_NAME, ENTRIES_START, ENTRIES_END, MANUAL_START, MANUAL_END,
  defaultDesktopRoot, defaultRoot, ensureRoot,
  registerMoved, registerManualCandidate,
  worktreeSafetyCheck, isLocked, moveToSafeToDelete, autoDeleteIfProvenSafe,
  detectDuplicateSafeFolders, gate,
  ALLOWED_DESKTOP_WORLD_SERVER_NAMES, isAllowedDesktopWorldServerName,
  scanForbiddenDesktopClutter, desktopZeroChaosGate,
};
