#!/usr/bin/env node
'use strict';
// Fail-closed Ocean merge-eligibility decision. Pure (no network, no I/O);
// executed by .github/workflows/fleet-pre-exact-sha.yml on the certified head.
//
// A candidate is READY_FOR_OCEAN only when ALL hold:
//   1. fleet-pre certification equals the expected exact head SHA;
//   2. the PR base ref is master (pull_request events);
//   3. the head is not behind current master (behind_by == 0);
//   4. the independent adversarial review check on the exact head concludes
//      `success` (pull_request events).
// Every missing/invalid input fails closed. Non-PR dispatch runs still
// require exact-SHA certification and master freshness; the independent
// review requirement applies to PR merge decisions.
const SHA = /^[a-f0-9]{40}$/i;

function evaluateOceanEligibility({
  expectedSha, certifiedSha, baseRef, behindBy, reviewConclusion, event,
}) {
  const eventName = event || 'pull_request';
  if (!SHA.test(String(certifiedSha || ''))) {
    return { ok: false, reason: 'MISSING_CERTIFIED_SHA' };
  }
  if (!SHA.test(String(expectedSha || ''))) {
    return { ok: false, reason: 'MISSING_EXPECTED_SHA' };
  }
  if (certifiedSha !== expectedSha) {
    return { ok: false, reason: 'STALE_CERTIFICATE', detail: 'certified != expected head' };
  }
  if (baseRef && baseRef !== 'master') {
    return { ok: false, reason: 'PR_BASE_NOT_MASTER', detail: String(baseRef) };
  }
  const behindValue = behindBy === undefined || behindBy === null ? '' : String(behindBy);
  if (!/^\d+$/.test(behindValue)) {
    return { ok: false, reason: 'UNKNOWN_AHEAD_BEHIND' };
  }
  if (Number(behindValue) > 0) {
    return { ok: false, reason: 'PR_BEHIND_MASTER', detail: `behind_by=${behindValue}` };
  }
  if (eventName === 'pull_request') {
    if (reviewConclusion !== 'success') {
      return {
        ok: false,
        reason: 'INDEPENDENT_REVIEW_NOT_PASS',
        detail: reviewConclusion === undefined || reviewConclusion === null ? 'missing' : String(reviewConclusion),
      };
    }
    return { ok: true, reason: 'READY_FOR_OCEAN' };
  }
  return { ok: true, reason: 'CERTIFIED_FRESH_NO_PR' };
}

module.exports = { evaluateOceanEligibility };

if (require.main === module) {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) {
      throw new Error('Expected --name value arguments');
    }
    args[argv[i].slice(2)] = argv[i + 1];
  }
  const verdict = evaluateOceanEligibility({
    expectedSha: args['expected-sha'],
    certifiedSha: args['certified-sha'],
    baseRef: args['base-ref'],
    behindBy: args['behind-by'],
    reviewConclusion: args['review-conclusion'],
    event: args.event,
  });
  console.log(`OCEAN_ELIGIBILITY=${verdict.ok ? 'PASS' : 'BLOCK'} REASON=${verdict.reason}${verdict.detail ? ` DETAIL=${verdict.detail}` : ''}`);
  process.exit(verdict.ok ? 0 : 1);
}