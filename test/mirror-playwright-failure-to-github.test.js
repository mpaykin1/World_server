'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBoundedMirror } = require('../scripts/mirror-playwright-failure-to-github.js');

function evidence(project) {
  const state = {
    defaultCityLoaded: true, voxels: 37678, chunks: 101, objects: 12, renderedTriangles: 2400, drawCalls: 36,
    webglReady: true, viewport: { width: 412, height: 915, orientation: 'portrait' },
    primaryRendererBounds: { x: 0, y: 0, width: 412, height: 915 }, rendererWidthRatio: 1, rendererHeightRatio: 1,
    gameplayScrollRatio: { width: 1, height: 1 }, closedAuxiliaryOcclusionRatio: 0,
    camera: { x: 63.5, y: 1.7, z: 20.5, yaw: -1.57, pitch: 0, playable: true },
    selectedFacing: { label: 'scan-6', yaw: -1.57, score: 9000, richestScore: 9500, nearSurfaceCoverage: 48,
      centerNearSurfaceCoverage: 18, centerMidFar: 5800, centerDepthBands: 4, centerNearestDistance: 6.5,
      readableFloor: 5700, centerContentFloor: 2100, candidateCount: 24, yawSpaceExhausted: true,
      spawnFallbackUsed: true, spawnOffset: { x: 2, z: -2 }, spawnCandidateCount: 16, finalViewEligible: true },
    framing: { nearSurfaceCoverageRatio: 0.5, centerNearSurfaceCoverageRatio: 0.5, visibleFrameClassification: 'VISIBLE_BUT_BAD_FRAMING' },
    controls: { move: true, look: true, toolbarUsable: true, essentialActions: { visibleActionCount: 24,
      visibleActionLabels: Array.from({ length: 24 }, (_, i) => `${project}-action-${i}-` + 'x'.repeat(1500)), jumpVisible: true, menuVisible: true } },
    pageErrors: Array.from({ length: 20 }, () => 'page-' + 'p'.repeat(1500)),
    consoleErrors: Array.from({ length: 20 }, () => 'console-' + 'c'.repeat(1500)), screenshotIdentity: `loaded-${project}.png`,
  };
  return { ...state, pageUrl: 'http://localhost:3000/apps/ai3d-voxel-city/', postResizeOrientation: {
    supported: true, original: { width: 412, height: 915 }, probe: { width: 915, height: 412 },
    afterOrientationChange: state, afterRestore: state } };
}

test('bounded mirror preserves every required profile identity under maximum rich evidence', () => {
  const projects = ['desktop-chromium','mobile-chromium','mobile-webkit','tablet-chromium','desktop-chromium-r1','mobile-chromium-r1','mobile-webkit-r1','tablet-chromium-r1'];
  const summary = { schemaVersion: 3, classification: 'HARD_BROWSER_FAILURE', canonicalPrHeadSha: 'a'.repeat(40), githubMergeRefSha: 'b'.repeat(40),
    exactCurrentMaster: { sha: 'c'.repeat(40), sameFixtureResult: 'PASS' }, workflow: { runId: '123', runAttempt: '1', job: 'check' },
    artifactName: `playwright-failure-${'a'.repeat(40)}-1`, diagnosticCompleteness: { machineReadableFailureIdentity: true, loadedStateEvidence: true },
    failures: projects.map(project => ({ project, browser: project.includes('webkit') ? 'webkit' : 'chromium', specFile: 'e2e/ai3d-voxel-city-autoplay.spec.js',
      specTestTitle: `${project} full title`, status: 'failed', retry: 0, firstFailingAssertion: 'nearSurfaceCoverage <= 38', sourceLocation: 'e2e/ai3d-voxel-city-autoplay.spec.js:100:5',
      pageUrl: 'http://localhost:3000/apps/ai3d-voxel-city/', pageErrors: evidence(project).pageErrors, consoleErrors: evidence(project).consoleErrors,
      webglRendererReadiness: true, viewport: { width: 412, height: 915 }, primaryRendererBounds: { x: 0, y: 0, width: 412, height: 915 },
      screenshotFiles: [`/tmp/${project}/loaded.png`], traceFiles: [`/tmp/${project}/trace.zip`], loadedStateEvidence: evidence(project) })) };
  const bounded = buildBoundedMirror(summary);
  assert.equal(bounded.mode, 'BOUNDED_FALLBACK');
  assert.ok(bounded.bytes <= 60000, `mirror is ${bounded.bytes} bytes`);
  const payload = JSON.parse(bounded.body.split('```json\n')[1].split('\n```')[0]);
  assert.equal(payload.failures.length, projects.length);
  for (const failure of payload.failures) {
    assert.equal(failure.loadedState.defaultCityLoaded, true);
    assert.equal(failure.loadedState.webglReady, true);
    assert.equal(failure.loadedState.selectedFacing.centerNearestDistance, 6.5);
    assert.equal(failure.loadedState.postResizeOrientation.supported, true);
    assert.notEqual(failure.loadedState.screenshotIdentity, 'UNKNOWN');
  }
});
