'use strict';

// Shapes the exact-head facts consumed by lib/ocean-merge-eligibility.js.
//
// This runs in CI on the trusted checkout, reads only files that `gh api` has
// already written, and performs no network or GitHub call of its own. Keeping
// the shaping in Node instead of an inline jq program makes it unit-testable
// and keeps the fail-closed decision in one place.
//
// Usage: node scripts/ocean-merge-eligibility-facts.js <dir>
//   <dir>/pr.json      repos/{owner}/{repo}/pulls/{number}
//   <dir>/master.json  repos/{owner}/{repo}/git/ref/heads/master
//   <dir>/checks.json  repos/{owner}/{repo}/commits/{sha}/check-runs
//
// Required env: EXPECTED, CERTIFIED_SHA, CHECK_NAME. Optional: PR_NUMBER.
// Writes <dir>/facts.json. Always writes a fact set, even when input is
// unusable, so the gate can only ever fail closed with a reason.

const fs = require('fs');
const path = require('path');

const { INDEPENDENT_REVIEW_CHECK, isSha } = require('../lib/ocean-merge-eligibility.js');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readJsonOr(file, fallback) {
  try {
    const value = readJson(file);
    return value && typeof value === 'object' ? value : fallback;
  } catch {
    return fallback;
  }
}

// The review workflow publishes `Independent review: <VERDICT>` as the
// check-run output title (see .github/workflows/independent-pr-review.yml).
// A missing or unparsable title is not a pass.
function extractVerdict(review) {
  if (!review || !review.output || typeof review.output.title !== 'string') return null;
  const match = /(?:independent\s+review|verdict)\s*:\s*([A-Z]+)/i.exec(review.output.title);
  return match ? match[1] : null;
}

function selectReviewRun(checksPayload, checkName) {
  const runs = checksPayload && Array.isArray(checksPayload.check_runs) ? checksPayload.check_runs : [];
  const matching = runs.filter((run) => run && run.name === checkName);
  return matching.length > 0 ? matching[matching.length - 1] : null;
}

function buildFacts({ expected, certifiedSha, checkName, prNumber, pr, master, checks }) {
  const review = selectReviewRun(checks, checkName);
  return {
    expectedHeadSha: typeof expected === 'string' ? expected : null,
    certifiedSha: certifiedSha || null,
    prNumber: pr && Number.isInteger(pr.number) ? pr.number : prNumber || null,
    baseRef: pr && pr.base ? pr.base.ref || null : null,
    baseSha: pr && pr.base ? pr.base.sha || null : null,
    headSha: pr && pr.head ? pr.head.sha || null : null,
    draft: pr ? pr.draft === true : false,
    mergeable: pr && typeof pr.mergeable === 'boolean' ? pr.mergeable : null,
    mergeableState: pr ? pr.mergeable_state || null : null,
    trustedMasterSha:
      master && master.object && isSha(master.object.sha) ? master.object.sha : null,
    review: review
      ? {
          found: true,
          head_sha: review.head_sha || null,
          status: review.status || null,
          conclusion: review.conclusion || null,
          verdict: extractVerdict(review)
        }
      : { found: false }
  };
}

function main(argv) {
  const dir = argv[2];
  if (!dir) {
    process.stderr.write('ocean-merge-eligibility-facts: missing facts directory argument\n');
    return 2;
  }
  const expected = process.env.EXPECTED;
  const checkName = process.env.CHECK_NAME || INDEPENDENT_REVIEW_CHECK;
  const facts = buildFacts({
    expected,
    certifiedSha: process.env.CERTIFIED_SHA,
    checkName,
    prNumber: process.env.PR_NUMBER ? Number(process.env.PR_NUMBER) : null,
    pr: readJsonOr(path.join(dir, 'pr.json'), null),
    master: readJsonOr(path.join(dir, 'master.json'), null),
    checks: readJsonOr(path.join(dir, 'checks.json'), null)
  });
  fs.writeFileSync(path.join(dir, 'facts.json'), `${JSON.stringify(facts, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(facts, null, 2)}\n`);
  return 0;
}

module.exports = { buildFacts, extractVerdict, main, selectReviewRun };

if (require.main === module) process.exitCode = main(process.argv);
