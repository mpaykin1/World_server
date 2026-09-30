'use strict';

const fs = require('fs');
const path = require('path');

const POLICY_PATH = path.join(__dirname, '..', 'data', 'reference-fidelity-policy.json');

function loadReferenceFidelityPolicy() {
  return JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
}

function assessReferenceFidelity(input = {}) {
  const policy = loadReferenceFidelityPolicy();
  const candidate = input.candidate || {};
  const referenceClass = input.referenceClass || 'volumetric-fps';
  const reasons = [];

  if (referenceClass === 'volumetric-fps') {
    if (candidate.renderer === 'raycaster-2.5d') reasons.push('raycaster-2.5d cannot satisfy volumetric-fps');
    if (candidate.environment !== 'true-3d-depth-tested') reasons.push('environment must be true 3D and depth-tested');
    if (candidate.weapon !== 'true-3d-depth-tested') reasons.push('weapon must be a true 3D depth-tested mesh');
    if (candidate.enemies !== 'true-3d-volumetric') reasons.push('enemies must be volumetric 3D, not billboards');
    if (candidate.lighting !== 'scene-reactive') reasons.push('lighting must affect scene geometry/materials');
    if (candidate.camera !== 'perspective-3d') reasons.push('camera must be a perspective 3D camera');
  }

  if (candidate.renderScale != null && Number(candidate.renderScale) < 0.75) {
    reasons.push('renderScale below 0.75 is a quality downgrade unless explicitly approved');
  }

  if (input.requireAutonomousSingleFile && candidate.autonomousSingleFile !== true) {
    reasons.push('autonomous single-file delivery required');
  }

  if (input.finalClaim === true) {
    if (Number(candidate.visualSimilarityPercent) < policy.minimumFinalSimilarityPercent) {
      reasons.push(`visual similarity must be >= ${policy.minimumFinalSimilarityPercent}%`);
    }
    if (candidate.freshSideBySideEvidence !== true) reasons.push('fresh side-by-side evidence required');
    if (candidate.behavioralSmokePassed !== true) reasons.push('fresh behavioral browser smoke required');
  }

  return {
    pass: reasons.length === 0,
    minimumFinalSimilarityPercent: policy.minimumFinalSimilarityPercent,
    reasons
  };
}

module.exports = { loadReferenceFidelityPolicy, assessReferenceFidelity };
