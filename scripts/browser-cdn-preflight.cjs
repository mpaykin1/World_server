'use strict';

// Read-only browser/network preflight. Never weakens certificate verification.
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_URL = 'https://unpkg.com/three@0.165.0/build/three.module.js';
const FILE_EXTENSIONS = new Set(['.js', '.mjs', '.html']);
const CDN_PATTERN = /https:\/\/(?:unpkg\.com|cdn\.jsdelivr\.net|esm\.sh)\//g;

function diagnose(errorText = '', loaded = false) {
  if (loaded) return 'BROWSER_MODULE_OK';
  const details = String(errorText);
  if (/ERR_BLOCKED_BY_ADMINISTRATOR|ERR_BLOCKED_BY_CLIENT|blocked by policy/i.test(details)) {
    return 'BROWSER_POLICY_BLOCK';
  }
  if (/ERR_CERT|certificate (?:verify|authority)|SSL_ERROR|ERR_SSL/i.test(details)) {
    return 'BROWSER_TLS_TRUST_FAILURE';
  }
  if (/ERR_NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN/i.test(details)) return 'DNS_FAILURE';
  if (/ERR_CONNECTION|ECONNRESET|ETIMEDOUT|timed out/i.test(details)) return 'CONNECTION_FAILURE';
  if (/Cannot find module|browserType\.launch|Executable doesn't exist/i.test(details)) {
    return 'BROWSER_UNAVAILABLE';
  }
  return 'UNCLASSIFIED_BROWSER_FAILURE';
}

function scanCdnImports(dir, prefix = dir, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'dist', '.git'].includes(entry.name)) scanCdnImports(full, prefix, output);
      continue;
    }
    if (!entry.isFile() || !FILE_EXTENSIONS.has(path.extname(entry.name))) continue;
    const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
    lines.forEach((line, idx) => {
      const matches = line.match(CDN_PATTERN);
      if (matches) output.push({ file: path.relative(prefix, full).replace(/\\/g, '/'), line: idx + 1, count: matches.length });
    });
  }
  return output;
}

async function browserProbe(targetUrl) {
  let browser;
  const failedRequests = [];
  try {
    // Explicitly do not set ignoreHTTPSErrors, ignore-certificate-errors or bypassCSP.
    const { chromium } = require('@playwright/test');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ ignoreHTTPSErrors: false });
    const page = await context.newPage();
    page.on('requestfailed', request => {
      const url = new URL(request.url());
      failedRequests.push({ host: url.hostname, error: request.failure()?.errorText || 'unknown' });
    });
    await page.goto('about:blank');
    const moduleResult = await Promise.race([
      page.evaluate(async url => {
        try {
          const module = await import(url);
          return { loaded: typeof module.Scene === 'function', error: '' };
        } catch (error) {
          return { loaded: false, error: String(error) };
        }
      }, targetUrl),
      new Promise(resolve => setTimeout(() => resolve({ loaded: false, error: 'module load timed out' }), 15000))
    ]);
    const failure = failedRequests.map(item => item.error).concat(moduleResult.error).join(' ');
    return { status: diagnose(failure, moduleResult.loaded), loaded: moduleResult.loaded,
      failedRequests, error: moduleResult.error };
  } catch (error) {
    const message = String(error?.message || error);
    return { status: diagnose(message), loaded: false, failedRequests, error: message.slice(0, 350) };
  } finally {
    if (browser) await browser.close();
  }
}

async function main(args = process.argv.slice(2)) {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
    console.error('TLS_BYPASS_DETECTED: NODE_TLS_REJECT_UNAUTHORIZED=0. Refusing to run.');
    process.exitCode = 3;
    return;
  }
  const root = path.resolve(__dirname, '..');
  const imports = scanCdnImports(path.join(root, 'apps'));
  if (args.includes('--scan-only')) {
    console.log(JSON.stringify({ scan: imports, total: imports.length }, null, 2));
    return;
  }
  const index = args.indexOf('--url');
  const value = index < 0 ? DEFAULT_URL : args[index + 1];
  let url;
  try { url = new URL(value); } catch { throw new Error('Expected a valid HTTPS URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Only credential-free HTTPS URLs without query or fragment are accepted');
  }
  const probe = await browserProbe(url.href);
  console.log(JSON.stringify({ target: url.href, tlsVerification: 'ON', browser: probe,
    sourceCdnImports: imports.length, remediation: probe.status === 'BROWSER_POLICY_BLOCK'
      ? 'Bundle pinned assets locally; do not bypass browser policy.'
      : probe.status === 'BROWSER_TLS_TRUST_FAILURE'
      ? 'Verify the proxy CA identity and configure trusted CA only with administrator approval; never disable TLS.'
      : 'Inspect the exact browser request failure; keep TLS verification enabled.' }, null, 2));
  if (!probe.loaded) process.exitCode = 2;
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 2; });
module.exports = { diagnose, scanCdnImports, browserProbe, main };
