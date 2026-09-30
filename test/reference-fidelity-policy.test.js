'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { assessReferenceFidelity } = require('../lib/reference-fidelity-policy');

test('rejects the exact raycaster/billboard/HUD weapon failure mode', () => {
  const result = assessReferenceFidelity({
    referenceClass: 'volumetric-fps',
    finalClaim: true,
    requireAutonomousSingleFile: true,
    candidate: {
      renderer: 'raycaster-2.5d',
      environment: 'true-3d-depth-tested',
      weapon: 'hud-canvas-weapon',
      enemies: 'billboard-enemy',
      lighting: 'screen-space-only',
      camera: 'perspective-3d',
      renderScale: 0.5,
      autonomousSingleFile: true,
      visualSimilarityPercent: 99,
      freshSideBySideEvidence: true,
      behavioralSmokePassed: true
    }
  });
  assert.equal(result.pass, false);
  assert.match(result.reasons.join('\n'), /raycaster/);
  assert.match(result.reasons.join('\n'), /weapon/);
  assert.match(result.reasons.join('\n'), /enemies/);
  assert.match(result.reasons.join('\n'), /lighting/);
});

test('does not allow a final claim below 85 even when dimensionality is correct', () => {
  const result = assessReferenceFidelity({
    referenceClass: 'volumetric-fps',
    finalClaim: true,
    candidate: {
      renderer: 'webgl2',
      environment: 'true-3d-depth-tested',
      weapon: 'true-3d-depth-tested',
      enemies: 'true-3d-volumetric',
      lighting: 'scene-reactive',
      camera: 'perspective-3d',
      renderScale: 1,
      visualSimilarityPercent: 84.99,
      freshSideBySideEvidence: true,
      behavioralSmokePassed: true
    }
  });
  assert.equal(result.pass, false);
  assert.match(result.reasons.join('\n'), />= 85%/);
});

test('requires fresh visual and browser evidence for final claims', () => {
  const result = assessReferenceFidelity({
    referenceClass: 'volumetric-fps',
    finalClaim: true,
    candidate: {
      renderer: 'webgl2',
      environment: 'true-3d-depth-tested',
      weapon: 'true-3d-depth-tested',
      enemies: 'true-3d-volumetric',
      lighting: 'scene-reactive',
      camera: 'perspective-3d',
      renderScale: 1,
      visualSimilarityPercent: 90
    }
  });
  assert.equal(result.pass, false);
  assert.match(result.reasons.join('\n'), /side-by-side/);
  assert.match(result.reasons.join('\n'), /browser smoke/);
});

test('accepts a fully volumetric evidenced candidate', () => {
  const result = assessReferenceFidelity({
    referenceClass: 'volumetric-fps',
    finalClaim: true,
    requireAutonomousSingleFile: true,
    candidate: {
      renderer: 'webgl2',
      environment: 'true-3d-depth-tested',
      weapon: 'true-3d-depth-tested',
      enemies: 'true-3d-volumetric',
      lighting: 'scene-reactive',
      camera: 'perspective-3d',
      renderScale: 1,
      autonomousSingleFile: true,
      visualSimilarityPercent: 90,
      freshSideBySideEvidence: true,
      behavioralSmokePassed: true
    }
  });
  assert.equal(result.pass, true);
  assert.deepEqual(result.reasons, []);
});
