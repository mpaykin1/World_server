#!/usr/bin/env node
'use strict';
/**
 * desktop-ai-session-housekeeping.cjs
 *
 * Implements the WORLD_SERVER ZERO-JUNK / SESSION-END HOUSEKEEPING policy
 * (see AGENTS.md sections "WORKTREE & PHYSICAL-COPY HYGIENE" and
 * "SESSION-END HOUSEKEEPING & SESSION SAFE_TO_DELETE").
 *
 * Extends the existing desktop-ai-session-recovery.cjs engine instead of
 * duplicating it: when state/session-recovery/current.json exists, this
 * script reuses its sessionId/startedAt so re-running housekeeping during
 * the same session updates one SESSION_<...> folder instead of creating a
 * new one per invocation (policy requirement: one session = one folder).
 *
 * Pipeline (never deviates from this order):
 *   DISCOVER -> CLASSIFY -> DRY-RUN REPORT -> (only with --apply) SAVE/ARCHIVE -> APPLY -> VERIFY AGAIN
 *
 * This script NEVER deletes anything. It only ever:
 *   - creates git branches (additive, reversible)
 *   - runs `git worktree remove` / `git worktree prune` on worktrees already
 *     proven clean+merged (or explicitly archived) at the moment of removal
 *   - MOVES (never copies+deletes-later, never duplicates) proven-disposable
 *     files into <SESSION_ROOT>/SESSION_<id>/SAFE_TO_DELETE for the human to
 *     delete themselves.
 *
 * Usage:
 *   node scripts/desktop-ai-session-housekeeping.cjs audit [--json]
 *   node scripts/desktop-ai-session-housekeeping.cjs run [--apply] [--agent NAME]
 *                                                          [--desktop-root PATH]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');
const safeRegistry = require('./lib/session-safe-to-delete-registry.cjs');

const ROOT = path.resolve(__dirname, '..');
const STATE_DIR = path.join(ROOT, 'state', 'session-recovery');
const SESSION_STATE_FILE = path.join(STATE_DIR, 'current.json');
const AUDIT_LOG = path.join(STATE_DIR, 'worktree-audit-log.jsonl');
const POLICY_FILE = path.join(ROOT, 'config', 'desktop-worktree-policy.json');

function nowIso() { return new Date().toISOString(); }

function readJsonSafe(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function loadPolicy() {
  return readJsonSafe(POLICY_FILE, {
    worktrees: { maxActiveWorktrees: 12, warnActiveWorktrees: 8, worktreeTtlDays: 7 },
    temp: { tempTtlDays: 2, cacheTtlDays: 7, orphanTmpFilePattern: '\\.tmp-\\d+-\\d+$', maxTempGB: 2 },
    logs: { logRetentionDays: 14 },
    testOutput: { testOutputRetentionDays: 7 },
    sessionCleanup: { root: 'SESSION_SAFE_TO_DELETE' }
  });
}

function git(cwd, args) {
  const r = cp.spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  return { status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function dirSizeBytes(p, maxEntries = 20000) {
  let total = 0, seen = 0;
  const stack = [p];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (seen++ > maxEntries) return total; // cheap cap for huge trees
      const full = path.join(cur, e.name);
      if (e.isDirectory()) { if (e.name !== '.git') stack.push(full); }
      else { try { total += fs.statSync(full).size; } catch {} }
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Worktree discovery + classification
// ---------------------------------------------------------------------------

function listWorktrees(repoRoot = ROOT) {
  const r = git(repoRoot, ['worktree', 'list', '--porcelain']);
  if (r.status !== 0) throw new Error(`git worktree list failed: ${r.stderr || r.stdout}`);
  const out = [];
  let cur = null;
  for (const line of r.stdout.split('\n')) {
    if (line.startsWith('worktree ')) { if (cur) out.push(cur); cur = { worktree: line.slice(9).trim() }; }
    else if (line.startsWith('HEAD ')) cur.head = line.slice(5).trim();
    else if (line.startsWith('branch ')) cur.branch = line.slice(7).trim().replace(/^refs\/heads\//, '');
    else if (line === 'detached') cur.detached = true;
    else if (line === 'bare') cur.bare = true;
  }
  if (cur) out.push(cur);
  return out;
}

function classifyWorktree(wt, mainRoot, policy) {
  const info = { path: wt.worktree, isMain: path.resolve(wt.worktree) === path.resolve(mainRoot), bare: !!wt.bare };
  if (info.isMain || info.bare) { info.classification = 'keep_active'; info.reason = 'main repository / bare admin entry'; return info; }

  const exists = fs.existsSync(wt.worktree);
  info.existsOnDisk = exists;
  if (!exists) {
    info.classification = 'orphan_admin_entry';
    info.reason = 'registered worktree, working directory missing on disk';
    info.action = 'git worktree prune (removes bookkeeping only, no files touched)';
    return info;
  }

  const status = git(wt.worktree, ['status', '--porcelain', '--untracked-files=normal']);
  info.dirty = status.status === 0 ? status.stdout.length > 0 : null;
  info.statusLines = status.status === 0 ? status.stdout.split('\n').filter(Boolean).slice(0, 50) : [];

  const headSha = git(wt.worktree, ['rev-parse', 'HEAD']).stdout;
  info.headSha = headSha;
  info.detached = !!wt.detached;
  info.branch = wt.branch || null;

  const lastCommit = git(wt.worktree, ['log', '-1', '--format=%cI']);
  info.lastCommitAt = lastCommit.status === 0 ? lastCommit.stdout : null;
  const ageDays = info.lastCommitAt ? (Date.now() - new Date(info.lastCommitAt).getTime()) / 86400000 : null;
  info.lastCommitAgeDays = ageDays;

  info.nodeModulesPresent = fs.existsSync(path.join(wt.worktree, 'node_modules'));

  if (info.dirty) {
    info.classification = 'needs_manual_save';
    info.reason = 'uncommitted changes present; must be committed (or explicitly discarded by a human) before this worktree may be touched';
    return info;
  }

  if (info.detached) {
    const pointsAt = git(mainRoot, ['for-each-ref', `--points-at=${headSha}`, 'refs/heads/']);
    const archived = pointsAt.status === 0 && pointsAt.stdout.trim().length > 0;
    info.archivedBranches = archived ? pointsAt.stdout.split('\n').map(l => l.trim().split(/\s+/).pop()) : [];
    if (!archived) {
      info.classification = 'archive_then_remove';
      info.reason = 'detached HEAD with no branch/ref pointing at it yet; must be archived before removal';
    } else {
      info.classification = 'safe_to_remove';
      info.reason = `clean, detached, but already reachable via archived branch(es): ${info.archivedBranches.join(', ')}`;
    }
    return info;
  }

  if (info.branch) {
    const merged = git(mainRoot, ['branch', '--merged', 'master']).stdout.split('\n').map(s => s.replace(/^[*+]\s*/, '').trim());
    info.mergedIntoMaster = merged.includes(info.branch);
    if (info.mergedIntoMaster) {
      info.classification = 'safe_to_remove';
      info.reason = `clean and branch '${info.branch}' already merged into master`;
    } else if (ageDays !== null && ageDays > (policy.worktrees.worktreeTtlDays || 7)) {
      info.classification = 'stale_unmerged';
      info.reason = `clean but branch '${info.branch}' is unmerged and idle for ${ageDays.toFixed(1)}d (> TTL ${policy.worktrees.worktreeTtlDays}d); keep the branch, worktree may be removed once confirmed no longer needed`;
    } else {
      info.classification = 'keep_active';
      info.reason = `clean, unmerged branch '${info.branch}' within TTL`;
    }
    return info;
  }

  info.classification = 'keep_active';
  info.reason = 'unrecognized state; defaulting to keep (never delete on doubt)';
  return info;
}

// ---------------------------------------------------------------------------
// Non-worktree disposable-junk scan (repo root only, cheap, pattern-based)
// ---------------------------------------------------------------------------

function scanDisposableJunk(policy) {
  const found = [];
  const tmpRe = new RegExp(policy.temp.orphanTmpFilePattern || '\\.tmp-\\d+-\\d+$');
  let entries;
  try { entries = fs.readdirSync(ROOT, { withFileTypes: true }); } catch { return found; }
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (tmpRe.test(e.name)) {
      const full = path.join(ROOT, e.name);
      let size = 0; try { size = fs.statSync(full).size; } catch {}
      found.push({ path: full, sizeBytes: size, reason: 'orphaned atomic-write temp file (matches ' + tmpRe + '); source file was rewritten and this leftover was never cleaned up' });
    }
  }
  const dirCandidates = ['.cache', 'test-results', 'playwright-report', 'coverage', '.pytest_cache', '__pycache__'];
  for (const name of dirCandidates) {
    const full = path.join(ROOT, name);
    if (fs.existsSync(full)) {
      found.push({ path: full, sizeBytes: dirSizeBytes(full), reason: `reproducible ${name}/ directory (regenerated by tooling, not a source of truth)`, isDir: true });
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Session identity (reuse desktop-ai-session-recovery.cjs state, don't duplicate)
// ---------------------------------------------------------------------------

function sessionIdentity(agentArg) {
  const s = readJsonSafe(SESSION_STATE_FILE, null);
  const agent = (agentArg || (s && s.agent) || 'CLAUDE').toUpperCase();
  const startedAt = (s && s.startedAt) ? new Date(s.startedAt) : new Date();
  const stamp = startedAt.toISOString().slice(0, 16).replace(/[-T:]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2');
  return { agent, sessionId: (s && s.sessionId) || `local-${stamp}`, folderName: `SESSION_${stamp}_${agent}`, recoveryState: s };
}

function desktopSessionRoot(cliRoot, policy) {
  if (cliRoot) return cliRoot;
  // DESKTOP ZERO-CHAOS: this used to default to a dedicated
  // WORLD_SERVER_SESSION_CLEANUP folder - retired in favor of the one
  // canonical SESSION_SAFE_TO_DELETE folder shared by every agent (see
  // scripts/lib/session-safe-to-delete-registry.cjs and AGENTS.md sec 19.2).
  // SESSION_SAFE_TO_DELETE_ROOT is the same override var that module uses,
  // so both tools always agree on where "the one folder" is.
  if (process.env.SESSION_SAFE_TO_DELETE_ROOT) return process.env.SESSION_SAFE_TO_DELETE_ROOT;
  if (process.env.WORLD_SERVER_SESSION_CLEANUP_ROOT) return process.env.WORLD_SERVER_SESSION_CLEANUP_ROOT; // legacy test/override compat
  return path.join(os.homedir(), 'Desktop', policy.sessionCleanup.root || 'SESSION_SAFE_TO_DELETE');
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function commandAudit(args) {
  const policy = loadPolicy();
  const worktrees = listWorktrees().map(w => classifyWorktree(w, ROOT, policy));
  const junk = scanDisposableJunk(policy);
  const active = worktrees.filter(w => !w.isMain && !w.bare && w.classification !== 'orphan_admin_entry');
  const junkBytes = junk.reduce((a, j) => a + (j.sizeBytes || 0), 0);
  const problems = [];
  if (active.length > policy.worktrees.maxActiveWorktrees) problems.push(`active worktrees ${active.length} exceed maxActiveWorktrees ${policy.worktrees.maxActiveWorktrees}`);
  else if (active.length > policy.worktrees.warnActiveWorktrees) problems.push(`active worktrees ${active.length} exceed warnActiveWorktrees ${policy.worktrees.warnActiveWorktrees} (warning only)`);
  const maxTempBytes = (policy.temp.maxTempGB || 2) * 1024 * 1024 * 1024;
  if (junkBytes > maxTempBytes) problems.push(`disposable junk ${(junkBytes / 1e9).toFixed(2)}GB exceeds maxTempGB ${policy.temp.maxTempGB}`);
  const staleDirty = worktrees.filter(w => w.classification === 'needs_manual_save');
  const report = {
    checkedAt: nowIso(), root: ROOT, worktreeCount: worktrees.length, activeCount: active.length,
    classifications: worktrees.reduce((acc, w) => { acc[w.classification] = (acc[w.classification] || 0) + 1; return acc; }, {}),
    dirtyWorktrees: staleDirty.map(w => w.path), disposableJunkBytes: junkBytes, disposableJunkItems: junk.length,
    problems, worktrees, junk
  };
  if (args.json) { console.log(JSON.stringify(report, null, 2)); }
  else {
    console.log(`[worktree-audit] ${report.worktreeCount} worktrees (${report.activeCount} active), ${report.disposableJunkItems} junk item(s) = ${(junkBytes / 1e6).toFixed(1)}MB`);
    for (const [k, v] of Object.entries(report.classifications)) console.log(`  ${k}: ${v}`);
    if (problems.length) { console.log('PROBLEMS:'); problems.forEach(p => console.log('  - ' + p)); }
  }
  try { ensureDir(STATE_DIR); fs.appendFileSync(AUDIT_LOG, JSON.stringify({ at: nowIso(), summary: { worktreeCount: report.worktreeCount, activeCount: report.activeCount, disposableJunkBytes: junkBytes, problems } }) + '\n'); } catch {}
  const hardFail = active.length > policy.worktrees.maxActiveWorktrees || junkBytes > maxTempBytes;
  process.exitCode = hardFail ? 1 : 0;
  return report;
}

function commandRun(args) {
  const policy = loadPolicy();
  const apply = !!args.apply;
  const identity = sessionIdentity(args.agent);
  const sessionRoot = desktopSessionRoot(args['desktop-root'], policy);
  const sessionDir = path.join(sessionRoot, identity.folderName);
  const safeDir = path.join(sessionDir, 'SAFE_TO_DELETE');
  ensureDir(safeDir);

  const worktrees = listWorktrees().map(w => classifyWorktree(w, ROOT, policy));
  const junk = scanDisposableJunk(policy);

  const commitsCreated = []; // this script never commits code on the user's behalf
  const worktreesRemoved = [];
  const archivedBranches = [];
  const filesMoved = [];
  const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  for (const w of worktrees) {
    if (w.classification === 'orphan_admin_entry') {
      if (apply) { const r = git(ROOT, ['worktree', 'prune']); if (r.status === 0) worktreesRemoved.push({ path: w.path, reason: 'pruned orphan admin entry' }); }
      continue;
    }
    if (w.classification === 'archive_then_remove' && apply) {
      const shortId = path.basename(w.path).replace(/[^a-zA-Z0-9_-]/g, '') || w.headSha.slice(0, 8);
      const branchName = `archive/cleanup-${dateStamp}/${shortId}`;
      const exists = git(ROOT, ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`]).status === 0;
      if (!exists) { const b = git(ROOT, ['branch', branchName, w.headSha]); if (b.status !== 0) continue; }
      const verify = git(ROOT, ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`]);
      if (verify.status !== 0) continue; // refuse to remove if the archive ref cannot be verified
      archivedBranches.push({ branch: branchName, sha: w.headSha, from: w.path });
      const recheck = git(w.path, ['status', '--porcelain']);
      if (recheck.status === 0 && recheck.stdout.trim() === '') {
        const rm = git(ROOT, ['worktree', 'remove', w.path]);
        if (rm.status === 0) worktreesRemoved.push({ path: w.path, reason: `archived as ${branchName}, then removed` });
      }
      continue;
    }
    if (w.classification === 'safe_to_remove' && apply) {
      const recheck = git(w.path, ['status', '--porcelain']);
      if (recheck.status === 0 && recheck.stdout.trim() === '') {
        const rm = git(ROOT, ['worktree', 'remove', w.path]);
        if (rm.status === 0) worktreesRemoved.push({ path: w.path, reason: w.reason });
      }
    }
  }
  if (apply) git(ROOT, ['worktree', 'prune']);

  for (const j of junk) {
    const rel = path.relative(ROOT, j.path);
    const dest = path.join(safeDir, rel);
    if (apply) {
      try {
        ensureDir(path.dirname(dest));
        fs.renameSync(j.path, dest);
        filesMoved.push({ path: j.path, dest, sizeBytes: j.sizeBytes, reason: j.reason });
      } catch (e) {
        filesMoved.push({ path: j.path, dest, sizeBytes: j.sizeBytes, reason: j.reason, error: String(e.message || e) });
      }
    } else {
      filesMoved.push({ path: j.path, dest, sizeBytes: j.sizeBytes, reason: j.reason, planned: true });
    }
  }

  const totalSafeToDeleteBytes = filesMoved.reduce((a, f) => a + (f.sizeBytes || 0), 0);
  const dirtyRemaining = worktrees.filter(w => w.classification === 'needs_manual_save');
  const staleUnmerged = worktrees.filter(w => w.classification === 'stale_unmerged');
  const canDeleteSafeToDelete = apply && dirtyRemaining.length === 0;

  const manifest = {
    sessionId: identity.sessionId, agent: identity.agent, startedAt: (identity.recoveryState && identity.recoveryState.startedAt) || null,
    finishedAt: nowIso(), repo: ROOT, branch: git(ROOT, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout,
    dryRun: !apply, commits: commitsCreated, removedWorktrees: worktreesRemoved, archivedBranches,
    safeToDeleteFiles: filesMoved.map(f => ({ path: f.path, dest: f.dest, sizeBytes: f.sizeBytes, reason: f.reason })),
    safeToDeleteBytes: totalSafeToDeleteBytes, zipArchives: [],
    tests: null, gitStatus: git(ROOT, ['status', '--porcelain']).stdout ? 'DIRTY' : 'CLEAN',
    cleanupVerified: apply, safeToDeleteApproved: canDeleteSafeToDelete,
    dirtyWorktreesPreserved: dirtyRemaining.map(w => w.path), staleUnmergedWorktrees: staleUnmerged.map(w => ({ path: w.path, branch: w.branch }))
  };
  fs.writeFileSync(path.join(sessionDir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));

  const readme = [
    `AGENT: ${manifest.agent}`,
    `SESSION START: ${manifest.startedAt || '(unknown - no active desktop-ai session-recovery state found)'}`,
    `SESSION END: ${manifest.finishedAt}`,
    `WHAT WAS DONE: automated worktree/junk housekeeping scan${apply ? ' (APPLIED)' : ' (DRY-RUN ONLY, nothing on disk was changed except this report)'}`,
    `COMMITS CREATED: ${commitsCreated.length ? commitsCreated.map(c => `${c.branch}@${c.sha}: ${c.message}`).join('; ') : 'none (this tool does not author code commits)'}`,
    `WORKTREES CREATED: none (this tool never creates worktrees)`,
    `WORKTREES REMOVED: ${worktreesRemoved.length ? worktreesRemoved.map(w => `${w.path} (${w.reason})`).join('; ') : 'none'}`,
    `FILES MOVED TO SAFE_TO_DELETE: ${filesMoved.length ? filesMoved.map(f => `${f.path} [${f.reason}] (${f.sizeBytes} bytes)${f.planned ? ' [PLANNED, dry-run]' : ''}`).join('\n  ') : 'none'}`,
    `TOTAL SAFE_TO_DELETE SIZE: ${totalSafeToDeleteBytes} bytes (${(totalSafeToDeleteBytes / 1e6).toFixed(2)} MB)`,
    `FILES KEPT OUTSIDE GIT: none created by this tool`,
    `ZIP CREATED: NO`,
    `TESTS: not run by this tool (run npm run check / integration:cas:gc separately and record the result)`,
    `GIT STATUS: ${manifest.gitStatus}${manifest.gitStatus === 'DIRTY' ? ' - uncommitted changes exist in the MAIN worktree; commit or checkpoint before treating cleanup as final' : ''}`,
    `SAFE_TO_DELETE CAN BE DELETED (YES/NO): ${canDeleteSafeToDelete ? 'YES' : 'NO'}`,
    canDeleteSafeToDelete ? 'ЭТУ ПАПКУ SAFE_TO_DELETE МОЖНО УДАЛИТЬ ЦЕЛИКОМ' : 'НЕ УДАЛЯТЬ SAFE_TO_DELETE',
    dirtyRemaining.length ? `\nDIRTY WORKTREES PRESERVED (not touched, need manual commit first): ${dirtyRemaining.map(w => w.path).join(', ')}` : '',
    staleUnmerged.length ? `\nSTALE UNMERGED WORKTREES (branch kept, worktree may be removed once confirmed unneeded): ${staleUnmerged.map(w => `${w.path} (${w.branch})`).join(', ')}` : ''
  ].filter(Boolean).join('\n');
  fs.writeFileSync(path.join(sessionDir, 'README.txt'), readme + '\n');

  const out = { sessionDir, apply, manifest };
  console.log(JSON.stringify(out, null, 2));
  process.exitCode = 0;
  return out;
}

// ---------------------------------------------------------------------------
// GLOBAL SESSION SAFE-TO-DELETE (cross-agent shared ledger) commands
// ---------------------------------------------------------------------------

function commandSafeRegister(args) {
  const root = args.root || safeRegistry.defaultRoot();
  const itemPath = args.path;
  if (!itemPath) { console.error('--path is required'); process.exitCode = 2; return; }
  const opts = {
    reason: args.reason, whyNotAuto: args['why-not-auto'], related: args.related,
    agent: (args.agent || 'unknown').toUpperCase(),
    sizeBytes: args.size ? Number(args.size) : undefined,
  };
  let out;
  if (args.manual) {
    out = { readmePath: safeRegistry.registerManualCandidate(root, itemPath, { ...opts, safeToDeleteManually: args['safe-to-delete-manually'] || 'UNKNOWN' }) };
  } else {
    out = safeRegistry.moveToSafeToDelete(root, itemPath, { ...opts, isWorktree: !!args['is-worktree'] });
    if (!out.moved) {
      console.log(JSON.stringify({ moved: false, reason: out.reason }, null, 2));
      process.exitCode = out.reason === 'not_found' ? 1 : 0;
      return out;
    }
  }
  console.log(JSON.stringify(out, null, 2));
  return out;
}

function commandSafeGate(args) {
  const root = args.root || safeRegistry.defaultRoot();
  const desktopRoot = args['desktop-root'] || safeRegistry.defaultDesktopRoot();
  const report = safeRegistry.gate({ root, desktopRoot });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.verdict === 'FAIL' ? 2 : report.verdict === 'WARN' ? 1 : 0;
  return report;
}

function commandZeroChaosGate(args) {
  const desktopRoot = args['desktop-root'] || safeRegistry.defaultDesktopRoot();
  const root = args.root || safeRegistry.defaultRoot();
  const report = safeRegistry.desktopZeroChaosGate({ desktopRoot, root });
  report.git = gitZeroChaosReadiness(args['repo-root'] || ROOT);
  if (report.git.verdict !== 'PASS') {
    report.verdict = 'FAIL';
    report.reasons.push(...report.git.reasons);
  }
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.verdict === 'FAIL' ? 2 : 0;
  return report;
}

function gitZeroChaosReadiness(repoRoot = ROOT) {
  const reasons = [], worktrees = [];
  let entries;
  try { entries = listWorktrees(repoRoot); }
  catch (error) { return { verdict: 'FAIL', worktrees, reasons: [error.message] }; }
  // Preserved branches still contain unpublished work after their worktree is removed.
  const branches = git(repoRoot, ['rev-list', '--count', '--branches', '--not', '--remotes']);
  const unpublishedBranchCommits = branches.status === 0 && /^\d+$/.test(branches.stdout.trim())
    ? Number(branches.stdout.trim()) : null;
  if (unpublishedBranchCommits === null) reasons.push('Local branch publication state unavailable');
  else if (unpublishedBranchCommits > 0) reasons.push(`Unpublished local branch commits (${unpublishedBranchCommits})`);
  for (const entry of entries.filter(x => !x.bare)) {
    const status = git(entry.worktree, ['status', '--porcelain', '--untracked-files=all']);
    // Count unique local commits even without an upstream. A local master/main
    // reference is not proof that anything has been pushed.
    const pending = git(entry.worktree, ['rev-list', '--count', 'HEAD', '--not', '--remotes']);
    const validCount = pending.status === 0 && /^\d+$/.test(pending.stdout.trim());
    const item = { path: entry.worktree, dirty: status.status === 0 ? Boolean(status.stdout.trim()) : null,
      unpublishedCommits: validCount ? Number(pending.stdout.trim()) : null };
    worktrees.push(item);
    if (item.dirty === null || item.unpublishedCommits === null) reasons.push(`Git state unavailable: ${entry.worktree}`);
    if (item.dirty) reasons.push(`Dirty/untracked work: ${entry.worktree}`);
    if (item.unpublishedCommits > 0) reasons.push(`Unpublished commits (${item.unpublishedCommits}): ${entry.worktree}`);
  }
  return { verdict: reasons.length ? 'FAIL' : 'PASS', unpublishedBranchCommits, worktrees, reasons };
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { args[key] = next; i++; } else { args[key] = true; }
    } else args._.push(a);
  }
  return args;
}

function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const args = parseArgs(argv.slice(1));
  if (cmd === 'audit') return commandAudit(args);
  if (cmd === 'run') return commandRun(args);
  if (cmd === 'safe-register') return commandSafeRegister(args);
  if (cmd === 'safe-gate') return commandSafeGate(args);
  if (cmd === 'zero-chaos-gate') return commandZeroChaosGate(args);
  console.log('Usage: node scripts/desktop-ai-session-housekeeping.cjs <audit|run|safe-register|safe-gate|zero-chaos-gate> [--json] [--apply] [--agent NAME] [--desktop-root PATH]');
  process.exitCode = 2;
}

if (require.main === module) main();

module.exports = { listWorktrees, classifyWorktree, scanDisposableJunk, loadPolicy, commandAudit, commandRun, commandSafeRegister, commandSafeGate, commandZeroChaosGate, gitZeroChaosReadiness, safeRegistry };
