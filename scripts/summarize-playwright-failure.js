'use strict';

const fs = require('fs');
const path = require('path');

const PROJECTS = ['desktop-chromium', 'mobile-chromium', 'mobile-webkit', 'tablet-chromium'];
const VIEWPORTS = {
  'desktop-chromium': { width: 1280, height: 720, orientation: 'landscape' },
  'mobile-chromium': { width: 412, height: 915, orientation: 'portrait' },
  'mobile-webkit': { width: 390, height: 664, orientation: 'portrait' },
  'tablet-chromium': { width: 810, height: 1080, orientation: 'portrait' },
};

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(p) : [p];
  });
}

function projectFromPath(p) {
  return PROJECTS.find((project) => p.includes(`-${project}${path.sep}`) || p.includes(`-${project}/`)) || null;
}

function browserFromProject(project) {
  if (!project) return null;
  if (project.includes('webkit')) return 'webkit';
  if (project.includes('chromium')) return 'chromium';
  if (project.includes('firefox')) return 'firefox';
  return null;
}

function normalizeLocation(location, fallback = {}) {
  const file = location?.file || fallback.file || null;
  const line = location?.line ?? fallback.line ?? null;
  const column = location?.column ?? fallback.column ?? null;
  if (!file) return null;
  return line ? `${file}:${line}${column ? `:${column}` : ''}` : file;
}

function firstLine(value) {
  return typeof value === 'string' ? value.split('\n').find((line) => line.trim())?.trim() || null : null;
}

function parseContext(file, root) {
  const text = fs.readFileSync(file, 'utf8');
  const name = text.match(/^- Name:\s*(.+)$/m)?.[1]?.trim() || null;
  const location = text.match(/^- Location:\s*(.+)$/m)?.[1]?.trim() || null;
  const error = text.match(/# Error details\s*\n\n```\s*\n([\s\S]*?)\n```/m)?.[1]?.trim() || null;
  const project = projectFromPath(file);
  const dir = path.dirname(file);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  return {
    source: 'error-context-fallback',
    project,
    browser: browserFromProject(project),
    specFile: null,
    specTestTitle: name,
    outcome: 'failed',
    status: 'failed',
    retry: null,
    durationMs: null,
    firstFailingAssertion: firstLine(error),
    errorMessage: error,
    errorStack: null,
    sourceLocation: location,
    pageUrl: null,
    pageErrors: [],
    consoleErrors: [],
    webglRendererReadiness: null,
    viewport: project ? VIEWPORTS[project] || null : null,
    primaryRendererBounds: null,
    attachments: files,
    screenshotFiles: files.filter((f) => /\.(png|jpe?g|webp)$/i.test(f)),
    traceFiles: files.filter((f) => f === 'trace.zip'),
    errorContext: path.relative(root, file).replaceAll('\\', '/'),
  };
}

function failedResult(test) {
  const results = Array.isArray(test?.results) ? test.results : [];
  return results.find((result) => ['failed', 'timedOut', 'interrupted'].includes(result?.status)) || null;
}

function collectJsonFailures(report) {
  const failures = [];
  function visitSuite(suite, titlePath = []) {
    if (!suite || typeof suite !== 'object') return;
    const nextTitles = suite.title ? [...titlePath, suite.title] : titlePath;
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const result = failedResult(test);
        if (!result) continue;
        const project = test.projectName || null;
        const error = result.errors?.[0] || result.error || null;
        const attachments = (result.attachments || []).map((attachment) => ({
          name: attachment.name || null,
          contentType: attachment.contentType || null,
          path: attachment.path || null,
        }));
        const fullTitle = [...nextTitles, spec.title].filter(Boolean).join(' › ');
        failures.push({
          source: 'playwright-json-reporter',
          project,
          browser: browserFromProject(project),
          specFile: spec.file || suite.file || null,
          specTestTitle: fullTitle || spec.title || null,
          outcome: test.status || result.status || 'failed',
          status: result.status || test.status || 'failed',
          retry: result.retry ?? null,
          durationMs: result.duration ?? null,
          firstFailingAssertion: firstLine(error?.message || error?.stack),
          errorMessage: error?.message || null,
          errorStack: error?.stack || null,
          sourceLocation: normalizeLocation(error?.location, {
            file: spec.file || suite.file,
            line: spec.line,
            column: spec.column,
          }),
          pageUrl: null,
          pageErrors: [],
          consoleErrors: [],
          webglRendererReadiness: null,
          viewport: project ? VIEWPORTS[project] || null : null,
          primaryRendererBounds: null,
          attachments,
          screenshotFiles: attachments.filter((a) => /image\//i.test(a.contentType || '') || /\.(png|jpe?g|webp)$/i.test(a.path || '')).map((a) => a.path || a.name),
          traceFiles: attachments.filter((a) => a.name === 'trace' || /trace\.zip$/i.test(a.path || '')).map((a) => a.path || a.name),
          errorContext: null,
        });
      }
    }
    for (const child of suite.suites || []) visitSuite(child, nextTitles);
  }
  for (const suite of report?.suites || []) visitSuite(suite, []);
  return failures;
}

function readStructuredReport(reportFile) {
  if (!fs.existsSync(reportFile)) {
    return { state: 'missing', failures: [], error: `structured reporter missing: ${reportFile}` };
  }
  try {
    const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    const failures = collectJsonFailures(report);
    if (failures.length === 0) {
      return { state: 'zero-failures', failures: [], error: 'structured reporter contained zero failed test identities' };
    }
    return { state: 'ok', failures, error: null };
  } catch (error) {
    return { state: 'parse-error', failures: [], error: `structured reporter parse error: ${error.message}` };
  }
}

function buildSummary(options = {}) {
  const root = options.root || process.env.PLAYWRIGHT_RESULTS_DIR || 'test-results';
  const reportFile = options.reportFile || process.env.PLAYWRIGHT_JSON_REPORT || path.join(root, 'playwright-results.json');
  const structured = readStructuredReport(reportFile);
  const contexts = walk(root).filter((p) => p.endsWith('error-context.md'));
  const fallbackFailures = contexts.map((file) => parseContext(file, root));
  const failures = structured.failures.length > 0 ? structured.failures : fallbackFailures;
  const headSha = process.env.CANONICAL_PR_HEAD_SHA || process.env.GITHUB_SHA || null;
  const mergeSha = process.env.GITHUB_SHA || null;
  const isDifferentSha = Boolean(headSha && mergeSha && headSha !== mergeSha);
  const artifactName = `playwright-failure-${headSha || 'unknown-head'}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`;
  const machineReadableFailureIdentity = structured.state === 'ok' && structured.failures.every((failure) =>
    Boolean(failure.project && failure.specFile && failure.specTestTitle && failure.firstFailingAssertion && failure.sourceLocation)
  );

  return {
    schemaVersion: 2,
    classification: machineReadableFailureIdentity ? 'HARD_BROWSER_FAILURE' : 'OBSERVABILITY_INCOMPLETE',
    canonicalPrHeadSha: headSha,
    githubMergeRefSha: isDifferentSha ? mergeSha : null,
    workflow: {
      runId: process.env.GITHUB_RUN_ID || null,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
      job: process.env.GITHUB_JOB || null,
    },
    artifactName,
    structuredReporter: {
      path: path.relative(root, reportFile).replaceAll('\\', '/'),
      state: structured.state,
      error: structured.error,
      failureCount: structured.failures.length,
      fallbackContextCount: fallbackFailures.length,
    },
    exactCurrentMaster: {
      sha: process.env.CURRENT_DEFAULT_SHA || process.env.PR_BASE_SHA || null,
      sameFixtureResult: process.env.EXACT_MASTER_FIXTURE_RESULT || 'NOT_RUN',
    },
    failures,
    diagnosticCompleteness: {
      binaryEvidencePreserved: failures.some((f) => f.traceFiles.length > 0 || f.screenshotFiles.length > 0),
      machineReadableFailureIdentity,
      pageUrl: failures.some((f) => Boolean(f.pageUrl)),
      pageError: failures.some((f) => f.pageErrors.length > 0),
      consoleErrors: failures.some((f) => f.consoleErrors.length > 0),
      webglRendererReadiness: failures.some((f) => f.webglRendererReadiness !== null),
      primaryRendererBounds: failures.some((f) => f.primaryRendererBounds !== null),
    },
  };
}

function main() {
  const root = process.env.PLAYWRIGHT_RESULTS_DIR || 'test-results';
  const out = path.join(root, 'playwright-failure-summary.json');
  const summary = buildSummary({ root });
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`Playwright failure summary: ${out}`);
  console.log(`canonical head: ${summary.canonicalPrHeadSha || 'unknown'}; merge-ref: ${summary.githubMergeRefSha || 'same/none'}; failures: ${summary.failures.length}`);
  console.log(`structured reporter: ${summary.structuredReporter.state}; machine-readable identity: ${summary.diagnosticCompleteness.machineReadableFailureIdentity}`);
  for (const failure of summary.failures) {
    console.log(`- ${failure.project || 'unknown'} | ${failure.specFile || 'unknown'} | ${failure.specTestTitle || 'unknown'} | ${failure.sourceLocation || 'unknown'}`);
  }
  if (!summary.diagnosticCompleteness.machineReadableFailureIdentity) {
    console.error('OBSERVABILITY_INCOMPLETE: hard browser failure lacks a complete structured Playwright failure identity.');
    process.exitCode = 2;
  }
}

if (require.main === module) main();

module.exports = {
  buildSummary,
  collectJsonFailures,
  readStructuredReport,
};
