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

if (failed) { console.error('\nAI3D FINAL DELIVERY POLICY FAILED'); process.exit(1); }
console.log(`\nAI3D FINAL DELIVERY POLICY PASSED · STATUS=${status.status}`);
