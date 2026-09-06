#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const root = path.resolve(process.argv[2] || process.cwd());
const suppliedUrl = process.argv.find((x) => /^https?:\/\//.test(x));
const requiredLocal = [
  'apps/dark-void-scene/index.html',
  'apps/dark-void-scene/client.js',
  'shared/navigator-dialog.mjs',
  'shared/dark-void-manifestation.mjs',
  'shared/world-manifestation-engine.mjs',
  'shared/world-command-parser.mjs',
  'shared/world-shape-library.mjs',
  'shared/dark-void-science-journey.mjs',
  'shared/dark-void-infinite-runtime.mjs',
  'shared/dark-void-distance-streamer.mjs',
  'shared/dark-void-counterfactual-ghost.mjs',
  'shared/dark-void-science-evidence.mjs',
];

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const liveAssets = [
  '/apps/dark-void-scene/client.js',
  '/shared/navigator-dialog.mjs',
  '/shared/world-manifestation-engine.mjs',
  '/shared/world-command-parser.mjs',
  '/shared/world-shape-library.mjs',
  '/shared/dark-void-science-evidence.mjs',
];

let ok = true;
for (const file of requiredLocal) {
  const exists = fs.existsSync(path.join(root, file));
  console.log(exists ? 'PASS' : 'FAIL', file);
  ok &&= exists;
}

const htmlPath = path.join(root, requiredLocal[0]);
const localHtml = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
for (const [name, re] of [
  ['lang=en', /<html[^>]*\blang=(?:\x22|\x27)en(?:\x22|\x27)/i],
  ['viewport-fit-cover', /viewport-fit=cover/i],
  ['public-no-H4', !/(?:>\s*H4\b|Hypothesis\s*4\b)/i.test(localHtml)],
]) {
  const pass = typeof re === 'boolean' ? re : re.test(localHtml);
  console.log(pass ? 'PASS' : 'FAIL', name);
  ok &&= pass;
}

if (!suppliedUrl) {
  console.log('BLOCKED live URL not supplied; local preflight only');
  process.exit(ok ? 0 : 1);
}

function request(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 4) return reject(new Error('too many redirects'));
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get(parsed, {
      headers: { 'user-agent': 'WorldServer-DarkVoid-Healthcheck/2' },
    }, (res) => {
      const location = res.headers.location;
      if (location && res.statusCode >= 300 && res.statusCode < 400) {
        res.resume();
        return request(new URL(location, parsed).href, redirects + 1).then(resolve, reject);
      }
      const chunks = [];
      let bytes = 0;
      res.on('data', (chunk) => {
        if (bytes < 250000) {
          chunks.push(chunk);
          bytes += chunk.length;
        }
      });
      res.on('end', () => resolve({
        url: parsed.href,
        status: res.statusCode || 0,
        type: String(res.headers['content-type'] || ''),
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.setTimeout(12000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

(async () => {
  try {
    const live = await request(suppliedUrl);
    const htmlChecks = [
      ['live-status-200', live.status === 200],
      ['live-dark-void', /Dark Void|Navigator/i.test(live.body)],
      ['live-lang-en', /<html[^>]*\blang=(?:\x22|\x27)en(?:\x22|\x27)/i.test(live.body)],
      ['live-no-H4', !/(?:>\s*H4\b|Hypothesis\s*4\b)/i.test(live.body)],
      ['live-html-not-error-json', /text\/html/i.test(live.type) && !/^\s*\{[\s\S]*"(?:error|message)"/i.test(live.body)],
    ];
    for (const [name, pass] of htmlChecks) {
      console.log(pass ? 'PASS' : 'FAIL', name, pass ? '' : live.url);
      ok &&= pass;
    }

    const origin = new URL(live.url).origin;
    for (const asset of liveAssets) {
      const result = await request(new URL(asset, origin).href);
      const localPath = path.join(root, asset.replace(/^\//, ''));
      const localBody = fs.existsSync(localPath) ? fs.readFileSync(localPath, 'utf8') : '';
      const executable = result.status === 200 &&
        /(?:javascript|ecmascript|text\/plain|application\/octet-stream)/i.test(result.type) &&
        !/<html[\s>]/i.test(result.body);
      const revisionMatch = executable && localBody.length > 0 && sha256(result.body) === sha256(localBody);
      console.log(executable ? 'PASS' : 'FAIL', 'live-asset', asset, result.status, result.type || '-');
      console.log(revisionMatch ? 'PASS' : 'FAIL', 'live-revision', asset);
      ok &&= executable && revisionMatch;
    }

    console.log('FINAL_URL', live.url);
    process.exit(ok ? 0 : 1);
  } catch (error) {
    console.error('FAIL live publication', error.message);
    process.exit(1);
  }
})();
