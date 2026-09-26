'use strict';

// Ocean protected integration: the single fail-closed integration gate.
//
// ROLE: OCEAN PROTECTED INTEGRATION integrates only an exact-current-head Fleet
// PRE candidate. Everything else is a rejection, never a warning:
//   * stale certificate (certificate head != candidate head)
//   * stale canonical base (the exact (head, base) pair advanced after cert)
//   * mismatch (PR head moved, base is not the protected branch, base behind)
//   * unresolved conflict / unknown mergeable state
//   * missing rollback identity (no current trusted master to revert to)
//   * duplicate or parallel gate system
//   * missing / blocked / inconclusive independent adversarial review
//
// Historical regression this exists to close: the previous
// `.github/workflows/fleet-pre-exact-sha.yml` `Ocean merge eligibility` job
// printed `READY_FOR_OCEAN=YES` from certificate-SHA == head-SHA alone. That let
// a pull request be declared Ocean ready while its exact-head
// `World Independent Adversarial Review` check was FAILURE/ACTION_REQUIRED and
// while its base was behind master (observed on #278/#289/#295/#298/#291).
//
// This module is pure on purpose: CI and the local regression suite execute the
// exact same decision code, and no PR-controlled file is ever executed to make
// the decision. Every missing, malformed, unknown or unverifiable input is a
// blocker. There is no allow-by-default branch anywhere in this file.

const OCEAN_GATE_ROLE = 'OCEAN_PROTECTED_INTEGRATION';
const OCEAN_GATE_MODULE = 'lib/ocean-merge-eligibility.js';

const PROTECTED_BASE_BRANCH = 'master';
const INDEPENDENT_REVIEW_CHECK = 'World Independent Adversarial Review';
const FLEET_PRE_KIND = 'FLEET_PRE';
const FLEET_PRE_PASS = 'PASS';
const SHA_PATTERN = /^[0-9a-f]{40}$/;

// POST scenarios Fleet must replay after an Ocean integration. The gate refuses
// to certify a candidate when the handoff cannot state them, because an
// integration nobody can re-drive is not a completed integration.
const REQUIRED_POST_SCENARIO_FIELDS = Object.freeze(['id', 'method', 'path', 'expect']);

const BLOCKER_MESSAGES = Object.freeze({
  NO_PULL_REQUEST_CONTEXT:
    'no pull request context: the gate must be dispatched with an explicit pr_number',
  INVALID_HEAD_SHA:
    'candidate head is not a 40-character lowercase commit SHA',
  ROLLBACK_MISSING:
    'current trusted master SHA could not be resolved: integration would have no rollback identity',
  MISSING_CERTIFICATE:
    'Fleet PRE certificate is missing: refusing to certify',
  MALFORMED_CERTIFICATE:
    'Fleet PRE certificate is not parsable JSON',
  CERTIFICATE_NOT_FLEET_PRE:
    'certificate is not a Fleet PRE certificate',
  CERTIFICATE_NOT_PASS:
    'Fleet PRE certificate verdict is not PASS',
  CERTIFICATE_HEAD_MISSING:
    'Fleet PRE certificate does not name a valid candidate head',
  CERTIFICATE_BASE_MISSING:
    'Fleet PRE certificate does not bind a valid canonical base SHA',
  STALE_CERTIFICATE:
    'Fleet PRE certificate SHA does not equal the candidate head SHA',
  STALE_CANONICAL_BASE:
    'canonical base advanced after certification: the certified (head, base) pair is stale',
  PR_HEAD_MISMATCH:
    'pull request head moved after the gate was queued: require a fresh run',
  DRAFT_PULL_REQUEST:
    'pull request is still a draft',
  BASE_NOT_PROTECTED_MASTER:
    'pull request base branch is not the protected master branch',
  BASE_NOT_CURRENT_MASTER:
    'pull request base is not current master: rebase before integration',
  UNRESOLVED_CONFLICT:
    'pull request has an unresolved conflict or an unverified mergeable state',
  INDEPENDENT_REVIEW_MISSING:
    'no independent adversarial review check run found on the exact head SHA',
  INDEPENDENT_REVIEW_WRONG_SHA:
    'independent adversarial review is not bound to the candidate head SHA',
  INDEPENDENT_REVIEW_NOT_COMPLETED:
    'independent adversarial review has not completed on this head SHA',
  INDEPENDENT_REVIEW_BLOCKED:
    'independent adversarial review verdict is BLOCK',
  INDEPENDENT_REVIEW_INCONCLUSIVE:
    'independent adversarial review verdict is not PASS: an inconclusive review is never approval',
  DUPLICATE_PARALLEL_SYSTEM:
    'more than one module claims the Ocean integration gate role: refusing to certify through a parallel system'
});

const HANDOFF_MISSING = Object.freeze({
  CANDIDATE_SHA: 'handoff must state the exact candidate SHA',
  INTEGRATED_SHA: 'handoff must state the integrated/default SHA',
  PREVIOUS_LKG: 'handoff must state the previous known-good SHA',
  ROLLBACK: 'handoff must state the rollback identity',
  DEPLOYMENT_IDENTITY: 'handoff must state the deployment identity',
  DEPLOYMENT_URL: 'handoff must state the deployment URL',
  POST_SCENARIOS: 'handoff must state the exact POST scenarios Fleet must replay',
  POST_SCENARIO_INCOMPLETE: 'every POST scenario needs id, method, path and expect',
  SELF_CERTIFIED_LIVE: 'handoff must not claim live self-certification: Ocean never self-certifies live'
});

function isSha(value) {
  return typeof value === 'string' && SHA_PATTERN.test(value);
}

function normalizeSha(value) {
  return isSha(value) ? value : '';
}

function parseCertificate(raw) {
  if (raw === null || raw === undefined) return null;
  let parsed = raw;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return null;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { malformed: true };
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { malformed: true };
  return parsed;
}

function addBlocker(blockers, code, detail) {
  blockers.push({ code, message: BLOCKER_MESSAGES[code] || code, detail: detail === undefined ? null : detail });
}

function blockerCodes(blockers) {
  return blockers.map((b) => b.code);
}

function evaluateCertificate(certificate, candidateHead, canonicalBase, blockers) {
  const parsed = parseCertificate(certificate);
  if (parsed === null) {
    addBlocker(blockers, 'MISSING_CERTIFICATE');
    return { certificateSha: '', certificateBaseSha: '', certificateRunId: '' };
  }
  if (parsed.malformed === true) {
    addBlocker(blockers, 'MALFORMED_CERTIFICATE');
    return { certificateSha: '', certificateBaseSha: '', certificateRunId: '' };
  }
  if (parsed.kind !== FLEET_PRE_KIND) {
    addBlocker(blockers, 'CERTIFICATE_NOT_FLEET_PRE', parsed.kind || null);
    return { certificateSha: '', certificateBaseSha: '', certificateRunId: '' };
  }
  if (parsed.verdict !== FLEET_PRE_PASS) {
    addBlocker(blockers, 'CERTIFICATE_NOT_PASS', parsed.verdict || null);
    return { certificateSha: '', certificateBaseSha: '', certificateRunId: '' };
  }

  const certificateSha = normalizeSha(parsed.sha);
  const certificateBaseSha = normalizeSha(parsed.baseSha);
  const certificateRunId = typeof parsed.runId === 'string' ? parsed.runId.slice(0, 64) : '';
  if (!certificateSha) addBlocker(blockers, 'CERTIFICATE_HEAD_MISSING', parsed.sha || null);
  if (!certificateBaseSha) addBlocker(blockers, 'CERTIFICATE_BASE_MISSING', parsed.baseSha || null);

  if (certificateSha && candidateHead && certificateSha !== candidateHead) {
    addBlocker(blockers, 'STALE_CERTIFICATE', certificateSha);
  }
  if (certificateBaseSha && canonicalBase && certificateBaseSha !== canonicalBase) {
    addBlocker(blockers, 'STALE_CANONICAL_BASE', certificateBaseSha);
  }
  return { certificateSha, certificateBaseSha, certificateRunId };
}

function evaluatePullRequest(pr, canonicalBase, blockers) {
  if (!pr || typeof pr !== 'object') {
    addBlocker(blockers, 'NO_PULL_REQUEST_CONTEXT');
    return;
  }
  if (!pr.number && !pr.headSha && !pr.baseRef) {
    addBlocker(blockers, 'NO_PULL_REQUEST_CONTEXT');
    return;
  }
  if (pr.draft === true) addBlocker(blockers, 'DRAFT_PULL_REQUEST', pr.number || null);
  if (pr.baseRef !== PROTECTED_BASE_BRANCH) {
    addBlocker(blockers, 'BASE_NOT_PROTECTED_MASTER', pr.baseRef || null);
  }
  if (pr.mergeable !== true || pr.mergeableState !== 'clean') {
    addBlocker(blockers, 'UNRESOLVED_CONFLICT', pr.mergeableState || (pr.mergeable === false ? 'false' : 'unknown'));
  }
  if (canonicalBase && isSha(pr.baseSha) && pr.baseSha !== canonicalBase) {
    addBlocker(blockers, 'BASE_NOT_CURRENT_MASTER', pr.baseSha);
  }
}

function evaluateIndependentReview(review, candidateHead, blockers) {
  if (!review || review.found !== true) {
    addBlocker(blockers, 'INDEPENDENT_REVIEW_MISSING', review ? review.status || null : null);
    return;
  }
  if (review.head_sha !== candidateHead) {
    addBlocker(blockers, 'INDEPENDENT_REVIEW_WRONG_SHA', review.head_sha || null);
    return;
  }
  if (review.status !== 'completed') {
    addBlocker(blockers, 'INDEPENDENT_REVIEW_NOT_COMPLETED', review.status || null);
    return;
  }
  if (review.conclusion === 'success' && review.verdict === FLEET_PRE_PASS) return;
  if (review.conclusion === 'failure' || review.verdict === 'BLOCK') {
    addBlocker(blockers, 'INDEPENDENT_REVIEW_BLOCKED', review.conclusion || review.verdict);
    return;
  }
  addBlocker(blockers, 'INDEPENDENT_REVIEW_INCONCLUSIVE', review.conclusion || review.status || null);
}

function evaluateGateAuthority(siblingGateModules, blockers) {
  if (!Array.isArray(siblingGateModules)) return;
  const claimants = siblingGateModules.filter((p) => p !== OCEAN_GATE_MODULE);
  if (claimants.length > 0) addBlocker(blockers, 'DUPLICATE_PARALLEL_SYSTEM', claimants.join(','));
}

// The one executable decision. Returns every blocker it found, never a soft pass.
function evaluateOceanEligibility(facts) {
  const input = facts && typeof facts === 'object' ? facts : {};
  const blockers = [];

  const candidateHead = normalizeSha(input.expectedHeadSha);
  const canonicalBase = normalizeSha(input.trustedMasterSha);

  if (!candidateHead) addBlocker(blockers, 'INVALID_HEAD_SHA', input.expectedHeadSha || null);
  if (!canonicalBase) addBlocker(blockers, 'ROLLBACK_MISSING', input.trustedMasterSha || null);

  const certificateIdentity = evaluateCertificate(input.certificate, candidateHead, canonicalBase, blockers);

  if (candidateHead && isSha(input.pr && input.pr.headSha) && input.pr.headSha !== candidateHead) {
    addBlocker(blockers, 'PR_HEAD_MISMATCH', input.pr.headSha);
  }

  evaluatePullRequest(input.pr, canonicalBase, blockers);
  evaluateGateAuthority(input.siblingGateModules, blockers);

  // An unresolvable head cannot be matched against a review, so an unknown head
  // is already a blocker; only bind the review once the head is trustworthy.
  if (candidateHead) evaluateIndependentReview(input.review, candidateHead, blockers);

  const ready = blockers.length === 0;
  return {
    ready,
    // Diagnostic only: which head this run was asked about.
    attemptedHeadSha: candidateHead,
    // A non-ready decision never names an integration SHA. Fabricating one here
    // is exactly how a stale candidate gets integrated.
    candidateSha: ready ? candidateHead : null,
    rollbackSha: ready ? canonicalBase : null,
    certificateSha: certificateIdentity.certificateSha,
    certificateBaseSha: certificateIdentity.certificateBaseSha,
    certificateRunId: certificateIdentity.certificateRunId,
    blockers,
    blockerCodes: blockerCodes(blockers)
  };
}

// Find every module that claims the Ocean integration gate role. The canonical
// module is always first; any additional claimant is a parallel gate that must
// be rejected rather than merged. Scanning is content-based and read-only.
function discoverGateClaimants(root, fsModule, pathModule) {
  const fsImpl = fsModule || require('fs');
  const pathImpl = pathModule || require('path');
  const claimants = [];
  for (const dir of ['lib', 'scripts']) {
    let entries = [];
    try {
      entries = fsImpl.readdirSync(pathImpl.join(root, dir));
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith('.js')) continue;
      const rel = `${dir}/${entry}`;
      if (rel === OCEAN_GATE_MODULE) continue;
      let source = '';
      try {
        source = fsImpl.readFileSync(pathImpl.join(root, rel), 'utf8');
      } catch {
        continue;
      }
      if (source.includes(OCEAN_GATE_ROLE) && source.includes('READY_FOR_OCEAN')) claimants.push(rel);
    }
  }
  return [OCEAN_GATE_MODULE, ...claimants];
}

// One stable, machine-greppable line. Never fabricates eligibility.
function formatEligibility(decision) {
  if (!decision || decision.ready !== true) {
    const codes = (decision && Array.isArray(decision.blockerCodes) ? decision.blockerCodes : []).join(',');
    return 'READY_FOR_OCEAN=NO BLOCKERS=' + (codes || 'UNKNOWN') +
      ' CANDIDATE=' + String((decision && decision.attemptedHeadSha) || 'unknown');
  }
  return 'READY_FOR_OCEAN=YES CANDIDATE=' + decision.candidateSha +
    ' ROLLBACK=' + decision.rollbackSha +
    ' CERT_RUN=' + (decision.certificateRunId || 'unknown');
}

// The Ocean -> Fleet hand-back record. It is itself fail-closed: an integration
// whose identity, rollback, deployment and replay scenarios are not all stated
// is reported as NOT handed off rather than handed off with blanks.
function buildIntegrationHandoff(handoff) {
  const input = handoff && typeof handoff === 'object' ? handoff : {};
  const missing = [];
  const requireSha = (field, code) => {
    if (!isSha(input[field])) missing.push(code);
    return normalizeSha(input[field]);
  };

  const candidateSha = requireSha('candidateSha', HANDOFF_MISSING.CANDIDATE_SHA);
  const integratedSha = requireSha('integratedSha', HANDOFF_MISSING.INTEGRATED_SHA);
  const previousLkgSha = requireSha('previousLkgSha', HANDOFF_MISSING.PREVIOUS_LKG);
  const rollbackSha = requireSha('rollbackSha', HANDOFF_MISSING.ROLLBACK);

  const deploymentIdentity = typeof input.deploymentIdentity === 'string' ? input.deploymentIdentity.trim() : '';
  const deploymentUrl = typeof input.deploymentUrl === 'string' ? input.deploymentUrl.trim() : '';
  if (!deploymentIdentity) missing.push(HANDOFF_MISSING.DEPLOYMENT_IDENTITY);
  if (!deploymentUrl) missing.push(HANDOFF_MISSING.DEPLOYMENT_URL);

  const rawScenarios = Array.isArray(input.postScenarios) ? input.postScenarios : [];
  if (rawScenarios.length === 0) {
    missing.push(HANDOFF_MISSING.POST_SCENARIOS);
  } else {
    for (const scenario of rawScenarios) {
      if (!scenario || typeof scenario !== 'object') {
        missing.push(HANDOFF_MISSING.POST_SCENARIO_INCOMPLETE);
        continue;
      }
      const complete = REQUIRED_POST_SCENARIO_FIELDS.every(
        (field) => typeof scenario[field] === 'string' && scenario[field].trim() !== ''
      );
      if (!complete) missing.push(HANDOFF_MISSING.POST_SCENARIO_INCOMPLETE);
    }
  }

  // Ocean never certifies live itself; a handoff that claims it did is invalid.
  if (input.liveSelfCertified === true) missing.push(HANDOFF_MISSING.SELF_CERTIFIED_LIVE);

  const uniqueMissing = [...new Set(missing)];
  return {
    handedOff: uniqueMissing.length === 0,
    missing: uniqueMissing,
    handoff: {
      role: OCEAN_GATE_ROLE,
      candidateSha,
      integratedSha,
      previousLkgSha,
      rollbackSha,
      deploymentIdentity,
      deploymentUrl,
      postScenarios: rawScenarios
    }
  };
}

module.exports = {
  OCEAN_GATE_ROLE,
  OCEAN_GATE_MODULE,
  PROTECTED_BASE_BRANCH,
  INDEPENDENT_REVIEW_CHECK,
  FLEET_PRE_KIND,
  FLEET_PRE_PASS,
  BLOCKER_MESSAGES,
  HANDOFF_MISSING,
  REQUIRED_POST_SCENARIO_FIELDS,
  isSha,
  normalizeSha,
  parseCertificate,
  discoverGateClaimants,
  evaluateOceanEligibility,
  formatEligibility,
  buildIntegrationHandoff
};
