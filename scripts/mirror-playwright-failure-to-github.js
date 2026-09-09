'use strict';

const fs = require('fs');

const summaryPath = process.env.PLAYWRIGHT_FAILURE_SUMMARY || 'test-results/playwright-failure-summary.json';
const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const prNumber = Number(process.env.PR_NUMBER || 0);
const ledgerIssue = Number(process.env.CANONICAL_LEDGER_ISSUE || 80);
const serverUrl = process.env.GITHUB_API_URL || 'https://api.github.com';

function known(value) {
  return value === null || value === undefined || value === '' ? 'UNKNOWN' : value;
}

function compactSelectedFacing(facing) {
  if (!facing || typeof facing !== 'object') return known(facing);
  return {
    yaw: facing.yaw ?? 'UNKNOWN',
    label: known(facing.label),
    score: facing.score ?? 'UNKNOWN',
    nearSurfaceCoverage: facing.nearSurfaceCoverage ?? 'UNKNOWN',
    centerNearSurfaceCoverage: facing.centerNearSurfaceCoverage ?? 'UNKNOWN',
    centerMidFar: facing.centerMidFar ?? 'UNKNOWN',
    centerDepthBands: facing.centerDepthBands ?? 'UNKNOWN',
    centerNearestDistance: facing.centerNearestDistance ?? 'UNKNOWN',
    screenCoverage: facing.screenCoverage ?? 'UNKNOWN',
    readableFloor: facing.readableFloor ?? 'UNKNOWN',
    centerContentFloor: facing.centerContentFloor ?? 'UNKNOWN',
    candidateCount: facing.candidateCount ?? 'UNKNOWN',
    yawSpaceExhausted: facing.yawSpaceExhausted ?? 'UNKNOWN',
    nearSurfaceCoverageRange: facing.nearSurfaceCoverageRange || 'UNKNOWN',
    centerNearSurfaceCoverageRange: facing.centerNearSurfaceCoverageRange || 'UNKNOWN',
    spawnFallbackUsed: facing.spawnFallbackUsed ?? 'UNKNOWN',
    spawnOffset: facing.spawnOffset || 'UNKNOWN',
    spawnCandidateCount: facing.spawnCandidateCount ?? 'UNKNOWN',
    spawnEligibleCandidateCount: facing.spawnEligibleCandidateCount ?? 'UNKNOWN',
    spawnRejectedCandidateCount: facing.spawnRejectedCandidateCount ?? 'UNKNOWN',
    finalViewEligible: facing.finalViewEligible ?? 'UNKNOWN',
    baseYawSpaceExhausted: facing.baseYawSpaceExhausted ?? 'UNKNOWN',
  };
}

function compactEssentialActions(actions, includeLabels = true) {
  if (!actions || typeof actions !== 'object') return known(actions);
  return {
    visibleActionCount: actions.visibleActionCount ?? 'UNKNOWN',
    ...(includeLabels ? { visibleActionLabels: Array.isArray(actions.visibleActionLabels) ? actions.visibleActionLabels : [] } : {}),
    jumpVisible: actions.jumpVisible ?? 'UNKNOWN',
    menuVisible: actions.menuVisible ?? 'UNKNOWN',
  };
}

function compactPostResizeState(evidence = {}, failure = {}) {
  const controls = evidence.controls || {};
  return {
    defaultCityLoaded: evidence.defaultCityLoaded ?? 'UNKNOWN',
    voxels: evidence.voxels ?? 'UNKNOWN',
    chunks: evidence.chunks ?? 'UNKNOWN',
    renderedTriangles: evidence.renderedTriangles ?? evidence.triangles ?? 'UNKNOWN',
    drawCalls: evidence.drawCalls ?? 'UNKNOWN',
    webglReady: evidence.webglReady ?? failure.webglRendererReadiness ?? 'UNKNOWN',
    viewport: evidence.viewport || failure.viewport || 'UNKNOWN',
    primaryRendererBounds: evidence.primaryRendererBounds || failure.primaryRendererBounds || 'UNKNOWN',
    rendererWidthRatio: evidence.rendererWidthRatio ?? evidence.primaryRendererWidthRatio ?? 'UNKNOWN',
    rendererHeightRatio: evidence.rendererHeightRatio ?? evidence.primaryRendererHeightRatio ?? 'UNKNOWN',
    gameplayScrollRatio: evidence.gameplayScrollRatio ?? 'UNKNOWN',
    closedAuxiliaryOcclusionRatio: evidence.closedAuxiliaryOcclusionRatio ?? 'UNKNOWN',
    camera: evidence.camera || 'UNKNOWN',
    selectedFacing: compactSelectedFacing(evidence.selectedFacing || evidence.facing),
    framing: evidence.framing || 'UNKNOWN',
    controls: {
      move: controls.move ?? evidence.moveAvailable ?? 'UNKNOWN',
      look: controls.look ?? evidence.lookAvailable ?? 'UNKNOWN',
      toolbarUsable: controls.toolbarUsable ?? evidence.toolbarUsable ?? 'UNKNOWN',
      essentialActions: compactEssentialActions(controls.essentialActions, false),
    },
    pageErrors: evidence.pageErrors || failure.pageErrors || [],
    consoleErrors: evidence.consoleErrors || failure.consoleErrors || [],
  };
}

function compactPostResizeOrientation(postResize, failure = {}) {
  if (!postResize || typeof postResize !== 'object') return known(postResize);
  return {
    supported: postResize.supported ?? 'UNKNOWN',
    original: postResize.original || 'UNKNOWN',
    probe: postResize.probe || 'UNKNOWN',
    afterOrientationChange: postResize.afterOrientationChange
      ? compactPostResizeState(postResize.afterOrientationChange, failure)
      : 'UNKNOWN',
    afterRestore: postResize.afterRestore
      ? compactPostResizeState(postResize.afterRestore, failure)
      : 'UNKNOWN',
  };
}

function compactLoadedState(evidence = {}, failure = {}) {
  const controls = evidence.controls || {};
  return {
    defaultCityLoaded: evidence.defaultCityLoaded ?? 'UNKNOWN',
    voxels: evidence.voxels ?? 'UNKNOWN',
    chunks: evidence.chunks ?? 'UNKNOWN',
    objects: evidence.objects ?? evidence.objectCount ?? 'UNKNOWN',
    renderedTriangles: evidence.renderedTriangles ?? evidence.triangles ?? 'UNKNOWN',
    drawCalls: evidence.drawCalls ?? 'UNKNOWN',
    webglReady: evidence.webglReady ?? failure.webglRendererReadiness ?? 'UNKNOWN',
    viewport: evidence.viewport || failure.viewport || 'UNKNOWN',
    primaryRendererBounds: evidence.primaryRendererBounds || failure.primaryRendererBounds || 'UNKNOWN',
    rendererWidthRatio: evidence.rendererWidthRatio ?? evidence.primaryRendererWidthRatio ?? 'UNKNOWN',
    rendererHeightRatio: evidence.rendererHeightRatio ?? evidence.primaryRendererHeightRatio ?? 'UNKNOWN',
    gameplayScrollRatio: evidence.gameplayScrollRatio ?? 'UNKNOWN',
    closedAuxiliaryOcclusionRatio: evidence.closedAuxiliaryOcclusionRatio ?? 'UNKNOWN',
    camera: evidence.camera || {
      position: evidence.cameraPosition ?? 'UNKNOWN',
      yaw: evidence.cameraYaw ?? 'UNKNOWN',
      pitch: evidence.cameraPitch ?? 'UNKNOWN',
    },
    selectedFacing: compactSelectedFacing(evidence.selectedFacing || evidence.facing),
    framing: evidence.framing || 'UNKNOWN',
    moveAvailable: evidence.moveAvailable ?? controls.move ?? 'UNKNOWN',
    lookAvailable: evidence.lookAvailable ?? controls.look ?? 'UNKNOWN',
    toolbarUsable: evidence.toolbarUsable ?? controls.toolbarUsable ?? 'UNKNOWN',
    essentialActionsAvailable: evidence.essentialActionsAvailable ?? compactEssentialActions(controls.essentialActions),
    pageErrors: evidence.pageErrors || failure.pageErrors || [],
    consoleErrors: evidence.consoleErrors || failure.consoleErrors || [],
    screenshotIdentity: evidence.screenshotIdentity || 'UNKNOWN',
    postResizeOrientation: compactPostResizeOrientation(evidence.postResizeOrientation || evidence.postResize, failure),
  };
}

function compactFailure(failure) {
  const evidence = failure.loadedStateEvidence || {};
  return {
    project: known(failure.project),
    browser: known(failure.browser),
    specFile: known(failure.specFile),
    fullTitle: known(failure.specTestTitle),
    status: known(failure.status),
    retry: failure.retry ?? 'UNKNOWN',
    durationMs: failure.durationMs ?? 'UNKNOWN',
    firstAssertion: known(failure.firstFailingAssertion),
    sourceLocation: known(failure.sourceLocation),
    pageUrl: known(failure.pageUrl || evidence.pageUrl),
    pageErrors: failure.pageErrors || evidence.pageErrors || [],
    consoleErrors: failure.consoleErrors || evidence.consoleErrors || [],
    webglReady: failure.webglRendererReadiness ?? evidence.webglReady ?? 'UNKNOWN',
    viewport: failure.viewport || evidence.viewport || 'UNKNOWN',
    primaryRendererBounds: failure.primaryRendererBounds || evidence.primaryRendererBounds || 'UNKNOWN',
    screenshotFiles: failure.screenshotFiles || [],
    traceFiles: failure.traceFiles || [],
    loadedState: compactLoadedState(evidence, failure),
  };
}

function buildMirror(summary) {
  const compact = {
    schemaVersion: summary.schemaVersion,
    classification: summary.classification,
    EXACT_HEAD: known(summary.canonicalPrHeadSha),
    GITHUB_MERGE_REF_SHA: known(summary.githubMergeRefSha),
    CURRENT_DEFAULT_SHA: known(summary.exactCurrentMaster?.sha),
    MASTER_A_B: known(summary.exactCurrentMaster?.sameFixtureResult),
    runId: known(summary.workflow?.runId),
    runAttempt: known(summary.workflow?.runAttempt),
    job: known(summary.workflow?.job),
    artifactName: known(summary.artifactName),
    machineReadableFailureIdentity: Boolean(summary.diagnosticCompleteness?.machineReadableFailureIdentity),
    loadedStateEvidencePresent: Boolean(summary.diagnosticCompleteness?.loadedStateEvidence),
    failures: (summary.failures || []).map(compactFailure),
  };
  return [
    '[BUILDER][MANUAL_FAST_LANE][REQUIRED_BROWSER_FAILURE_MIRROR]',
    '',
    '```json',
    JSON.stringify(compact, null, 2),
    '```',
    '',
    `HANDOFF_READABLE=PENDING_CONNECTOR_REREAD; OBSERVABILITY_INCOMPLETE=${compact.machineReadableFailureIdentity ? 'NO' : 'YES'}.`,
    'Binary screenshot/trace/video evidence remains canonical deep evidence; this UTF-8 mirror is the connector-readable handoff.',
  ].join('\n');
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${options.method || 'GET'} ${url} -> ${response.status}: ${text.slice(0, 1200)}`);
  }
  return response.json();
}

async function postAndVerify(issueNumber, body) {
  const endpoint = `${serverUrl}/repos/${repository}/issues/${issueNumber}/comments`;
  const created = await request(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  const reread = await request(`${serverUrl}/repos/${repository}/issues/comments/${created.id}`);
  const expectedHead = JSON.parse(fs.readFileSync(summaryPath, 'utf8')).canonicalPrHeadSha;
  if (!reread.body || !reread.body.includes(expectedHead) || !reread.body.includes('machineReadableFailureIdentity')) {
    throw new Error(`HANDOFF_READABLE=NO for comment ${created.id}: connector-facing text did not retain exact-head identity`);
  }
  return created.id;
}

async function main() {
  if (!fs.existsSync(summaryPath)) throw new Error(`OBSERVABILITY_INCOMPLETE: missing ${summaryPath}`);
  if (!token || !repository || !prNumber) throw new Error('OBSERVABILITY_INCOMPLETE: GITHUB_TOKEN, GITHUB_REPOSITORY and PR_NUMBER are required');
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  if (!summary.diagnosticCompleteness?.machineReadableFailureIdentity) {
    throw new Error('OBSERVABILITY_INCOMPLETE: machineReadableFailureIdentity must be true before handoff');
  }
  const body = buildMirror(summary);
  if (Buffer.byteLength(body, 'utf8') > 60000) throw new Error('OBSERVABILITY_INCOMPLETE: connector-readable mirror exceeds safe GitHub comment size');
  const prCommentId = await postAndVerify(prNumber, body);
  const ledgerCommentId = await postAndVerify(ledgerIssue, body);
  console.log(`HANDOFF_READABLE=YES PR_COMMENT=${prCommentId} LEDGER_COMMENT=${ledgerCommentId} EXACT_HEAD=${summary.canonicalPrHeadSha}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 2;
  });
}

module.exports = { buildMirror, compactFailure, compactLoadedState, compactPostResizeOrientation, compactPostResizeState, compactSelectedFacing };
