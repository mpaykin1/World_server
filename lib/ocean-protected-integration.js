'use strict';

/**
 * Ocean protected integration — machine-readable, fail-closed eligibility predicate.
 *
 * Ocean integrates exactly one candidate: the exact-current-head independent
 * Fleet PRE READY_FOR_OCEAN candidate. This module is the only place that decides
 * eligibility, so the prose contract in CHATGPT_GAME_CONTROL.md cannot drift into
 * an unchecked merge path.
 *
 * Pure by contract: no filesystem, network, git or clock access. The CLI in
 * scripts/check-ocean-protected-integration.js owns all I/O and passes context in.
 */

const policy = require('../data/ocean-protected-integration-policy.json');
const deploymentIdentity = require('../data/cloudflare-deployment-identity.json');

const REJECTION_CODES = Object.freeze(Object.keys(policy.rejectionCodes));
const REJECTION_ORDER = Object.freeze(policy.rejectionCodes);

function normalizeSha(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

function isShaLike(value) {
  return /^[0-9a-f]{7,40}$/.test(normalizeSha(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function matchesCanonicalPath(declaredPath, canonicalPath) {
  const a = String(declaredPath || '').replace(/\\/g, '/').replace(/^\.\//, '').trim();
  const b = String(canonicalPath || '').replace(/\\/g, '/').trim();
  if (!a || !b) return false;
  return a === b || a.startsWith(`${b}/`);
}

function rejection(code, detail) {
  if (!REJECTION_ORDER[code]) throw new Error(`Unknown Ocean rejection code: ${code}`);
  return { code, reason: REJECTION_ORDER[code], detail: detail || '' };
}

function evaluateMergeConflict(status) {
  const value = String(status == null ? '' : status).trim().toLowerCase();
  return policy.mergeConflictStatuses.resolved === value;
}

/**
 * Detect a second/parallel implementation of a canonical Ocean-owned system.
 * Fails closed: any declared system that owns a canonical path under a different
 * identity is a duplicate, even if it claims to be a superset.
 */
function findDuplicateSystems(systems) {
  const declared = Array.isArray(systems) ? systems.filter(isPlainObject) : [];
  const duplicates = [];
  for (const system of policy.invariantSystems) {
    for (const other of declared) {
      if (String(other.id || '') === system.id) continue;
      const ownsCanonicalPath = (other.paths || [other.path])
        .some((p) => (system.canonicalPaths || []).some((c) => matchesCanonicalPath(p, c)));
      if (!ownsCanonicalPath) continue;
      duplicates.push({
        code: 'DUPLICATE_PARALLEL_SYSTEM',
        declaredId: String(other.id || ''),
        canonicalSystemId: system.id,
        sharedPaths: (other.paths || [other.path]).filter((p) =>
          (system.canonicalPaths || []).some((c) => matchesCanonicalPath(p, c))
        ),
      });
    }
  }
  return duplicates;
}

/**
 * @param {object} candidate  { candidateSha, currentDefaultSha, previousLkg,
 *                              rollbackTarget, mergeConflictStatus,
 *                              certificate, systems }
 * @param {object} context    { currentHeadSha } — actual observed head, when known
 * @returns {{readyForOcean:boolean, verdict:'READY_FOR_OCEAN'|'REJECTED',
 *            candidateSha:string, rejections:Array}}
 */
function evaluateOceanEligibility(candidate = {}, context = {}) {
  const input = isPlainObject(candidate) ? candidate : {};
  const ctx = isPlainObject(context) ? context : {};
  const found = new Map();

  const add = (code, detail) => {
    if (!found.has(code)) found.set(code, rejection(code, detail));
  };

  const candidateSha = normalizeSha(input.candidateSha);
  const currentDefaultSha = normalizeSha(input.currentDefaultSha);
  const previousLkg = normalizeSha(input.previousLkg);
  const rollbackTarget = normalizeSha(input.rollbackTarget);

  if (!candidateSha) add('MISSING_CANDIDATE_SHA', 'candidateSha is empty');
  else if (!isShaLike(candidateSha)) add('MISSING_CANDIDATE_SHA', 'candidateSha is not a commit SHA');

  if (!currentDefaultSha) add('MISSING_CURRENT_DEFAULT_SHA', 'currentDefaultSha is empty');

  if (!previousLkg || !rollbackTarget) {
    add('MISSING_ROLLBACK_LKG', `previousLkg=${previousLkg || 'empty'} rollbackTarget=${rollbackTarget || 'empty'}`);
  }
  if (candidateSha && rollbackTarget && candidateSha === rollbackTarget) {
    add('ROLLBACK_EQUALS_CANDIDATE', `both ${candidateSha}`);
  }

  if (!evaluateMergeConflict(input.mergeConflictStatus)) {
    add('UNRESOLVED_MERGE_CONFLICT', `mergeConflictStatus=${JSON.stringify(input.mergeConflictStatus ?? null)}`);
  }

  const cert = isPlainObject(input.certificate) ? input.certificate : null;
  if (!cert) {
    add('MISSING_FLEET_PRE_CERTIFICATE', 'no independent Fleet PRE certificate supplied');
  } else {
    if (String(cert.kind || '').trim().toUpperCase() !== policy.certificate.kind) {
      add('CERTIFICATE_KIND_MISMATCH', `kind=${JSON.stringify(cert.kind ?? null)}`);
    }
    if (String(cert.verdict || '').trim().toUpperCase() !== policy.certificate.verdict) {
      add('CERTIFICATE_VERDICT_NOT_PASS', `verdict=${JSON.stringify(cert.verdict ?? null)}`);
    }
    const runId = String(cert.runId == null ? '' : cert.runId).trim();
    const status = String(cert.status == null ? '' : cert.status).trim().toLowerCase();
    if (!runId || (status && status !== 'completed')) {
      add('CERTIFICATE_NOT_COMPLETED', `runId=${JSON.stringify(cert.runId ?? null)} status=${JSON.stringify(cert.status ?? null)}`);
    }
    const certSha = normalizeSha(cert.sha);
    if (candidateSha && certSha !== candidateSha) {
      add('STALE_CERTIFICATE', `certificate=${certSha || 'empty'} candidate=${candidateSha}`);
    }
  }

  for (const duplicate of findDuplicateSystems(input.systems)) {
    add(duplicate.code, `declared=${duplicate.declaredId || 'empty'} shares ${duplicate.sharedPaths.join(', ')}`);
  }

  const observedHead = normalizeSha(ctx.currentHeadSha);
  if (observedHead && candidateSha && observedHead !== candidateSha) {
    add('CANDIDATE_NOT_CURRENT_HEAD', `observedHead=${observedHead} candidate=${candidateSha}`);
  }

  const rejections = REJECTION_CODES
    .filter((code) => found.has(code))
    .map((code) => found.get(code));

  const readyForOcean = rejections.length === 0;
  return {
    readyForOcean,
    verdict: readyForOcean ? policy.readyForOceanOutputKey : 'REJECTED',
    candidateSha,
    currentDefaultSha,
    previousLkg,
    rollbackTarget,
    rejections,
  };
}

function oceanReadyLine(result) {
  if (!isPlainObject(result)) return `${policy.readyForOceanOutputKey}=NO rejections=INVALID_RESULT`;
  if (!result.readyForOcean) {
    const codes = (result.rejections || []).map((r) => r.code).join(',') || 'UNKNOWN';
    return `${policy.readyForOceanOutputKey}=NO rejections=${codes}`;
  }
  return `${policy.readyForOceanOutputKey}=YES SHA=${result.candidateSha}`;
}

/**
 * Build the exact payload Ocean hands back to Fleet POST after a safe integration.
 * Ocean never self-certifies live, so deploymentUrl/postScenarios are supplied by the
 * integrating actor and validated here rather than invented.
 */
function buildOceanHandoff({ candidate = {}, integratedSha, deploymentUrl, postScenarios } = {}) {
  const input = isPlainObject(candidate) ? candidate : {};
  return {
    contractVersion: policy.schemaVersion,
    role: policy.role,
    candidateSha: normalizeSha(input.candidateSha),
    integratedSha: normalizeSha(integratedSha),
    defaultSha: normalizeSha(input.integratedDefaultSha || integratedSha),
    previousLkg: normalizeSha(input.previousLkg),
    rollback: normalizeSha(input.rollbackTarget),
    deploymentIdentity: {
      provider: deploymentIdentity.provider,
      service: deploymentIdentity.service,
      configuration: deploymentIdentity.configuration,
      proofEndpoint: deploymentIdentity.proofEndpoint,
      revisionHeader: deploymentIdentity.revisionHeader.name,
      originSource: deploymentIdentity.canonicalOriginEnvironmentVariable,
    },
    deploymentUrl: String(deploymentUrl == null ? '' : deploymentUrl).trim(),
    postScenarios: Array.isArray(postScenarios) ? postScenarios.slice() : [],
    selfCertified: false,
    consumer: policy.handoff.consumer,
  };
}

function validateOceanHandoff(handoff = {}) {
  const input = isPlainObject(handoff) ? handoff : {};
  const missing = [];
  for (const field of policy.handoff.requiredFields) {
    const value = input[field];
    const empty = value == null
      || (typeof value === 'string' && !value.trim())
      || (Array.isArray(value) && value.length === 0);
    if (empty && !missing.includes(field)) missing.push(field);
  }

  const invalid = [];
  for (const [index, scenario] of (Array.isArray(input.postScenarios) ? input.postScenarios : []).entries()) {
    if (!isPlainObject(scenario)) {
      invalid.push(`postScenarios[${index}] is not an object`);
      continue;
    }
    for (const field of policy.handoff.requiredScenarioFields) {
      if (!String(scenario[field] == null ? '' : scenario[field]).trim()) {
        invalid.push(`postScenarios[${index}].${field} is empty`);
      }
    }
  }

  if (input.selfCertified === true) invalid.push('selfCertified must be false: Ocean never self-certifies live');

  return { ok: missing.length === 0 && invalid.length === 0, missing, invalid };
}

/**
 * Static invariants of the policy itself. The CLI additionally verifies that every
 * canonical path still exists, so the Ocean gate cannot be silently orphaned.
 */
function policySelfCheck() {
  const problems = [];
  if (policy.failClosed !== true) problems.push('policy.failClosed must stay true');
  if (policy.authority.selfCertificationForbidden !== true) problems.push('policy.authority.selfCertificationForbidden must stay true');
  if (policy.authority.productionDeploymentForbidden !== true) problems.push('policy.authority.productionDeploymentForbidden must stay true');
  if (policy.certificate.kind !== 'FLEET_PRE') problems.push('policy.certificate.kind must stay FLEET_PRE');
  if (policy.certificate.verdict !== 'PASS') problems.push('policy.certificate.verdict must stay PASS');

  for (const code of [
    'MISSING_CANDIDATE_SHA',
    'MISSING_CURRENT_DEFAULT_SHA',
    'CANDIDATE_NOT_CURRENT_HEAD',
    'MISSING_FLEET_PRE_CERTIFICATE',
    'STALE_CERTIFICATE',
    'CERTIFICATE_KIND_MISMATCH',
    'CERTIFICATE_VERDICT_NOT_PASS',
    'CERTIFICATE_NOT_COMPLETED',
    'UNRESOLVED_MERGE_CONFLICT',
    'MISSING_ROLLBACK_LKG',
    'ROLLBACK_EQUALS_CANDIDATE',
    'DUPLICATE_PARALLEL_SYSTEM',
  ]) {
    if (!REJECTION_ORDER[code]) problems.push(`missing required rejection code ${code}`);
  }

  if (!policy.readyForOceanOutputKey) problems.push('policy.readyForOceanOutputKey must stay set');
  if (!Array.isArray(policy.invariantSystems) || policy.invariantSystems.length === 0) {
    problems.push('policy.invariantSystems must declare the canonical Ocean system');
  }

  return { ok: problems.length === 0, problems };
}

module.exports = {
  policy,
  deploymentIdentity,
  REJECTION_CODES,
  normalizeSha,
  isShaLike,
  matchesCanonicalPath,
  findDuplicateSystems,
  evaluateOceanEligibility,
  oceanReadyLine,
  buildOceanHandoff,
  validateOceanHandoff,
  policySelfCheck,
};