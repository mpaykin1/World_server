'use strict';

const policy = require('../data/manual-task-completion-contract.json');

const DELIVERY_KEYS = policy.linkRequiredEvidence;
const ALLOWED_FINISH_WORK = new Set(policy.finishModeAllowedWork);

function isFinishMode(progress = 0) {
  return Number(progress) >= policy.finishModeThreshold;
}

function scopeChangeAllowed({ progress = 0, kind = 'implementation' } = {}) {
  if (!isFinishMode(progress)) return true;
  return ALLOWED_FINISH_WORK.has(kind);
}

function validateDelivery(evidence = {}, { requireLink = true } = {}) {
  const required = requireLink ? DELIVERY_KEYS : ['commit', 'pushed'];
  const missing = required.filter((key) => !evidence[key]);
  const blocker = (evidence.defects || []).some((d) => String(d.severity).toUpperCase() === 'BLOCKER');
  if (blocker && !missing.includes('blockerResolved')) missing.push('blockerResolved');
  return { ok: missing.length === 0, missing, status: missing.length ? 'PENDING' : 'PREVIEW_VERIFIED' };
}

function gateOverallStatus(baseStatus, evidence = {}, opts = {}) {
  if (!opts.manualTask) return { overallStatus: baseStatus, deliveryGate: null };
  const deliveryGate = validateDelivery(evidence, { requireLink: opts.requireLink !== false });
  if (baseStatus === 'FAIL') return { overallStatus: 'FAIL', deliveryGate };
  return { overallStatus: deliveryGate.ok && baseStatus === 'PASS' ? 'PASS' : 'PENDING', deliveryGate };
}

function checkpointFrom(evidence = {}, extra = {}) {
  const delivery = validateDelivery(evidence, { requireLink: extra.requireLink !== false });
  return {
    contractVersion: policy.version,
    finishMode: isFinishMode(extra.progress || 0),
    progress: Number(extra.progress || 0),
    delivery,
    evidence,
    nextAction: delivery.ok ? 'HANDOFF_VERIFIED_LINK' : `COMPLETE_${delivery.missing[0] || 'DELIVERY'}`,
    updatedAt: new Date().toISOString(),
  };
}

module.exports = { policy, isFinishMode, scopeChangeAllowed, validateDelivery, gateOverallStatus, checkpointFrom };
