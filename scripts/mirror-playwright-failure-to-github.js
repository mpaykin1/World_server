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

function json(value) {
  return JSON.stringify(value ?? null);
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
    pageUrl: known(failure.pageUrl),
    pageErrors: failure.pageErrors || [],
    consoleErrors: failure.consoleErrors || [],
    webglReady: failure.webglRendererReadiness ?? 'UNKNOWN',
    viewport: failure.viewport || 'UNKNOWN',
    primaryRendererBounds: failure.primaryRendererBounds || 'UNKNOWN',
    screenshotFiles: failure.screenshotFiles || [],
    traceFiles: failure.traceFiles || [],
    loadedState: {
      defaultCityLoaded: evidence.defaultCityLoaded ?? 'UNKNOWN',
      voxels: evidence.voxels ?? 'UNKNOWN',
      chunks: evidence.chunks ?? 'UNKNOWN',
      objects: evidence.objects ?? evidence.objectCount ?? 'UNKNOWN',
      renderedTriangles: evidence.renderedTriangles ?? evidence.triangles ?? 'UNKNOWN',
      drawCalls: evidence.drawCalls ?? 'UNKNOWN',
      webglReady: evidence.webglReady ?? failure.webglRendererReadiness ?? 'UNKNOWN',
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
      selectedFacing: evidence.selectedFacing || evidence.facing || 'UNKNOWN',
      moveAvailable: evidence.moveAvailable ?? evidence.controls?.move ?? 'UNKNOWN',
      lookAvailable: evidence.lookAvailable ?? evidence.controls?.look ?? 'UNKNOWN',
      essentialActionsAvailable: evidence.essentialActionsAvailable ?? evidence.controls?.essentialActions ?? 'UNKNOWN',
      postResizeOrientation: evidence.postResizeOrientation || evidence.postResize || 'UNKNOWN',
    },
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

module.exports = { buildMirror, compactFailure };
