'use strict';

// Ocean protected integration: fail-closed merge eligibility.
//
// Historical regression: the `Ocean merge eligibility` job in
// .github/workflows/fleet-pre-exact-sha.yml certified `READY_FOR_OCEAN=YES`
// from certificate-SHA == head-SHA alone. That let a PR be declared Ocean
// ready while the exact-head `World Independent Adversarial Review` check was
// FAILURE/ACTION_REQUIRED and while the base was behind master
// (observed on #278/#289/#295/#298/#291).
//
// This module is the single fail-closed decision for that gate. It is pure so
// the decision is unit-testable without any network or GitHub call. Any
// missing, unparsable or unknown input is a blocker, never a pass.

const PROTECTED_BASE_BRANCH = 'master';
const INDEPENDENT_REVIEW_CHECK = 'World Independent Adversarial Review';
const SHA_PATTERN = /^[0-9a-f]{40}$/;

const BLOCKER_MESSAGES = {
  NO_PULL_REQUEST_CONTEXT:
    'no pull request context: dispatch the gate with an explicit pr_number input',
  INVALID_HEAD_SHA: 'expected candidate head is not a 40-character lowercase commit SHA',
  INVALID_TRUSTED_MASTER_SHA: 'current master SHA could not be resolved; refusing to certify',
  MISSING_CERTIFICATE: 'Fleet PRE certificate is missing; refusing to certify',
  STALE_CERTIFICATE: 'Fleet PRE certificate SHA does not equal the candidate head SHA',
  PR_HEAD_MISMATCH: 'pull request head moved after the gate was queued; require a fresh run',
  BASE_NOT_PROTECTED_MASTER: 'pull request base branch is not the protected master branch',
  BASE_NOT_CURRENT_MASTER: 'pull request base is not current master; rebase before integration',
  UNRESOLVED_CONFLICT: 'pull request has an unresolved conflict or an unverified mergeable state',
  DRAFT_PULL_REQUEST: 'pull request is still a draft',
  INDEPENDENT_REVIEW_MISSING:
    'no independent adversarial review check run found on the exact head SHA',
  INDEPENDENT_REVIEW_WRONG_SHA: 'independent adversarial review is not bound to the candidate head SHA',
  INDEPENDENT_REVIEW_NOT_COMPLETED: 'independent adversarial review has not completed on this head SHA',
  INDEPENDENT_REVIEW_BLOCKED: 'independent adversarial review verdict is BLOCK',
  INDEPENDENT_REVIEW_INCONCLUSIVE:
    'independent adversarial review verdict is not PASS; an inconclusive review is never approval'
};

function isSha(value) {
  return typeof value === 'string' && SHA_PATTERN.test(value);
}

function addBlockers(blockers, code, detail) {
  blockers.push({ code, message: BLOCKER_MESSAGES[code] || code, detail: detail || null });
}

function evaluateIndependentReview(review, headSha, blockers) {
  if (!review || review.found !== true) {
    addBlockers(blockers, 'INDEPENDENT_REVIEW_MISSING', review ? review.status : null);
    return;
  }
  if (review.head_sha !== headSha) {
    addBlockers(blockers, 'INDEPENDENT_REVIEW_WRONG_SHA', review.head_sha || null);
    return;
  }
  if (review.status !== 'completed') {
    addBlockers(blockers, 'INDEPENDENT_REVIEW_NOT_COMPLETED', review.status || null);
    return;
  }
  if (review.conclusion === 'success' && review.verdict === 'PASS') return;
  if (review.conclusion === 'failure' || review.verdict === 'BLOCK') {
    addBlockers(blockers, 'INDEPENDENT_REVIEW_BLOCKED', review.conclusion);
    return;
  }
  addBlockers(blockers, 'INDEPENDENT_REVIEW_INCONCLUSIVE', review.conclusion || review.status || null);
}

function evaluatePullRequest(facts, blockers) {
  if (!facts || typeof facts !== 'object') {
    addBlockers(blockers, 'NO_PULL_REQUEST_CONTEXT');
    return;
  }
  if (!facts.prNumber && !facts.headSha && !facts.baseRef) {
    addBlockers(blockers, 'NO_PULL_REQUEST_CONTEXT');
    return;
  }
  if (facts.draft === true) addBlockers(blockers, 'DRAFT_PULL_REQUEST', String(facts.prNumber || ''));
  if (facts.baseRef !== PROTECTED_BASE_BRANCH) {
    addBlockers(blockers, 'BASE_NOT_PROTECTED_MASTER', facts.baseRef || null);
  }
  if (!facts.mergeable || facts.mergeableState !== 'clean') {
    addBlockers(blockers, 'UNRESOLVED_CONFLICT', facts.mergeableState || null);
  }
  if (isSha(facts.trustedMasterSha) && isSha(facts.baseSha) && facts.baseSha !== facts.trustedMasterSha) {
    addBlockers(blockers, 'BASE_NOT_CURRENT_MASTER', facts.baseSha);
  }
}

function evaluateOceanEligibility(facts) {
  const input = facts && typeof facts === 'object' ? facts : {};
  const blockers = [];
  const expectedHead = input.expectedHeadSha;

  if (!isSha(expectedHead)) addBlockers(blockers, 'INVALID_HEAD_SHA', expectedHead || null);
  if (!isSha(input.trustedMasterSha)) {
    addBlockers(blockers, 'INVALID_TRUSTED_MASTER_SHA', input.trustedMasterSha || null);
  }

  if (!input.certifiedSha) {
    addBlockers(blockers, 'MISSING_CERTIFICATE');
  } else if (isSha(expectedHead) && input.certifiedSha !== expectedHead) {
    addBlockers(blockers, 'STALE_CERTIFICATE', input.certifiedSha);
  }

  if (isSha(expectedHead) && isSha(input.headSha) && input.headSha !== expectedHead) {
    addBlockers(blockers, 'PR_HEAD_MISMATCH', input.headSha);
  }

  evaluatePullRequest(input, blockers);

  if (isSha(expectedHead)) evaluateIndependentReview(input.review, expectedHead, blockers);

  const ready = blockers.length === 0;
  return {
    ready,
    sha: ready ? expectedHead : null,
    blockers
  };
}

module.exports = {
  BLOCKER_MESSAGES,
  INDEPENDENT_REVIEW_CHECK,
  PROTECTED_BASE_BRANCH,
  evaluateOceanEligibility,
  isSha
};
