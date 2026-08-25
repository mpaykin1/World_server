#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const cp = require('child_process');

const ROOT = process.cwd();
const REPORT = path.join(ROOT, 'RUNTIME_PROOF_REPORT.json');
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/app-release-registry.json'), 'utf8'));
const checks = [];
let child = null;
let stdout = '';
let stderr = '';

function record(name, ok, details = {}) {
  checks.push({ name, ok: Boolean(ok), ...details });
}

function gitSha() {
  const r = cp.spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : null;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function request(url, options = {}) {
  const response = await fetch(url, { redirect: 'manual', ...options });
  const text = await response.text();
  return { response, text };
}

async function waitUntilReady(baseUrl, timeoutMs = 12000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    if (child && child.exitCode !== null) {
      throw new Error(`server exited early with code ${child.exitCode}: ${stderr.slice(-1200)}`);
    }
    try {
      const { response } = await request(`${baseUrl}/api/apps`);
      if (response.status === 200) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`runtime did not become ready: ${lastError ? lastError.message : 'timeout'}`);
}

function localAssetUrls(html, pageUrl) {
  const out = new Set();
  const re = /(?:src|href)=["']([^"']+)["']/gi;
  let match;
  while ((match = re.exec(html))) {
    const value = match[1].trim();
    if (!value || value.startsWith('data:') || value.startsWith('#') || /^https?:\/\//i.test(value)) continue;
    try {
      const resolved = new URL(value, pageUrl);
      if (resolved.pathname.endsWith('.js') || resolved.pathname.endsWith('.css')) out.add(resolved.href);
    } catch {}
  }
  return [...out].slice(0, 12);
}

async function main() {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  child = cp.spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(-12000); });
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-12000); });

  try {
    await waitUntilReady(baseUrl);
    record('server-started', true, { port });

    const root = await request(`${baseUrl}/`);
    record('root-redirect', root.response.status === 302 && root.response.headers.get('location') === '/apps/catalog/', {
      status: root.response.status,
      location: root.response.headers.get('location')
    });

    const appsResult = await request(`${baseUrl}/api/apps`);
    let appsJson = null;
    try { appsJson = JSON.parse(appsResult.text); } catch {}
    record('apps-api-json', appsResult.response.status === 200 && appsJson && Array.isArray(appsJson.apps), {
      status: appsResult.response.status
    });
    record('deny-by-default-policy', appsJson?.releasePolicy === 'deny-by-default', {
      releasePolicy: appsJson?.releasePolicy || null
    });

    const expected = Object.entries(registry.apps || {})
      .filter(([, meta]) => meta?.visible === true && meta?.status === 'certified')
      .map(([id]) => id)
      .sort();
    const published = (appsJson?.apps || []).map(app => app.id).sort();
    record('certified-app-set-exact', JSON.stringify(expected) === JSON.stringify(published), { expected, published });

    for (const id of expected) {
      const pageUrl = `${baseUrl}/apps/${id}/`;
      const page = await request(pageUrl);
      const contentType = page.response.headers.get('content-type') || '';
      const pageOk = page.response.status === 200 && contentType.includes('text/html') && page.text.length > 256;
      record(`app:${id}:html`, pageOk, {
        status: page.response.status,
        bytes: Buffer.byteLength(page.text),
        contentType
      });

      if (pageOk) {
        for (const assetUrl of localAssetUrls(page.text, pageUrl)) {
          const asset = await request(assetUrl);
          record(`app:${id}:asset:${new URL(assetUrl).pathname}`, asset.response.status === 200, {
            status: asset.response.status,
            bytes: Buffer.byteLength(asset.text)
          });
        }
      }
    }

    const missingApi = await request(`${baseUrl}/api/__runtime_proof_missing__`);
    record('unknown-api-denied', missingApi.response.status === 404, { status: missingApi.response.status });
  } catch (error) {
    record('runtime-proof-execution', false, { error: String(error.stack || error) });
  } finally {
    if (child && child.exitCode === null) child.kill();
  }

  const passed = checks.filter(item => item.ok).length;
  const failed = checks.length - passed;
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    gitSha: gitSha(),
    status: failed === 0 ? 'PASS' : 'FAIL',
    passed,
    failed,
    total: checks.length,
    passPercent: Math.round((passed * 10000) / Math.max(1, checks.length)) / 100,
    checks,
    serverLogTail: stdout.slice(-3000),
    serverErrorTail: stderr.slice(-3000)
  };
  fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[RUNTIME_PROOF] ${report.status} ${passed}/${checks.length} (${report.passPercent}%)`);
  if (failed) process.exitCode = 21;
}

main().catch(error => {
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    gitSha: gitSha(),
    status: 'FAIL',
    passed: 0,
    failed: 1,
    total: 1,
    passPercent: 0,
    checks: [{ name: 'runtime-proof-fatal', ok: false, error: String(error.stack || error) }]
  };
  fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.error('[RUNTIME_PROOF] FAIL', error);
  process.exitCode = 21;
});
