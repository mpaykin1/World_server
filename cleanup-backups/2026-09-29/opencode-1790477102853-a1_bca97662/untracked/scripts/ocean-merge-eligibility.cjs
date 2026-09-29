#!/usr/bin/env node
'use strict';
// Fail-closed Ocean merge-eligibility decision.
//
// The certificate produced by the fleet-pre job only proves that syntax and
// causal tests passed on one exact head SHA. It is NOT an independent
// adversarial verdict, and it says nothing about the pull request being
// current, reviewable or no longer a draft. Emitting READY_FOR_OCEAN=YES from
// the certificate alone produced a green merge-eligibility gate sitting
// directly beside a red independent review.
//
// This module decides eligibility from evidence, never from the absence of
// evidence. Every missing, malformed, stale or unrecognised input is
// ineligible. There is no code path that returns eligible by default.
//
// This module does not merge, deploy, self-certify live state, or grant merge
// protection. It only refuses to authorise; only Ocean integrates, and only
// Fleet independently verifies live.

const SHA = /^[a-f0-9]{40}$/;
// The one and only acceptable independent-review conclusion.
const APPROVED = new Set(['success']);
// A blocking verdict is a final answer: stop polling and refuse immediately.
const BLOCKING = new Set(['failure', 'action_required']);
// A completed non-approval that is neither final nor absent. The reviewer uses
// concurrency cancel-in-progress, so a superseded run can land here before its
// replacement is created. Keep polling, but never treat it as approval.
const INCOMPLETE = new Set(['neutral', 'skipped', 'stale', 'startup_failure', 'timed_out']);
// A run that exists but has not produced a conclusion yet.
const RUNNING = new Set(['queued', 'in_progress', 'waiting', 'requested', 'pending']);
// Nothing was published for this head at all.
const ABSENT = new Set(['', 'absent', 'missing', 'none', 'null', 'not_found', 'no_check_run']);

// Reason tokens are `CODE` or `CODE VERDICT=<observed value>`. The observed
// value is echoed verbatim (already normalised) so the CI log always names the
// real verdict instead of a paraphrase.
function reason(code, detail) {
  return detail ? code + ' ' + detail : code;
}

function normalizeConclusion(value) {
  return String(value === undefined || value === null ? '' : value).trim().toLowerCase();
}

function normalizeDraft(value) {
  if (value === true) return true;
  if (value === false) return false;
  const text = String(value === undefined || value === null ? '' : value).trim().toLowerCase();
  if (text === 'true') return true;
  if (text === 'false') return false;
  return null;
}

/**
 * Decide whether Ocean may treat this exact head as an integration candidate.
 *
 * @param {object} input
 * @param {string} input.headSha Exact candidate head SHA under consideration.
 * @param {string} input.certSha SHA certified by the fleet-pre job.
 * @param {string} input.reviewConclusion Latest independent-review check
 *   conclusion for the exact head, or an `absent`/`pending` marker.
 * @param {string} input.baseSha Pull request base SHA.
 * @param {string} input.masterSha Current master head SHA.
 * @param {boolean|string} input.isDraft Pull request draft state.
 * @param {boolean|string} [input.hasPullRequestContext] False for
 *   workflow_dispatch, which has no pull request to review.
 * @returns {{eligible: boolean, skipped: boolean, reasons: string[]}}
 */
function decideOceanEligibility(input = {}) {
  const headSha = String(input.headSha || '').trim().toLowerCase();
  const certSha = String(input.certSha || '').trim().toLowerCase();
  const baseSha = String(input.baseSha || '').trim().toLowerCase();
  const masterSha = String(input.masterSha || '').trim().toLowerCase();
  const isDraft = normalizeDraft(input.isDraft);
  const hasPrContext = input.hasPullRequestContext === undefined
    ? true : input.hasPullRequestContext === true || input.hasPullRequestContext === 'true';

  const reasons = [];

  // The certificate is the only evidence available without PR context, so it
  // is checked first and unconditionally. A missing or stale certificate is a
  // real failure in every trigger mode.
  if (!certSha) reasons.push(reason('certificate_missing'));
  else if (!SHA.test(certSha)) reasons.push(reason('certificate_malformed'));
  else if (headSha && SHA.test(headSha) && certSha !== headSha) reasons.push(reason('certificate_stale'));

  if (!headSha) {
    reasons.push(reason('head_sha_missing'));
    return { eligible: false, skipped: false, reasons };
  }
  if (!SHA.test(headSha)) {
    reasons.push(reason('head_sha_malformed'));
    return { eligible: false, skipped: false, reasons };
  }

  // No pull request context: preserve the historical certificate-only dispatch
  // behaviour. Never emit a positive readiness signal, and never fail the
  // dispatch for a pull-request condition that does not exist here.
  if (!hasPrContext) {
    return { eligible: false, skipped: reasons.length === 0, reasons };
  }

  if (isDraft === null) {
    reasons.push(reason('draft_state_unknown'));
  } else if (isDraft) {
    reasons.push(reason('draft_pr'));
  }

  if (!baseSha) reasons.push(reason('pr_base_missing'));
  else if (!SHA.test(baseSha)) reasons.push(reason('pr_base_malformed'));
  if (!masterSha) reasons.push(reason('master_ref_missing'));
  else if (!SHA.test(masterSha)) reasons.push(reason('master_ref_malformed'));
  if (SHA.test(baseSha) && SHA.test(masterSha) && baseSha !== masterSha) {
    reasons.push(reason('base_not_current_master'));
  }

  const conclusion = normalizeConclusion(input.reviewConclusion);
  const detail = reason('verdict', conclusion || 'absent');
  if (APPROVED.has(conclusion)) {
    // Only an independent PASS continues to the other evidence checks.
  } else if (BLOCKING.has(conclusion)) reasons.push(reason('review_verdict_block', conclusion));
  else if (INCOMPLETE.has(conclusion)) reasons.push(reason('review_verdict_not_success', conclusion));
  else if (RUNNING.has(conclusion)) reasons.push(reason('review_verdict_pending', conclusion));
  else if (ABSENT.has(conclusion)) reasons.push(reason('review_verdict_missing'));
  else reasons.push(reason('review_verdict_unknown', conclusion));

  // Eligibility is derived only from the explicit evidence checks above, and
  // only an exact clean set authorises. A field this function does not model
  // cannot reach the result, so no input can widen eligibility by omission.
  return { eligible: reasons.length === 0, skipped: false, reasons };
}

function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i].startsWith('--') || !args[i + 1]) throw new Error('Expected --name value');
    out[args[i].slice(2)] = args[i + 1];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const decision = decideOceanEligibility({
    headSha: args['head-sha'] || '',
    certSha: args['cert-sha'] || '',
    reviewConclusion: args['review-conclusion'] || '',
    baseSha: args['base-sha'] || '',
    masterSha: args['master-sha'] || '',
    isDraft: args['is-draft'] || '',
    hasPullRequestContext: args['pull-request-context'] || 'true'
  });
  if (decision.skipped) {
    console.log('READY_FOR_OCEAN=SKIPPED_NO_PR_CONTEXT');
    return;
  }
  if (decision.eligible) {
    console.log('READY_FOR_OCEAN=YES SHA=' + String(args['head-sha'] || '').trim().toLowerCase());
    return;
  }
  for (const line of decision.reasons) console.log('REASON=' + line);
  console.log('READY_FOR_OCEAN=NO');
  process.exitCode = 2;
}

if (require.main === module) {
  try { main(); } catch (err) {
    console.log('REASON=invocation_error');
    console.log('READY_FOR_OCEAN=NO');
    process.exitCode = 2;
  }
}

module.exports = { decideOceanEligibility, normalizeConclusion, normalizeDraft };
