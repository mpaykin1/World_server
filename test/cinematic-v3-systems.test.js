'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const policy=JSON.parse(fs.readFileSync(path.join(ROOT,'data/cinematic-voxel-quality-policy.json'),'utf8'));
test('V3 requires depth and multi-angle evidence',()=>{assert.equal(policy.principles.depthRegressionRequiredForCinematicScenes,true);assert.equal(policy.principles.multiAngleGoldenRegressionRequired,true)});
test('V3 keeps CPU fallback mandatory',()=>assert.equal(policy.principles.cpuFallbackMandatory,true));
test('V3 protects hero quality and optimizes near hero last',()=>{const o=policy.optimizationOrder;assert.ok(o.indexOf('near_hero_geometry_last')>o.indexOf('render_resolution'));assert.ok(policy.performance.nearHeroResolutionFloor>=.75)});
test('V3 semantic perceptual stack has safe fallback',()=>{assert.equal(policy.semanticPerceptual.fallback,'multiscale-structure-color-entropy');assert.equal(policy.semanticPerceptual.cpuFallbackMandatory,true)});
test('V3 evidence cannot claim improvement without proof',()=>assert.equal(policy.principles.qualityCannotIncreaseWithoutEvidence,true));
for(const f of ['shared/cinematic-visibility-supervisor.js','shared/cinematic-temporal-quality-governor.js','shared/cinematic-scene-adapter-contract.js','scripts/cinematic-ml-score.py','scripts/cinematic-depth-regression.py','scripts/cinematic-asset-pipeline.js'])test(`required V3 file ${f}`,()=>assert.ok(fs.existsSync(path.join(ROOT,f))));
test('primitive graphics failure has permanent regression signature',()=>{
 const reg=JSON.parse(fs.readFileSync(path.join(ROOT,'data/cinematic-voxel-regression-signatures.json'),'utf8'));
 assert.ok(reg.signatures.some(x=>x.id==='primitive-flat-voxel-scene'&&x.severity==='release-blocker'));
});
