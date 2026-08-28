#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');

function runPull(cwd, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(repoRoot, 'scripts/production-quality-pull.js')], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

function fixtureRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'production-quality-evidence-'));
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'data/performance-budgets.json'), JSON.stringify({
    budgets: {
      demo: { minimumFps: 55, canvasVisibleMs: 1000 }
    }
  }));
  return dir;
}

test('workflow always uploads evidence and posts issue body from evidence file', () => {
  const yml = fs.readFileSync(path.join(repoRoot, '.github/workflows/production-quality-feedback.yml'), 'utf8');
  assert.match(yml, /uses:\s*actions\/upload-artifact@v4/);
  assert.match(yml, /if:\s*always\(\)/);
  assert.match(yml, /PRODUCTION_QUALITY_REPORT\.json/);
  assert.match(yml, /PRODUCTION_QUALITY_ISSUE\.md/);
  assert.match(yml, /--body-file PRODUCTION_QUALITY_ISSUE_WITH_RUN\.md/);
  assert.match(yml, /Production quality monitor failure/);
  assert.match(yml, /Production quality regression detected/);
});

test('product regression persists exact machine and human evidence', async (t) => {
  const dir = fixtureRepo();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      ok: true,
      apps: {
        demo: { sessions: 100, p10Fps: 20, p95LoadMs: 9000, errors: 20 }
      }
    }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const port = server.address().port;
  const result = await runPull(dir, {
    QUALITY_BASE_URL: `http://127.0.0.1:${port}`,
    QUALITY_TIMEOUT_MS: '2000'
  });

  assert.equal(result.code, 23);
  const report = JSON.parse(fs.readFileSync(path.join(dir, 'PRODUCTION_QUALITY_REPORT.json'), 'utf8'));
  const issue = fs.readFileSync(path.join(dir, 'PRODUCTION_QUALITY_ISSUE.md'), 'utf8');

  assert.equal(report.pass, false);
  assert.equal(report.classification, 'product_regression');
  assert.ok(report.violations.some(v => v.type === 'production-fps'));
  assert.ok(report.violations.some(v => v.type === 'production-load'));
  assert.ok(report.violations.some(v => v.type === 'production-errors'));
  assert.match(issue, /product_regression/);
  assert.match(issue, /production-fps/);
});

test('monitor network failure still persists evidence', async (t) => {
  const dir = fixtureRepo();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const result = await runPull(dir, {
    QUALITY_BASE_URL: 'http://127.0.0.1:1',
    QUALITY_TIMEOUT_MS: '500'
  });

  assert.equal(result.code, 24);
  const reportPath = path.join(dir, 'PRODUCTION_QUALITY_REPORT.json');
  const issuePath = path.join(dir, 'PRODUCTION_QUALITY_ISSUE.md');
  assert.equal(fs.existsSync(reportPath), true);
  assert.equal(fs.existsSync(issuePath), true);

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(report.classification, 'monitor_failure');
  assert.ok(report.violations.some(v => v.type === 'monitor-fetch-failure'));
});
