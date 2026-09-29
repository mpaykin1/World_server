#!/usr/bin/env node
'use strict';
// Fail-closed Ocean merge eligibility.
//
// The Ocean merge-eligibility gate previously asserted only that the Fleet PRE
// certificate SHA equalled the candidate head SHA. A candidate whose head SHA
// was independently rejected (World Independent Adversarial Review conclusion
// failure/action_required) was still reported READY_FOR_OCEAN=YES on the exact
// same SHA. This module makes the decision a pure, unit-tested function and
// hardens the existing job; it does not add a parallel gate.
//
// SECURITY: this file must only ever be executed from a trusted base checkout.
// A pull-request checkout must never be allowed to decide its own eligibility,
// so the workflow checks out current master and runs this code from there.
const cp = require('node:child_process');

const SHA = /^[a-f0-9]{40}$/i;
const REVIEW_CHECK_NAME = 'World Independent Adversarial Review';
const ONLY_ELIGIBLE_REVIEW = 'success';
const MAX_REASON_CHARS = 240;
const MAX_BUNDLED_CHARS = 4000;

function bounded(value, max = MAX_REASON_CHARS) {
  return String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

// Fail-closed normalisation: a draft state we could not determine is not a
// known-good non-draft PR.
function normaliseDraft(isDraft) {
  if (isDraft === true) return { known: true, draft: true };
  if (isDraft === false) return { known: true, draft: false };
  if (isDraft === 'true') return { known: true, draft: true };
  if (isDraft === 'false') return { known: true, draft: false };
  return { known: false, draft: true };
}

function normaliseConclusion(reviewConclusion) {
  if (reviewConclusion === null || reviewConclusion === undefined) return '';
  return bounded(reviewConclusion, 40).toLowerCase();
}

/**
 * Pure decision function. Every missing, malformed or unknown input makes the
 * candidate ineligible; there is no default-allow path.
 * @returns {{eligible: boolean, reasons: string[]}}
 */
function decideOceanMergeEligibility(input = {}) {
  const { headSha, certSha, reviewConclusion, baseSha, masterSha, isDraft } = input || {};
  const reasons = [];
  const head = bounded(headSha, 64);
  const cert = bounded(certSha, 64);
  const base = bounded(baseSha, 64);
  const master = bounded(masterSha, 64);
  const conclusion = normaliseConclusion(reviewConclusion);
  const draft = normaliseDraft(isDraft);

  if (!SHA.test(head)) reasons.push('candidate head SHA is missing or not an exact 40-character commit SHA');
  if (!SHA.test(cert)) reasons.push('Fleet PRE certificate SHA is missing or not an exact 40-character commit SHA');
  if (SHA.test(head) && SHA.test(cert) && cert !== head) {
    reasons.push(`Fleet PRE certificate ${cert} does not match candidate head ${head}`);
  }

  if (conclusion === '') {
    reasons.push(`independent review check "${REVIEW_CHECK_NAME}" has no completed result on this head SHA; absence is not approval`);
  } else if (conclusion !== ONLY_ELIGIBLE_REVIEW) {
    reasons.push(`independent review "${REVIEW_CHECK_NAME}" concluded ${conclusion}; only ${ONLY_ELIGIBLE_REVIEW} is merge-eligible`);
  }

  if (!SHA.test(base)) reasons.push('pull request base SHA is unknown; stale-base protection is inactive');
  if (!SHA.test(master)) reasons.push('current master head SHA is unknown; stale-base protection is inactive');
  if (SHA.test(base) && SHA.test(master) && base !== master) {
    reasons.push(`pull request base ${base} is behind current master ${master}; refresh the branch before integration`);
  }

  if (!draft.known) reasons.push('pull request draft state is unknown; a draft is never merge-eligible');
  else if (draft.draft) reasons.push('pull request is a draft; a draft is never merge-eligible');

  return { eligible: reasons.length === 0, reasons };
}

/**
 * Pure selection of the independent review conclusion from a GitHub
 * check-runs payload. Returns '' when the named check-run has no completed
 * result, and null when the named check-run is absent entirely. Both are
 * fail-closed for the caller.
 */
function findReviewConclusion(payload, name = REVIEW_CHECK_NAME) {
  const runs = Array.isArray(payload?.check_runs) ? payload.check_runs.filter(x => x && x.name === name) : [];
  if (!runs.length) return null;
  const completed = runs.filter(x => x.status === 'completed' && typeof x.conclusion === 'string' && x.conclusion);
  if (!completed.length) return '';
  // The newest completed run is authoritative; a re-run supersedes its predecessor.
  const latest = completed.reduce((a, b) => ((a.id || 0) >= (b.id || 0) ? a : b));
  return normaliseConclusion(latest.conclusion);
}

function gh(args, token) {
  return cp.execFileSync('gh', args, {
    encoding: 'utf8', maxBuffer: MAX_BUNDLED_CHARS,
    env: { ...process.env, GH_TOKEN: token || process.env.GITHUB_TOKEN || '' }
  });
}

function ghJson(args, token) {
  return JSON.parse(gh(args, token));
}

// Any unreadable GitHub state (fork PR, missing permission, transient API
// failure) is reported as null so the decision fails closed.
function readPullRequestState(token, prNumber, eventHead) {
  const state = { baseSha: '', masterSha: '', isDraft: undefined, headSha: '', error: '' };
  if (!/^[0-9]+$/.test(String(prNumber || ''))) {
    state.error = 'no pull_request context (manual workflow_dispatch run carries no PR state)';
    return state;
  }
  let pull;
  try {
    pull = ghJson(['api', `repos/${process.env.GITHUB_REPOSITORY || ''}/pulls/${prNumber}`], token);
  } catch (err) {
    state.error = `pull request ${prNumber} could not be read: ${bounded(err.message, 160)}`;
    return state;
  }
  state.headSha = bounded(pull?.head?.sha, 64);
  state.baseSha = bounded(pull?.base?.sha, 64);
  state.isDraft = pull?.draft === true;
  if (eventHead && state.headSha && state.headSha !== eventHead) {
    state.error = `pull request head moved to ${state.headSha} after this run started; require a fresh run`;
    return state;
  }
  try {
    const ref = ghJson(['api', `repos/${process.env.GITHUB_REPOSITORY || ''}/git/ref/heads/master`], token);
    state.masterSha = bounded(ref?.object?.sha, 64);
  } catch (err) {
    state.error = `current master head could not be read: ${bounded(err.message, 160)}`;
  }
  return state;
}

function readReviewConclusion(token, headSha) {
  if (!SHA.test(String(headSha || ''))) return null;
  try {
    const payload = ghJson(['api', `repos/${process.env.GITHUB_REPOSITORY || ''}/commits/${headSha}/check-runs?per_page=100`], token);
    return findReviewConclusion(payload);
  } catch {
    // A fork pull request may not be allowed to read check-runs at all.
    return null;
  }
}

function main() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
  const eventHead = bounded(process.env.EVENT_HEAD, 64);
  const prState = readPullRequestState(token, process.env.PR_NUMBER, eventHead);
  const headSha = prState.headSha || eventHead;
  const reviewConclusion = readReviewConclusion(token, headSha);
  const decision = decideOceanMergeEligibility({
    headSha, certSha: process.env.CERT_SHA, reviewConclusion,
    baseSha: prState.baseSha, masterSha: prState.masterSha, isDraft: prState.isDraft
  });
  const reasons = prState.error ? [prState.error, ...decision.reasons] : decision.reasons;
  const summary = {
    headSha, certSha: bounded(process.env.CERT_SHA, 64), baseSha: prState.baseSha,
    masterSha: prState.masterSha, isDraft: prState.isDraft,
    reviewCheck: REVIEW_CHECK_NAME, reviewConclusion, eligible: decision.eligible, reasons
  };
  console.log('[OCEAN_ELIGIBILITY] ' + JSON.stringify(summary));
  for (const reason of reasons) console.log('::error::Ocean merge eligibility rejected: ' + reason);
  if (!decision.eligible || prState.error) process.exitCode = 2;
  else console.log(`READY_FOR_OCEAN=YES SHA=${headSha}`);
}

if (require.main === module) main();
module.exports = { decideOceanMergeEligibility, findReviewConclusion, normaliseDraft, normaliseConclusion, REVIEW_CHECK_NAME, ONLY_ELIGIBLE_REVIEW };
