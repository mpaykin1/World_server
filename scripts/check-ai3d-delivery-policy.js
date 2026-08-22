'use strict';
const fs = require('fs');
const path = require('path');
const { AI3D_DELIVERY_POLICY, loadDeliveryStatus, validateFinalDeliveryStatus } = require('../lib/ai3d-delivery-policy');
const root = path.resolve(__dirname, '..');
let failed = false;
function check(condition, message) { if (!condition) { console.error(`FAIL: ${message}`); failed = true; } else console.log(`OK: ${message}`); }
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

check(AI3D_DELIVERY_POLICY.schema === 'ai3d-scene-delivery-policy-v3', 'delivery policy v3 active');
check(AI3D_DELIVERY_POLICY.sceneDeliveryRequired === true, 'final deliverable must be playable scene');
check(AI3D_DELIVERY_POLICY.diagnosticViewerIsFinalDeliverable === false, 'diagnostic viewer forbidden as final');
check(AI3D_DELIVERY_POLICY.environmentScene.keyboardMovement.includes('WASD'), 'WASD required');
check(AI3D_DELIVERY_POLICY.environmentScene.keyboardMovement.includes('ARROW_KEYS'), 'arrow keys required');
check(AI3D_DELIVERY_POLICY.environmentScene.mouseLook === true, 'mouse-look required');
check(AI3D_DELIVERY_POLICY.environmentScene.collisionRequired === true, 'collisions required');
check(AI3D_DELIVERY_POLICY.referenceFidelity.heightfieldDominantIsFailureForCity === true, 'heightfield city is failure');

for (const rel of ['AGENTS.md','ai3d-final-delivery.json','docs/AI3D_WALKABLE_REQUIREMENTS.md','docs/AI3D_FAILURE_ANALYSIS.md','docs/AI3D_FAILURE_ANALYSIS_V2.md','docs/AI3D_FAILURE_ANALYSIS_V3.md','docs/AI3D_FINAL_DELIVERY_CONTRACT.md']) check(fs.existsSync(path.join(root, rel)), `${rel} exists`);

const status = loadDeliveryStatus(root);
const statusErrors = validateFinalDeliveryStatus(status, { repoRoot: root });
check(statusErrors.length === 0, `ai3d-final-delivery.json valid${statusErrors.length ? ': ' + statusErrors.join('; ') : ''}`);

const agents = read('AGENTS.md').toLowerCase();
for (const phrase of ['walkable','1в1','wasd','стрел','мыш','heightfield-dominant','not ready for final delivery']) check(agents.includes(phrase), `AGENTS.md includes rule: ${phrase}`);

const api = read('api/ai3d.js');
check(api.includes('deliveryPolicyForClient'), '/api/ai3d imports delivery policy');
check(api.includes('deliveryStatusForClient'), '/api/ai3d imports delivery status');
check(api.includes('deliveryPolicy:'), '/api/ai3d session exposes deliveryPolicy');
check(api.includes('deliveryStatus:'), '/api/ai3d session exposes deliveryStatus');
check(api.includes("action === 'delivery'"), '/api/ai3d exposes delivery action');

const diagnostic = read('apps/ai3d-reference-test/index.html');
check(diagnostic.includes('DIAGNOSTIC ONLY'), 'reference-test visibly diagnostic');
check(diagnostic.includes('НЕ ФИНАЛЬНЫЙ РЕЗУЛЬТАТ'), 'reference-test explicitly not final');

const ci = read('.github/workflows/ci.yml');
check(ci.includes('AI3D final delivery policy (hard)'), 'CI contains hard delivery gate');
check(ci.includes('node scripts/check-ai3d-delivery-policy.js'), 'CI executes hard delivery gate');
check(!/check-ai3d-delivery-policy\.js\s*\|\|\s*true/.test(ci), 'CI cannot ignore gate with || true');
check(!/continue-on-error:\s*true[\s\S]{0,160}check-ai3d-delivery-policy/.test(ci), 'gate cannot use continue-on-error');
check(ci.includes('AI3D Voxel City autoplay') || ci.includes('playwright test'), 'CI contains autoplay Playwright hard gate');
check(ci.includes('npx playwright test') || ci.includes('playwright'), 'CI executes Playwright autoplay');

// Default-city immutable autoplay requirements — must not rely on AI worker / serverless / GPU for generation
for (const rel of ['apps/ai3d-voxel-city/default-city.json','apps/ai3d-voxel-city/default-city.sha256','apps/ai3d-voxel-city/scene-delivery.json','e2e/ai3d-voxel-city-autoplay.spec.js','playwright.config.js']) check(fs.existsSync(path.join(root, rel)), `${rel} exists (autoplay)`);

const defaultCity = JSON.parse(fs.readFileSync(path.join(root,'apps/ai3d-voxel-city/default-city.json'),'utf8'));
check(Array.isArray(defaultCity.voxels) && defaultCity.voxels.length>0, `default-city voxels>0 (${defaultCity.voxels.length})`);
check(defaultCity.defaultCity?.immutable===true, 'default-city is immutable');
check(fs.readFileSync(path.join(root,'apps/ai3d-voxel-city/default-city.sha256'),'utf8').trim().length===64, 'default-city sha256 exists');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'apps/ai3d-voxel-city/scene-delivery.json'),'utf8'));
check(manifest.playable===true && manifest.walkable===true, 'scene-delivery manifest playable+walkable');
check(manifest.collisions===true && manifest.grounding===true && manifest.playerSpawn===true, 'scene-delivery manifest collisions+grounding+spawn');
check(manifest.controls?.includes('WASD') && manifest.controls?.includes('ARROW_KEYS'), 'scene-delivery manifest WASD+arrows');
check(manifest.defaultCity?.autoplay===true && manifest.defaultCity?.immutable===true, 'scene-delivery autoplay immutable');
check(manifest.heightfieldDominant===false && manifest.reliefDominant===false && manifest.billboardLike===false, 'scene-delivery not heightfield/relief/billboard');

const voxelClient = read('apps/ai3d-voxel-city/client.js');
check(voxelClient.includes('autoLoadDefaultCity'), 'Voxel City has autoplay autoLoadDefaultCity');
check(voxelClient.includes('./default-city.json'), 'autoplay fetches immutable default-city.json (not API)');
check(!/autoLoadDefaultCity[\s\S]*AI3D_WORKER_URL/.test(voxelClient), 'autoplay does not depend on AI3D_WORKER_URL');
check(voxelClient.includes('collidesAt') && voxelClient.includes('findGroundY'), 'client has collision + ground detection');
check(voxelClient.includes('playableMode') && voxelClient.includes('updatePlayer'), 'client has playable WASD+gravity controller');
check(voxelClient.includes('window.__AI3D_PLAYABLE_SCENE__'), 'client reports playable runtime');
check(voxelClient.includes('window.AI3DVoxelRuntime'), 'client exposes runtime for Playwright');

const playwright = read('e2e/ai3d-voxel-city-autoplay.spec.js');
check(playwright.includes('canvas not пуст') || playwright.includes('canvas'), 'Playwright checks canvas not empty');
check(playwright.includes('voxels') && playwright.includes('chunks') && playwright.includes('triangles'), 'Playwright checks voxels/chunks/triangles>0');
check(playwright.includes('spawn') || playwright.includes('playerSpawn'), 'Playwright checks spawn');
check(playwright.includes('KeyW') && playwright.includes('WASD'), 'Playwright checks WASD movement');
check(playwright.includes('collidesAt') || playwright.includes('collision'), 'Playwright checks collision');
check(playwright.includes('onGround') || playwright.includes('grounding'), 'Playwright checks gravity/ground');
check(playwright.includes('HTTP 200 alone is not proof') || playwright.includes('not proof'), 'Playwright asserts HTTP 200 not sufficient');

if (failed) { console.error('\nAI3D FINAL DELIVERY POLICY FAILED'); process.exit(1); }
console.log(`\nAI3D FINAL DELIVERY POLICY PASSED · STATUS=${status.status}`);
