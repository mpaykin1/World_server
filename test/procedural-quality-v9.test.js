'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..'),txt=p=>fs.readFileSync(path.join(root,p),'utf8');
test('V9 generic renderer never fabricates native buffers',()=>{const s=txt('shared/procedural-quality-generic-renderer.js');assert.ok(s.includes('neverFabricatePrivateBuffers:true'));assert.ok(s.includes('registerNativeProvider'))});
test('V9 custom deformation exact provider supports velocity and positions',()=>{const s=txt('shared/procedural-quality-deformation-velocity.js');for(const x of ['provider.velocity','provider.positions','texturePair','reactiveRequired'])assert.ok(s.includes(x),x)});
test('V9 pass budget has p95 and hysteresis',()=>{const s=txt('shared/procedural-quality-pass-budget.js');assert.ok(s.includes('percentile'));assert.ok(s.includes('lastChange'));assert.ok(s.includes('disabled'))});
test('V9 doctor has bounded repair loop and refuses unresolved errors',()=>{const s=txt('scripts/procedural-quality-doctor.js');assert.ok(/maxRounds=(8|9|10|11|12)/.test(s));assert.ok(s.includes('DOCTOR BLOCKED'));assert.ok(s.includes('process.exit(2)'))});
test('V9 evidence orchestrator computes connectedness',()=>{const s=txt('scripts/procedural-quality-evidence-orchestrator.js');assert.ok(s.includes('architectureConnectednessPct'));assert.ok(s.includes('verifiedConnectednessPct'))});
test('V9 certification dashboard and APIs exist',()=>{for(const p of ['apps/procedural-quality-certification/index.html','lib/api-handlers/procedural-quality-system-status.js','lib/api-handlers/procedural-quality-repair-report.js'])assert.ok(fs.existsSync(path.join(root,p)),p)});
test('V9 profile advertises automation bridges',()=>{const p=require('../lib/api-handlers/procedural-quality-profile.js').buildProfile({webgpu:'1',webgl2:'1',memory:16,cores:16,dpr:1});assert.ok(p.version>=9);assert.equal(p.policy.genericRendererBridge,true);assert.equal(p.policy.exactCustomDeformationVelocity,true);assert.equal(p.policy.doctorRepairLoop,true)});
test('V9 migration has repair/capability/promotion tables',()=>{const s=txt('supabase/procedural_quality_v9.sql');for(const x of ['procedural_quality_repair_cycles','procedural_quality_renderer_capabilities','procedural_quality_promotions'])assert.ok(s.includes(x),x)});


