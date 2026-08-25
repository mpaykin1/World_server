#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { injectHtml, appOptions, shouldSkip } = require('./inject-pwa-runtime');

const ROOT = path.resolve(__dirname, '..');
const APPS = path.join(ROOT, 'apps');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) out.push(full);
  }
  return out;
}

const checks = [];
function check(name, pass, detail = '') {
  checks.push({ name, pass: Boolean(pass), detail });
}

check('root service worker', fs.existsSync(path.join(ROOT, 'sw.js')));
check('offline fallback', fs.existsSync(path.join(ROOT, 'offline.html')));
check('PWA runtime', fs.existsSync(path.join(ROOT, 'shared/pwa-runtime.js')));
check('device capability runtime', fs.existsSync(path.join(ROOT, 'shared/device-quality-runtime.js')));
check('graphics quality controller', fs.existsSync(path.join(ROOT, 'shared/graphics-quality-controller.js')));
check('frame stutter profiler', fs.existsSync(path.join(ROOT, 'shared/frame-stutter-profiler.js')));
check('predictive streaming runtime', fs.existsSync(path.join(ROOT, 'shared/predictive-streaming-runtime.js')));
check('asset delivery runtime', fs.existsSync(path.join(ROOT, 'shared/asset-delivery-runtime.js')));
check('animation quality validator', fs.existsSync(path.join(ROOT, 'shared/animation-quality-validator.js')));
check('rig adapters', fs.existsSync(path.join(ROOT, 'shared/rig-adapters.js')));
for (const rel of [
  'shared/pwa-runtime.js','shared/device-quality-runtime.js','shared/graphics-quality-controller.js',
  'shared/frame-stutter-profiler.js','shared/predictive-streaming-runtime.js','shared/asset-delivery-runtime.js',
  'shared/animation-quality-validator.js','shared/rig-adapters.js'
]) {
  const file = path.join(ROOT, rel);
  const r = fs.existsSync(file) ? cp.spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' }) : { status: 1, stderr: 'missing' };
  check(`runtime-syntax:${rel}`, r.status === 0, r.stderr || r.stdout || '');
}

check('adaptive renderer runtime', fs.existsSync(path.join(ROOT, 'shared/golden-performance-autotuner.js')));
check('quality telemetry runtime', fs.existsSync(path.join(ROOT, 'shared/quality-telemetry.js')));
check('dynamic manifest API', fs.existsSync(path.join(ROOT, 'api/pwa-manifest.js')));
check('asset quality policy', fs.existsSync(path.join(ROOT, 'data/asset-quality-policy.json')));
check('self improvement risk policy', fs.existsSync(path.join(ROOT, 'data/self-improvement-risk-policy.json')));
check('runtime integration discovery', fs.existsSync(path.join(ROOT, 'scripts/runtime-integration-discovery.js')));
check('runtime adapter integrator', fs.existsSync(path.join(ROOT, 'scripts/integrate-runtime-adapters.js')));
check('quality convergence loop', fs.existsSync(path.join(ROOT, 'scripts/quality-convergence-loop.js')));
check('quality convergence policy', fs.existsSync(path.join(ROOT, 'data/quality-convergence-policy.json')));
check('CPU asset transcode policy', fs.existsSync(path.join(ROOT, 'data/asset-transcode-policy.json')));
check('CPU asset transcode script', fs.existsSync(path.join(ROOT, 'scripts/cpu-asset-transcode.js')));
check('quality profile API', fs.existsSync(path.join(ROOT, 'api/quality-profile.js')));
check('quality telemetry v4 migration', fs.existsSync(path.join(ROOT, 'supabase/migrations/20260824053000_quality_telemetry_v4.sql')));
check('free asset toolchain lock', fs.existsSync(path.join(ROOT, 'data/asset-toolchain-lock.json')));
check('free asset toolchain bootstrap', fs.existsSync(path.join(ROOT, 'scripts/bootstrap-free-asset-toolchain.js')));
check('real iOS telemetry gate', fs.existsSync(path.join(ROOT, 'scripts/real-ios-telemetry-gate.js')));
check('iOS WebKit deployed spec', fs.existsSync(path.join(ROOT, 'e2e/ios-pwa-runtime.spec.js')));


const vercel = fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const buildCommand = String(pkg.scripts?.build || '');
const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
check('local quality-profile API route', serverSource.includes("'/api/quality-profile'") || serverSource.includes('quality-profile'));
check('local data manifest serving', serverSource.includes("startsWith('/data/')") || serverSource.includes('startsWith('/data/')'));
const telemetryApi = fs.readFileSync(path.join(ROOT, 'api/quality-telemetry.js'), 'utf8');
check('telemetry parses local streamed JSON', telemetryApi.includes('readJsonBody'));

check('Vercel build injects PWA',
  vercel.includes('inject-pwa-runtime.js') ||
  (vercel.includes('npm run build') && buildCommand.includes('inject-pwa-runtime.js'))
);
check('service worker no-cache header', vercel.includes('"source": "/sw.js"') && vercel.includes('Service-Worker-Allowed'));
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
check('heavy 3D asset cache', sw.includes('ASSET_CACHE') && sw.includes("'glb'") && sw.includes("'ktx2'"));
check('bounded runtime caches', sw.includes('LIMITS') && sw.includes('trimCache'));
check('single heavy asset cache guard', sw.includes('MAX_SINGLE_ASSET_BYTES'));

let appCount = 0;
for (const file of walk(APPS)) {
  if (shouldSkip(file)) continue;
  const relative = path.relative(APPS, file);
  const appId = relative.split(path.sep)[0];
  const html = fs.readFileSync(file, 'utf8');
  if (!/<\/head>/i.test(html)) continue;
  appCount++;
  try {
    const once = injectHtml(html, appOptions(appId));
    const twice = injectHtml(once, appOptions(appId));
    check(
      `injectable:${relative.replaceAll('\\', '/')}`,
      once === twice &&
      once.includes('/shared/pwa-runtime.js') &&
      once.includes('/shared/device-quality-runtime.js') &&
      once.includes('/shared/graphics-quality-controller.js') &&
      once.includes('/shared/frame-stutter-profiler.js') &&
      once.includes('/shared/predictive-streaming-runtime.js') &&
      once.includes('/shared/asset-delivery-runtime.js') &&
      once.includes('/shared/animation-quality-validator.js') &&
      once.includes('/shared/rig-adapters.js') &&
      once.includes('/api/pwa-manifest?app=') &&
      /viewport-fit=cover/i.test(once)
    );
  } catch (error) {
    check(`injectable:${relative.replaceAll('\\', '/')}`, false, error.message);
  }
}

check('at least one installable app', appCount > 0, `apps=${appCount}`);
const assetManifest = path.join(ROOT, 'data/runtime-asset-manifest.json');
check('runtime asset manifest generated', fs.existsSync(assetManifest));
const derivedMap = path.join(ROOT, 'data/derived-asset-map.json');
check('derived asset map generated', fs.existsSync(derivedMap));

const releaseRegistry = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/app-release-registry.json'), 'utf8'));
for (const [id, meta] of Object.entries(releaseRegistry.apps || {})) {
  if (meta.status !== 'certified' || meta.kind !== 'game') continue;
  const dir = path.join(ROOT, 'apps', id);
  const codeFiles = [];
  (function collect(d){ if(!fs.existsSync(d))return; for(const e of fs.readdirSync(d,{withFileTypes:true})){ const f=path.join(d,e.name); if(e.isDirectory())collect(f); else if(e.isFile()&&/\.(js|mjs|ts|tsx)$/i.test(e.name))codeFiles.push(f); } })(dir);
  const code = codeFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');
  const hasRenderer = /new\s+THREE\.WebGLRenderer\s*\(/.test(code);
  const hasScene = /new\s+THREE\.Scene\s*\(/.test(code);
  const hasCamera = /new\s+THREE\.(?:PerspectiveCamera|OrthographicCamera)\s*\(/.test(code);
  if (hasRenderer) check(`certified-renderer-integrated:${id}`, /WORLD_SERVER_RUNTIME_ADAPTER:START|WorldServerPWA\??\.registerRenderer/.test(code));
  if (hasRenderer && hasScene && hasCamera) {
    check(`certified-stutter-integrated:${id}`, code.includes('WorldServerStutterProfiler'));
    check(`certified-predictive-integrated:${id}`, code.includes('WorldServerPredictiveStreaming'));
    check(`certified-rig-scan-integrated:${id}`, code.includes('WorldServerRigAdapters?.scanScene') || code.includes('WorldServerRigAdapters.scanScene'));
  }
  if (id === 'voxel-world' && /loadNeededChunks\s*\(/.test(code)) check('voxel-predictive-center-integrated', code.includes('WORLD_SERVER_PREDICTIVE_CHUNK_CENTER'));
}

const passed = checks.filter(item => item.pass).length;
const readiness = Math.round(passed * 1000 / Math.max(1, checks.length)) / 10;
const failed = checks.filter(item => !item.pass);

console.log(`[PWA_CHECK] readiness=${readiness}% passed=${passed}/${checks.length} apps=${appCount}`);
for (const item of failed) console.error(`[PWA_CHECK] FAIL ${item.name}${item.detail ? `: ${item.detail}` : ''}`);

if (failed.length) process.exit(42);
