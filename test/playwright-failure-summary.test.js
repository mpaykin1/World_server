'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSummary } = require('../scripts/summarize-playwright-failure');

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-summary-'));
  try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function writeReport(dir, value) {
  const file = path.join(dir, 'playwright-results.json');
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  return file;
}

test('structured Playwright JSON is primary and yields complete failure identity', () => withTempDir((dir) => {
  const reportFile = writeReport(dir, {
    suites: [{
      title: 'hud-visual-audit.spec.js',
      file: 'e2e/hud-visual-audit.spec.js',
      specs: [{
        title: 'hud-audit ai3d-voxel-city',
        file: 'e2e/hud-visual-audit.spec.js',
        line: 42,
        column: 3,
        tests: [{
          projectName: 'mobile-webkit',
          status: 'unexpected',
          results: [{
            status: 'failed', retry: 0, duration: 321,
            errors: [{ message: 'Error: expected overlay count to be 0', stack: 'Error: expected overlay count to be 0\n at e2e/hud-visual-audit.spec.js:42:3', location: { file: 'e2e/hud-visual-audit.spec.js', line: 42, column: 3 } }],
            attachments: [{ name: 'trace', contentType: 'application/zip', path: 'test-results/x/trace.zip' }],
          }],
        }],
      }],
    }],
  });
  const summary = buildSummary({ root: dir, reportFile });
  assert.equal(summary.classification, 'HARD_BROWSER_FAILURE');
  assert.equal(summary.structuredReporter.state, 'ok');
  assert.equal(summary.diagnosticCompleteness.machineReadableFailureIdentity, true);
  assert.equal(summary.failures[0].project, 'mobile-webkit');
  assert.equal(summary.failures[0].specFile, 'e2e/hud-visual-audit.spec.js');
  assert.match(summary.failures[0].specTestTitle, /hud-audit ai3d-voxel-city/);
  assert.equal(summary.failures[0].firstFailingAssertion, 'Error: expected overlay count to be 0');
  assert.equal(summary.failures[0].sourceLocation, 'e2e/hud-visual-audit.spec.js:42:3');
}));

test('inline loaded-state evidence is decoded and promoted into connector-readable failure fields', () => withTempDir((dir) => {
  const loadedState = {
    pageUrl: 'http://localhost:3000/apps/ai3d-voxel-city/',
    defaultCityLoaded: true,
    voxels: 37678,
    chunks: 101,
    renderedTriangles: 2390,
    drawCalls: 36,
    webglReady: true,
    viewport: { width: 390, height: 664, orientation: 'portrait' },
    primaryRendererBounds: { x: 0, y: 0, width: 390, height: 664 },
    rendererWidthRatio: 1,
    rendererHeightRatio: 1,
    gameplayScrollRatio: { width: 1, height: 1 },
    closedAuxiliaryOcclusionRatio: 0,
    selectedFacing: { centerNearestDistance: 6.5, centerDepthBands: 4 },
    controls: { move: true, look: true, toolbarUsable: true },
    pageErrors: [],
    consoleErrors: ['HTTP 503 resource'],
  };
  const reportFile = writeReport(dir, {
    suites: [{
      title: 'perceptual-visual.spec.js', file: 'e2e/perceptual-visual.spec.js',
      specs: [{
        title: 'perceptual-baseline ai3d-voxel-city:desktop-1280x720',
        file: 'e2e/perceptual-visual.spec.js', line: 91, column: 24,
        tests: [{
          projectName: 'mobile-webkit', status: 'unexpected',
          results: [{
            status: 'failed', retry: 0, duration: 2534,
            errors: [{ message: 'Error: expect(page).toHaveScreenshot(expected) failed', location: { file: 'e2e/perceptual-visual.spec.js', line: 91, column: 24 } }],
            attachments: [
              { name: 'loaded-state-graphics-evidence.json', contentType: 'application/json', body: Buffer.from(JSON.stringify(loadedState)).toString('base64') },
              { name: 'trace', contentType: 'application/zip', path: 'test-results/x/trace.zip' },
            ],
          }],
        }],
      }],
    }],
  });
  const summary = buildSummary({ root: dir, reportFile });
  const failure = summary.failures[0];
  assert.equal(summary.schemaVersion, 3);
  assert.equal(summary.classification, 'HARD_BROWSER_FAILURE');
  assert.equal(summary.diagnosticCompleteness.loadedStateEvidence, true);
  assert.equal(summary.diagnosticCompleteness.pageUrl, true);
  assert.equal(summary.diagnosticCompleteness.webglRendererReadiness, true);
  assert.equal(summary.diagnosticCompleteness.primaryRendererBounds, true);
  assert.equal(failure.pageUrl, loadedState.pageUrl);
  assert.equal(failure.webglRendererReadiness, true);
  assert.deepEqual(failure.viewport, loadedState.viewport);
  assert.deepEqual(failure.primaryRendererBounds, loadedState.primaryRendererBounds);
  assert.deepEqual(failure.consoleErrors, loadedState.consoleErrors);
  assert.equal(failure.loadedStateEvidence.voxels, 37678);
  assert.equal(failure.loadedStateEvidence.selectedFacing.centerNearestDistance, 6.5);
  assert.equal(failure.attachments[0].inlineBodyPresent, true);
}));

test('missing structured reporter fails closed even when error-context fallback exists', () => withTempDir((dir) => {
  const contextDir = path.join(dir, 'hud-mobile-webkit');
  fs.mkdirSync(contextDir, { recursive: true });
  fs.writeFileSync(path.join(contextDir, 'error-context.md'), '- Name: fallback test\n- Location: e2e/fallback.spec.js:7:1\n\n# Error details\n\n```\nError: fallback only\n```\n');
  const summary = buildSummary({ root: dir, reportFile: path.join(dir, 'missing.json') });
  assert.equal(summary.classification, 'OBSERVABILITY_INCOMPLETE');
  assert.equal(summary.structuredReporter.state, 'missing');
  assert.equal(summary.diagnosticCompleteness.machineReadableFailureIdentity, false);
  assert.equal(summary.failures[0].source, 'error-context-fallback');
}));

test('unparsable or zero-failure structured reporter is OBSERVABILITY_INCOMPLETE', () => withTempDir((dir) => {
  let reportFile = writeReport(dir, '{not-json');
  let summary = buildSummary({ root: dir, reportFile });
  assert.equal(summary.structuredReporter.state, 'parse-error');
  assert.equal(summary.diagnosticCompleteness.machineReadableFailureIdentity, false);

  reportFile = writeReport(dir, { suites: [] });
  summary = buildSummary({ root: dir, reportFile });
  assert.equal(summary.structuredReporter.state, 'zero-failures');
  assert.equal(summary.diagnosticCompleteness.machineReadableFailureIdentity, false);
}));
