'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const policy=JSON.parse(fs.readFileSync(path.join(ROOT,'data/cinematic-voxel-quality-policy.json'),'utf8'));
test('primitive prototype is explicitly blocked',()=>assert.equal(policy.principles.primitivePrototypeCannotShip,true));
test('existing quality systems are reused',()=>{
 assert.equal(policy.principles.reuseExistingWorldQualityAutopilot,true);
 assert.equal(policy.principles.reuseExistingGoldenPerformanceAutotuner,true);
 assert.equal(policy.principles.reuseExistingQualityTelemetry,true);
});
test('quality targets are production-grade',()=>{
 for(const [k,v] of Object.entries(policy.targetScores))if(k!=='stretchTarget')assert.ok(v>=95,`${k}=${v}`);
 assert.equal(policy.targetScores.stretchTarget,100);
});
test('near hero quality is protected before resolution degradation',()=>{
 const order=policy.optimizationOrder; assert.ok(order.indexOf('near_hero_geometry_last')>order.indexOf('render_resolution'));
});
