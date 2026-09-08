'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.env.PLAYWRIGHT_RESULTS_DIR || 'test-results';
const OUT = path.join(ROOT, 'playwright-failure-summary.json');

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

function parseContext(file) {
  const text = fs.readFileSync(file, 'utf8');
  const name = text.match(/^- Name:\s*(.+)$/m)?.[1]?.trim() || null;
  const location = text.match(/^- Location:\s*(.+)$/m)?.[1]?.trim() || null;
  const error = text.match(/# Error details\s*\n\n```\s*\n([\s\S]*?)\n```/m)?.[1]?.trim() || null;
  const project = projectFromPath(file);
  const dir = path.dirname(file);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  return {
    project,
    browser: project?.includes('webkit') ? 'webkit' : project?.includes('chromium') ? 'chromium' : null,
    specTestTitle: name,
    firstFailingAssertion: error?.split('\n').find(Boolean) || null,
    sourceLocation: location,
    pageUrl: null,
    pageErrors: [],
    consoleErrors: [],
    webglRendererReadiness: null,
    viewport: project ? VIEWPORTS[project] || null : null,
    primaryRendererBounds: null,
    screenshotFiles: files.filter((f) => /\.(png|jpe?g|webp)$/i.test(f)),
    traceFiles: files.filter((f) => f === 'trace.zip'),
    errorContext: path.relative(ROOT, file).replaceAll('\\', '/'),
  };
}

const contexts = walk(ROOT).filter((p) => p.endsWith('error-context.md'));
const failures = contexts.map(parseContext);
const headSha = process.env.CANONICAL_PR_HEAD_SHA || process.env.GITHUB_SHA || null;
const mergeSha = process.env.GITHUB_SHA || null;
const isDifferentSha = Boolean(headSha && mergeSha && headSha !== mergeSha);
const artifactName = `playwright-failure-${headSha || 'unknown-head'}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`;

const summary = {
  schemaVersion: 1,
  canonicalPrHeadSha: headSha,
  githubMergeRefSha: isDifferentSha ? mergeSha : null,
  workflow: {
    runId: process.env.GITHUB_RUN_ID || null,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
    job: process.env.GITHUB_JOB || null,
  },
  artifactName,
  exactCurrentMaster: {
    sha: process.env.CURRENT_DEFAULT_SHA || process.env.PR_BASE_SHA || null,
    sameFixtureResult: process.env.EXACT_MASTER_FIXTURE_RESULT || 'NOT_RUN',
  },
  failures,
  diagnosticCompleteness: {
    binaryEvidencePreserved: failures.some((f) => f.traceFiles.length > 0),
    machineReadableFailureIdentity: failures.length > 0,
    pageUrl: failures.some((f) => Boolean(f.pageUrl)),
    pageError: failures.some((f) => f.pageErrors.length > 0),
    consoleErrors: failures.some((f) => f.consoleErrors.length > 0),
    webglRendererReadiness: failures.some((f) => f.webglRendererReadiness !== null),
    primaryRendererBounds: failures.some((f) => f.primaryRendererBounds !== null),
  },
};

fs.mkdirSync(ROOT, { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`Playwright failure summary: ${OUT}`);
console.log(`canonical head: ${headSha || 'unknown'}; merge-ref: ${isDifferentSha ? mergeSha : 'same/none'}; failures: ${failures.length}`);
for (const failure of failures) {
  console.log(`- ${failure.project || 'unknown'} | ${failure.specTestTitle || 'unknown'} | ${failure.sourceLocation || 'unknown'}`);
}
