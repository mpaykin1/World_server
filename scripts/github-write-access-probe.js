#!/usr/bin/env node
'use strict';
// GITHUB_WRITE_ACCESS_PROBE
//
// Regression test proving that the *official* GitHub write path (a real
// token with write access, going through branch -> commit -> push -> PR ->
// verify -> cleanup) actually works end-to-end for this repository. This is
// the same flow every AI-authored PR in this repo already goes through
// (branch -> PR -> CI -> gates -> merge-on-green) - this script just proves
// the credential/permission side of it mechanically and repeatably, instead
// of relying on "it worked last time".
//
// It does NOT diagnose a specific third-party GitHub App's (e.g. a ChatGPT
// connector's) installation permissions - the REST API has no endpoint a
// personal-access-token/OAuth-token holder can call to list installed Apps
// or their per-repo access (GET /repos/{owner}/{repo}/installation and
// GET /user/installations both require the App's own installation/JWT
// auth, confirmed via a 403 "You must authenticate with an access token
// authorized to a GitHub App" against this repo). Even full `admin` REST
// permission on the repo (verified: this token has admin=true here) does
// not unlock that introspection - it is only visible in GitHub's own web
// UI (Settings -> Applications -> Installed GitHub Apps -> <the App> ->
// Repository access), which is why that specific check is a human action,
// not something this script can automate. See
// data/error-prevention-registry.json's
// "github-app-connector-403-repo-not-selected" entry for the full
// diagnosis and the one concrete manual fix.
//
// Usage: node scripts/github-write-access-probe.js
// Requires: `gh` CLI authenticated with write access to this repo (or
// GITHUB_TOKEN/GH_TOKEN with repo scope - `gh` picks either up
// automatically). Cleans up everything it creates, even on failure.
const { execFileSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function gh(args, opts = {}) {
  const r = spawnSync('gh', args, { encoding: 'utf8', ...opts });
  if (r.status !== 0 && !opts.allowFail) {
    throw new Error(`gh ${args.join(' ')} failed (exit ${r.status}): ${r.stderr || r.stdout}`);
  }
  return r;
}

function git(args, opts = {}) {
  const r = spawnSync('git', args, { encoding: 'utf8', ...opts });
  if (r.status !== 0 && !opts.allowFail) {
    throw new Error(`git ${args.join(' ')} failed (exit ${r.status}): ${r.stderr || r.stdout}`);
  }
  return r;
}

async function main() {
  const repoRoot = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim();
  const repoSlug = gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']).stdout.trim();
  // Capture whatever branch/commit this worktree actually had checked out
  // before the probe starts, and restore exactly that on cleanup - never a
  // hardcoded "master". Local branch names (including "master") are shared
  // across every worktree of the same repo, so blindly checking out
  // "master" here can silently land the caller's worktree on a stale local
  // "master" ref left over from some other worktree/session instead of the
  // worktree's own real prior branch.
  const startRef = git(['symbolic-ref', '--short', '-q', 'HEAD'], { cwd: repoRoot, allowFail: true }).stdout.trim()
    || git(['rev-parse', 'HEAD'], { cwd: repoRoot }).stdout.trim();
  const stamp = Date.now();
  const branch = `probe/github-write-access-${stamp}`;
  const probeFile = path.join('.github-write-access-probes', `probe-${stamp}.md`);
  const steps = [];
  let prNumber = null;
  let ok = true;

  function record(name, fn) {
    try {
      fn();
      steps.push({ step: name, ok: true });
    } catch (e) {
      steps.push({ step: name, ok: false, error: e.message });
      ok = false;
      throw e;
    }
  }

  try {
    record('create-branch', () => {
      git(['checkout', '-b', branch], { cwd: repoRoot });
    });
    record('write-probe-file', () => {
      fs.mkdirSync(path.dirname(path.join(repoRoot, probeFile)), { recursive: true });
      fs.writeFileSync(path.join(repoRoot, probeFile), `GitHub write-access probe\n\nstamp: ${stamp}\nrepo: ${repoSlug}\npurpose: regression test only - safe to delete, cleaned up automatically by scripts/github-write-access-probe.js\n`);
    });
    record('commit', () => {
      git(['add', probeFile], { cwd: repoRoot });
      git(['commit', '-m', `chore(probe): github write-access regression test ${stamp}\n\nAutomated by scripts/github-write-access-probe.js. Safe to ignore/close.`], { cwd: repoRoot });
    });
    record('push', () => {
      git(['push', '-u', 'origin', branch], { cwd: repoRoot });
    });
    record('open-pr', () => {
      const r = gh(['pr', 'create', '--repo', repoSlug, '--head', branch, '--base', 'master', '--title', `chore(probe): github write-access regression test ${stamp}`, '--body', 'Automated regression probe (scripts/github-write-access-probe.js). Verifies branch -> commit -> push -> PR works end-to-end. Closed and cleaned up automatically.']);
      const url = r.stdout.trim();
      prNumber = url.split('/').pop();
    });
    record('verify-pr-visible', () => {
      const r = gh(['pr', 'view', prNumber, '--repo', repoSlug, '--json', 'number,state,headRefName']);
      const data = JSON.parse(r.stdout);
      if (data.headRefName !== branch) throw new Error(`PR head mismatch: expected ${branch}, got ${data.headRefName}`);
      if (data.state !== 'OPEN') throw new Error(`PR not open: ${data.state}`);
    });
  } finally {
    // Cleanup: always attempt, never let a cleanup failure hide the real result.
    if (prNumber) {
      gh(['pr', 'close', prNumber, '--repo', repoSlug, '--delete-branch'], { allowFail: true });
    } else {
      git(['push', 'origin', '--delete', branch], { allowFail: true });
    }
    git(['checkout', startRef], { cwd: repoRoot, allowFail: true });
    git(['branch', '-D', branch], { cwd: repoRoot, allowFail: true });
  }

  const report = { patch: 'GITHUB_WRITE_ACCESS_PROBE', status: ok ? 'PASS' : 'FAIL', repo: repoSlug, branch, prNumber, steps, generatedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(repoRoot, 'GITHUB_WRITE_ACCESS_PROBE_REPORT.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`[GITHUB_WRITE_ACCESS_PROBE] ${report.status}`);
  process.exitCode = ok ? 0 : 1;
}

main().catch((e) => {
  console.error(`[GITHUB_WRITE_ACCESS_PROBE] FAIL: ${e.message}`);
  process.exitCode = 1;
});
