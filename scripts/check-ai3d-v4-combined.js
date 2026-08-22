'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
let failed = false;

function check(cond, msg) {
  if (cond) console.log(`OK: ${msg}`);
  else { console.error(`FAIL: ${msg}`); failed = true; }
}

function text(rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

for (const rel of [
  'ai3d-final-delivery.json',
  'lib/ai3d-delivery-policy.js',
  'scripts/check-ai3d-delivery-policy.js',
  'scripts/check-ai3d-public-scene.js',
  'shared/ai3d-playable-runtime.js',
  'api/ai3d-voxel-generate.js',
  'test/ai3d-delivery-policy.test.js',
  'test/ai3d-voxel-serverless.test.js',
  'apps/ai3d-voxel-city/default-city.json',
  'apps/ai3d-voxel-city/scene-delivery.json',
  'e2e/ai3d-voxel-city-autoplay.spec.js',
  'playwright.config.js'
]) check(fs.existsSync(path.join(root, rel)), `${rel} exists`);

const ai3d = text('api/ai3d.js');
check(ai3d.includes('deliveryPolicyForClient'), '/api/ai3d exposes delivery policy');
check(ai3d.includes('deliveryStatusForClient'), '/api/ai3d exposes delivery status');
check(ai3d.includes("action === 'delivery'"), '/api/ai3d has delivery action');

const server = text('server.js');
check(server.includes('/api/ai3d-voxel-generate'), 'local server registers serverless voxel endpoint');

const client = text('apps/ai3d-voxel-city/client.js');
check(client.includes('generateServerlessFallback'), 'Voxel City has Vercel fallback');
check(client.includes('/api/ai3d-voxel-generate'), 'Voxel City calls serverless voxel endpoint');
check(client.includes('Vercel fallback ready'), 'UI reports fallback readiness');
check(client.includes('autoLoadDefaultCity'), 'Voxel City has default-city autoplay (no button)');
check(client.includes('collidesAt') && client.includes('onGround'), 'Voxel City has collision+gravity');
check(client.includes('default-city.json'), 'Voxel City autoplay uses immutable asset');
check(!client.includes('HTTP 200') || client.includes('do NOT count HTTP 200'), 'HTTP 200 not counted as ready proof');

const ci = text('.github/workflows/ci.yml');
check(ci.includes('AI3D final delivery policy (hard)'), 'CI hard delivery gate present');
check(ci.includes('node scripts/check-ai3d-delivery-policy.js'), 'CI executes hard delivery gate');
check(ci.includes('playwright') && ci.includes('ai3d-voxel-city-autoplay'), 'CI has Playwright autoplay hard gate');
check(ci.includes('npx playwright test'), 'CI executes Playwright tests');

const diagnostic = text('apps/ai3d-reference-test/index.html');
check(diagnostic.includes('DIAGNOSTIC ONLY'), 'old reference viewer marked diagnostic only');

const status = text('ai3d-final-delivery.json');
check(status.includes('NOT_READY_FOR_FINAL_DELIVERY') || status.includes('READY_FOR_FINAL_DELIVERY'),
      'machine-readable delivery status exists');

if (failed) {
  console.error('\nAI3D V4 COMBINED INTEGRITY CHECK FAILED');
  process.exit(1);
}
console.log('\nAI3D V4 COMBINED INTEGRITY CHECK PASSED');
