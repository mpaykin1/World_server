#!/usr/bin/env node
'use strict';
// Select the authoritative independent-review verdict for the Ocean
// merge-eligibility gate.
//
// Why this exists instead of a `--jq` expression: the gate's decision is only
// as trustworthy as the regression guard that proves it, and a guard that needs
// an optional host binary silently degrades to SKIP where that binary is absent.
// GitHub-hosted ubuntu runners happen to ship jq; developer machines, minimal
// containers and review hosts frequently do not. A skipped guard is a false
// green under AGENTS.md section 10, so the selection is done here with Node,
// which scripts/ocean-eligibility-gate.sh already requires (its canonical
// duplicate review runs on Node).
//
// Contract, unchanged from the previous jq expression:
//   stdin  GitHub `GET /repos/{owner}/{repo}/commits/{sha}/check-runs` JSON
//   stdout "<status>\t<conclusion>\n", where status is the newest matching
//          run's status ("absent" when the check has never run) and conclusion
//          is its conclusion, or empty while the run is not complete.
//   exit 0 on a usable answer; non-zero on an unusable payload (fail closed).
//
// Newest means the greatest check-run id. GitHub assigns monotonically
// increasing ids and every rerun gets a fresh one, so a rerun that is still
// queued must supersede an older PASS rather than be ignored by it.
const fs = require('fs');

const CHECK_NAME = 'World Independent Adversarial Review';

function fail(message) {
  process.stderr.write(`[OCEAN_REVIEW_SELECT] ${message}\n`);
  process.exit(1);
}

let raw;
try {
  raw = fs.readFileSync(0, 'utf8');
} catch (err) {
  fail(`unreadable check-runs payload: ${err.message}`);
}

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  fail('check-runs payload is not valid JSON');
}

if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
  fail('check-runs payload is not a JSON object');
}
if (!Array.isArray(payload.check_runs)) {
  fail('check-runs payload has no check_runs array');
}

const runs = payload.check_runs.filter((run) => run && run.name === CHECK_NAME);
if (runs.length === 0) {
  process.stdout.write('absent\t\n');
  process.exit(0);
}

let newest = runs[0];
for (const run of runs) {
  if (!Number.isInteger(run.id)) {
    fail('a matching check run has no integer id, so newest cannot be established');
  }
  if (run.id > newest.id) newest = run;
}

const status = typeof newest.status === 'string' && newest.status ? newest.status : 'absent';
const conclusion = typeof newest.conclusion === 'string' ? newest.conclusion : '';
process.stdout.write(`${status}\t${conclusion}\n`);
