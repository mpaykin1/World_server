'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const manifestHandler = require('../api/pwa-manifest');
const { injectHtml, appOptions } = require('../scripts/inject-pwa-runtime');

const ROOT = path.resolve(__dirname, '..');

function invoke(handler, { method = 'GET', url = '/', query = {} } = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    const req = { method, url, query, headers: {} };
    const res = {
      statusCode: 200,
      setHeader(name, value) { headers[String(name).toLowerCase()] = value; },
      end(body = '') { resolve({ statusCode: this.statusCode, headers, body: String(body) }); }
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

test('PWA injector is idempotent and adds iPhone/install metadata', () => {
  const source = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>x</title></head><body></body></html>';
  const once = injectHtml(source, appOptions('catalog'));
  const twice = injectHtml(once, appOptions('catalog'));

  assert.equal(once, twice);
  assert.match(once, /rel="manifest"/);
  assert.match(once, /apple-mobile-web-app-capable/);
  assert.match(once, /apple-touch-icon/);
  assert.match(once, /viewport-fit=cover/);
  assert.match(once, /\/shared\/pwa-runtime\.js/);
  assert.match(once, /\/shared\/quality-telemetry\.js/);
  assert.match(once, /\/shared\/device-quality-runtime\.js/);
  assert.match(once, /\/shared\/graphics-quality-controller\.js/);
  assert.match(once, /\/shared\/frame-stutter-profiler\.js/);
  assert.match(once, /\/shared\/predictive-streaming-runtime\.js/);
  assert.match(once, /\/shared\/asset-delivery-runtime\.js/);
  assert.match(once, /\/shared\/animation-quality-validator\.js/);
  assert.match(once, /\/shared\/rig-adapters\.js/);
});

test('dynamic manifest is scoped to one app', async () => {
  const response = await invoke(manifestHandler, { query: { app: 'voxel-world' } });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'], /application\/manifest\+json/);
  const manifest = JSON.parse(response.body);
  assert.equal(manifest.scope, '/apps/voxel-world/');
  assert.equal(manifest.id, '/apps/voxel-world/');
  assert.match(manifest.start_url, /^\/apps\/voxel-world\//);
  assert.equal(manifest.display, 'standalone');
});

test('unknown app cannot create an arbitrary manifest scope', async () => {
  const response = await invoke(manifestHandler, { query: { app: '../../admin' } });
  assert.equal(response.statusCode, 404);
});

test('service worker bypasses API caching and provides offline navigation fallback', () => {
  const source = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert.match(source, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(source, /OFFLINE_URL/);
  assert.match(source, /request\.mode === 'navigate'/);
  assert.match(source, /ASSET_CACHE/);
  assert.match(source, /'glb'/);
  assert.match(source, /trimCache/);
  assert.match(source, /world-server-pwa-v4/);
});

test('PWA runtime exposes adaptive renderer and quality hooks', () => {
  const source = fs.readFileSync(path.join(ROOT, 'shared/pwa-runtime.js'), 'utf8');
  assert.match(source, /registerRenderer/);
  assert.match(source, /registerQualityAdapter/);
  assert.match(source, /worldserver:quality-profile/);
  assert.match(source, /pwa_quality/);
  assert.match(source, /profileStorageKey/);
  assert.match(source, /PerformanceObserver/);
});


test('asset delivery runtime respects constrained-network policy', () => {
  const source = fs.readFileSync(path.join(ROOT, 'shared/asset-delivery-runtime.js'), 'utf8');
  assert.match(source, /saveData/);
  assert.match(source, /runtime-asset-manifest\.json/);
  assert.match(source, /requestIdleCallback/);
});


test('stutter and predictive streaming runtimes are installed', () => {
  const stutter = fs.readFileSync(path.join(ROOT, 'shared/frame-stutter-profiler.js'), 'utf8');
  const predictive = fs.readFileSync(path.join(ROOT, 'shared/predictive-streaming-runtime.js'), 'utf8');
  assert.match(stutter, /compileAsync|renderer\.compile/);
  assert.match(stutter, /stutterScore/);
  assert.match(predictive, /worldserver:stream-prediction/);
  assert.match(predictive, /velocity/);
});

test('device runtime samples memory pressure and WebGL context loss when available', () => {
  const source = fs.readFileSync(path.join(ROOT, 'shared/device-quality-runtime.js'), 'utf8');
  assert.match(source, /usedJSHeapSize/);
  assert.match(source, /webglcontextlost/);
});


test('local server exposes learned profile API and data manifests', () => {
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const telemetry = fs.readFileSync(path.join(ROOT, 'api/quality-telemetry.js'), 'utf8');
  assert.match(server, /quality-profile/);
  assert.match(server, /\/data\//);
  assert.match(telemetry, /readJsonBody/);
});

test('V4 asset toolchain remains source-preserving and CPU-only', () => {
  const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/asset-transcode-policy.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/asset-toolchain-lock.json'), 'utf8'));
  assert.equal(policy.preserveSources, true);
  assert.ok(lock.packages['@gltf-transform/cli']);
  assert.ok(lock.packages['ktx2-encoder']);
});
