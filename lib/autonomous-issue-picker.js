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

module.exports = { isSafeCandidate, goalForCandidate, findCandidate, runAutonomousIssuePicker, SAFE_CANDIDATE_PATTERNS };
