'use strict';
// AUTONOMOUS_ISSUE_PICKER — point 10 this cycle: now that the free-agent
// pipeline genuinely works (real, proven E2E success this cycle), a safe
// mode that closes the loop end to end: known issues/registry evidence ->
// pick one small, high-confidence real issue -> scoped compile -> free-
// agent fix -> verifier -> tests -> a real, PR-ready diff sitting in its
// own isolated worktree/branch. NEVER touches master directly - every
// call this module makes into lib/agent-adapters.js already requires an
// isolated worktree (assertIsolatedWorktree), and this module creates a
// fresh one itself rather than accepting an existing tree from a caller.
// Deliberately does not fabricate issues: if the registry has nothing
// real and safe to pick, this reports that honestly rather than inventing
// a task.
const fs = require('fs');
const path = require('path');

// Only mechanical, low-risk, mechanically-verifiable issue shapes are
// autonomously picked - anything requiring architectural judgment,
// touching auth/security/payment-adjacent code, or lacking a concrete
// file+description is left for a human, never guessed at.
const SAFE_CANDIDATE_PATTERNS = [
  /viewport-fit=cover missing/i,
  /missing alt (text|attribute)/i,
  /missing rel="noopener"/i,
  /missing loading="lazy"/i,
];

function isSafeCandidate(details) {
  if (!details || !details.file || !details.message) return false;
  if (!SAFE_CANDIDATE_PATTERNS.some((re) => re.test(details.message))) return false;
  // never touch anything that looks security/secret/build-config adjacent,
  // even if a future pattern above were loosened carelessly
  if (/\.env|secret|credential|password|token|package-lock/i.test(details.file)) return false;
  return true;
}

// Real bug found live this cycle: findCandidate only checked that the
// TARGET FILE still exists, not that the described ISSUE still applies to
// its current content - a real registry candidate (auto-505f975e75a0) had
// already been fixed by an earlier cycle's own merged PR, but the
// registry's own source scan had not been re-run since, so this module
// would have re-picked and re-"fixed" an already-fixed file (producing a
// real find=replace no-op edit, discovered only by manually diffing the
// result). One real content check per known-safe pattern - conservative
// by design: if a pattern has no check below, it is treated as still
// applying (never silently skips a real, checkable issue by assuming it's
// fixed without evidence).
const STILL_APPLIES_CHECKS = [
  { pattern: /viewport-fit=cover missing/i, stillApplies: (content) => !/viewport-fit=cover/i.test(content) },
  { pattern: /missing alt (text|attribute)/i, stillApplies: (content) => /<img(?![^>]*\balt\s*=)[^>]*>/i.test(content) },
  { pattern: /missing rel="noopener"/i, stillApplies: (content) => /<a\b(?=[^>]*\btarget\s*=\s*["']_blank["'])(?![^>]*\brel\s*=\s*["'][^"']*noopener)[^>]*>/i.test(content) },
  { pattern: /missing loading="lazy"/i, stillApplies: (content) => /<img(?![^>]*\bloading\s*=)[^>]*>/i.test(content) },
];

function issueStillApplies(details, content) {
  const check = STILL_APPLIES_CHECKS.find((c) => c.pattern.test(details.message));
  if (!check) return true; // no real content check exists for this pattern - never assume resolved without evidence
  return check.stillApplies(content);
}

// Best-effort, honest bookkeeping - mirrors exactly what was done manually
// this cycle when the same stale candidate was found: mark it resolved
// with a real note, never delete history. A failure to write is silently
// tolerated (this is a courtesy cleanup, not something that should ever
// block or crash the picker).
function markResolvedStale(mainRoot, entryId, note) {
  try {
    const registryPath = path.join(mainRoot, 'data', 'error-prevention-registry.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    for (const pool of [registry.candidates, registry.knownErrors]) {
      const entry = Array.isArray(pool) && pool.find((e) => e.id === entryId);
      if (entry) {
        entry.status = 'resolved';
        entry.resolvedAt = new Date().toISOString();
        entry.resolvedNote = note;
      }
    }
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n');
  } catch { /* best effort - never let stale-marking break the picker */ }
}

function goalForCandidate(details) {
  const msg = details.message;
  if (/viewport-fit=cover missing/i.test(msg)) {
    return `In ${details.file}, add viewport-fit=cover to the content attribute of the existing <meta name="viewport"> tag.`;
  }
  if (/missing alt (text|attribute)/i.test(msg)) {
    return `In ${details.file}, find an <img> tag with an empty or missing alt attribute and add a short, accurate, descriptive alt text based on the surrounding context.`;
  }
  if (/missing rel="noopener"/i.test(msg)) {
    return `In ${details.file}, find an <a target="_blank"> tag missing rel="noopener" and add it for security (prevents the opened page from accessing window.opener).`;
  }
  if (/missing loading="lazy"/i.test(msg)) {
    return `In ${details.file}, find an <img> tag missing the loading="lazy" attribute and add it.`;
  }
  return null;
}

// Reads the real registry (never fabricates entries) and returns the
// first candidate that is both real (status:'candidate', not already
// resolved/protected) and mechanically safe per isSafeCandidate above.
function findCandidate(mainRoot) {
  const registryPath = path.join(mainRoot, 'data', 'error-prevention-registry.json');
  let registry;
  try { registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')); } catch (e) { return { found: false, reason: `could not read registry: ${e.message}` }; }
  const pools = [...(registry.candidates || []), ...(registry.knownErrors || []).filter((e) => e.status === 'candidate')];
  for (const entry of pools) {
    const details = entry.details || entry;
    if (!isSafeCandidate(details)) continue;
    // confirm the issue is still real on disk right now - a registry can
    // go stale (e.g. fixed in an ephemeral worktree that was never
    // merged, or fixed by unrelated work since the registry was last
    // regenerated) - never act on stale evidence.
    const filePath = path.join(mainRoot, details.file);
    if (!fs.existsSync(filePath)) continue;
    // Point 8, this new cycle's explicit instruction: verify the issue
    // still genuinely applies to the file's CURRENT content, not just
    // that the file exists - a real stale candidate (already fixed by an
    // earlier merged PR, registry not yet re-scanned) was found live this
    // cycle exactly this way. A confirmed-resolved candidate is marked
    // resolved right here (real, honest bookkeeping) and skipped, never
    // handed to the agent as if it were still a real task.
    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); } catch { continue; }
    if (!issueStillApplies(details, content)) {
      markResolvedStale(mainRoot, entry.id, `Auto-detected as already resolved by findCandidate's own pre-flight content check (the described issue no longer matches the file's current content) - confirmed before picking, never handed to the agent as a live task.`);
      continue;
    }
    const goal = goalForCandidate(details);
    if (!goal) continue;
    return { found: true, id: entry.id, details, goal };
  }
  return { found: false, reason: 'no safe, real, currently-unresolved candidate found in the registry' };
}

// Full pipeline: pick -> isolated worktree -> free-agent fix -> verify.
// Returns a PR-ready result (worktree path + branch, left in place, never
// merged or cleaned up automatically) on success, or an honest
// not-picked/failed result - this module never claims success it can't
// back with a real, verified diff.
async function runAutonomousIssuePicker(mainRoot, { implementGoalFn, createIsolatedWorktreeFn, verifyScript = null } = {}) {
  const agentAdapters = require('./agent-adapters');
  const implement = implementGoalFn || agentAdapters.implementGoal;
  const createWorktree = createIsolatedWorktreeFn || agentAdapters.createIsolatedWorktree;

  const candidate = findCandidate(mainRoot);
  if (!candidate.found) return { ok: false, picked: false, reason: candidate.reason };

  const wt = createWorktree(mainRoot, `autofix-${candidate.id || 'candidate'}`);
  if (!wt.ok) return { ok: false, picked: true, candidate, error: `worktree creation failed: ${wt.error}` };

  const result = await implement({
    mainRoot, goal: candidate.goal, targetWorktree: wt.worktreePath,
    verifyScript,
  });

  return {
    ok: !!result.ok, picked: true, candidate,
    worktreePath: wt.worktreePath, branch: wt.branch,
    result,
  };
}

module.exports = { isSafeCandidate, goalForCandidate, findCandidate, runAutonomousIssuePicker, SAFE_CANDIDATE_PATTERNS, issueStillApplies, markResolvedStale };
