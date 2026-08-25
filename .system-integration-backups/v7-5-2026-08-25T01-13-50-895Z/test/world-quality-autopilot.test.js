'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {enhanceVoxelWorld,frontProjection,sameFrontProjection}=require('../lib/world-quality-voxel-enhancer');
const {semanticDetailIndex}=require('../lib/world-quality-semantic-detail');
const {profileColor,buildMaterialProfiles}=require('../lib/world-quality-material-profiler');
const {synthesizePbrProfiles,estimateTextureBudget}=require('../lib/world-quality-pbr-synthesizer');
const {computeReadiness,weightedScore}=require('../scripts/world-quality-analyzer');

function sampleWorld(){const v=[];for(let x=0;x<16;x++)v.push([x,0,0,0]);for(let y=1;y<11;y++)for(let x=1;x<15;x++){const window=(y===3||y===6)&&(x===3||x===6||x===9||x===12),c=window?1:0,z=4-(x%5===0?1:0);v.push([x,y,z,c],[x,y,z-1,c])}for(let y=11;y<15;y++)for(let x=6+(y-11);x<=9-(y-11);x++)v.push([x,y,4,2]);return{source:{width:16,height:15},palette:[0x40363a,0xffb45f,0x5a2635,0x222222],voxels:v,performance:{},stats:{logicalVoxels:v.length}}}

test('V5 semantic detail index detects architectural motifs',()=>{const w=sampleWorld(),idx=semanticDetailIndex(w.voxels,w.palette);assert.ok(idx.stats.cells>100);assert.ok(idx.stats.roof>0);assert.ok(idx.stats.windowLike>0);assert.ok(idx.stats.verticalEdge>0);assert.ok(idx.stats.highSaliency>0)});
test('V5 deterministic enhancement preserves exact front projection',()=>{const a=sampleWorld(),b=sampleWorld(),before=[...frontProjection(a.voxels).entries()],opt={seed:42,policy:{maxAddedVoxelRatio:.45,maxAddedVoxelAbsolute:9999,edgeDensity:1,edgeThreshold:.02}};enhanceVoxelWorld(a,opt);enhanceVoxelWorld(b,opt);assert.deepEqual(a.voxels,b.voxels);assert.deepEqual([...frontProjection(a.voxels).entries()],before);assert.equal(a.qualityAutopilot.version,'5.0.0');assert.equal(a.qualityAutopilot.frontProjectionPreserved,true);assert.ok(a.materialProfiles.length===a.palette.length);assert.ok(a.pbrProfiles.length===a.palette.length)});
test('V5 geometry budget remains strict',()=>{const w=sampleWorld(),n=w.voxels.length;enhanceVoxelWorld(w,{seed:1,policy:{maxAddedVoxelRatio:.06,maxAddedVoxelAbsolute:9999,edgeDensity:1,edgeThreshold:.02}});assert.ok(w.voxels.length-n<=Math.floor(n*.06));assert.equal(sameFrontProjection(sampleWorld().voxels,w.voxels),true)});
test('material profiler classifies emissive and metal-like colors',()=>{const warm=profileColor(0xffb45f),dark=profileColor(0x222222),p=buildMaterialProfiles([0xffb45f,0x222222]);assert.equal(warm.materialClass,'emissive');assert.equal(dark.materialClass,'metal');assert.ok(warm.emissiveIntensity>0);assert.ok(dark.metalness>.5);assert.equal(p.length,2)});
test('V5 procedural PBR synthesis is deterministic and budgeted',()=>{const base=buildMaterialProfiles([0xffb45f,0x222222,0x40363a]),a=synthesizePbrProfiles(base,{seed:7}),b=synthesizePbrProfiles(base,{seed:7});assert.deepEqual(a,b);assert.equal(a.length,3);assert.ok(a.every(x=>x.candidateId&&x.destructiveTextureBake===false));const safe=estimateTextureBudget(a,'SAFE'),ultra=estimateTextureBudget(a,'ULTRA');assert.ok(ultra.virtualMegapixels>safe.virtualMegapixels)});
test('runtime V5 exposes pressure, texture and occlusion hooks',()=>{const src=fs.readFileSync(path.join(__dirname,'../shared/world-quality-autopilot.js'),'utf8');for(const token of["version:'5.0.0'",'PerformanceObserver','deviceMemory','hardwareConcurrency','textureBudgetScale','occlusionHz','thermalProxy','registerMaterialAdapter','registerSceneBudgetAdapter'])assert.ok(src.includes(token),token)});
test('V5 retarget contract contains root motion and two-hand constraints',()=>{const src=fs.readFileSync(path.join(__dirname,'../scripts/world-retarget-contract.js'),'utf8');assert.ok(src.includes('rootMotionDirection'));assert.ok(src.includes('twoHandWeapon'));assert.ok(src.includes('LeftFoot'));assert.ok(src.includes('RightHand'))});
test('V5 visibility optimizer is conservative',()=>{const src=fs.readFileSync(path.join(__dirname,'../scripts/world-visibility-optimizer.js'),'utf8');for(const token of['neverCullNearPlayer','neverCullHeroLandmarkByHeuristic','temporalHysteresis','frustumFallback'])assert.ok(src.includes(token))});
test('V5 candidate lab is prediction only before promotion',()=>{const src=fs.readFileSync(path.join(__dirname,'../scripts/world-candidate-lab.js'),'utf8');assert.ok(src.includes('mutationAllowed:false'));assert.ok(src.includes('winnerOnly:true'));assert.ok(src.includes('candidate tournament'))});
test('V5 feedback learner cannot mutate directly',()=>{const src=fs.readFileSync(path.join(__dirname,'../scripts/world-feedback-learner.js'),'utf8');assert.ok(src.includes('automaticMutation:false'));assert.ok(src.includes('candidate tournament'))});
test('baseline promotion remains explicit and cannot self-approve',()=>{const src=fs.readFileSync(path.join(__dirname,'../scripts/world-visual-baseline-promote.js'),'utf8');assert.ok(src.includes('--approve'));assert.ok(src.includes('Refusing baseline mutation on master/main'))});
test('weighted readiness remains evidence based',()=>{const d={detail:[{weight:3,ok:true},{weight:1,ok:false}],graphics:[{weight:1,ok:true}]};assert.equal(weightedScore(d.detail),75);assert.equal(computeReadiness(d,{detail:.5,graphics:.5}).overall,88)});

const {detailBudget,allocateDetail}=require('../lib/world-quality-detail-budget');
const {recipe,validateBakeEvidence}=require('../lib/world-quality-texture-baker-contract');
const {topologyFromChunkIds,prioritize}=require('../scripts/world-streaming-topology');
const {auditText}=require('../scripts/world-shader-cost-auditor');
const {animationLod}=require('../scripts/world-animation-lod-controller');
const {hashReplay,CASES}=require('../scripts/world-deterministic-replay');
const {assess}=require('../scripts/world-multiview-visual-gate');
const {evaluate}=require('../scripts/world-quality-slo');
const {compare}=require('../scripts/world-quality-causality');
const {plan}=require('../scripts/world-canary-release');

test('V5 importance budget protects hero landmarks and reacts to pressure',()=>{const hero=detailBudget({importance:.8,distance:10,hero:true}),pressured=detailBudget({importance:.8,distance:10,hero:false,pressure:1});assert.equal(hero.protected,true);assert.ok(hero.score>pressured.score);const a=allocateDetail([{importance:1,hero:true},{importance:.2,distance:60}],{totalBudget:1});assert.ok(a[0].budget.share>a[1].budget.share)});
test('V5 texture baker contract is deterministic and non-destructive',()=>{const a=recipe({materialClass:'stone'},{seed:2,sourceHash:'abc'}),b=recipe({materialClass:'stone'},{seed:2,sourceHash:'abc'});assert.deepEqual(a,b);assert.equal(a.destructive,false);assert.equal(a.requiresApproval,true);assert.equal(validateBakeEvidence({sourceHash:'a',outputHash:'b',baseColor:1,normal:1,roughness:1,ao:1,emissive:1}).ok,true)});
test('V5 streaming topology prioritizes hero and neighbors',()=>{const n=topologyFromChunkIds(['0,0,0','1,0,0','2,0,0']);assert.equal(n[1].degree,2);const p=prioritize(n,'0,0,0',['2,0,0']);assert.equal(p[0].id,'2,0,0');assert.equal(p[0].hero,true)});
test('V5 shader auditor penalizes expensive paths',()=>{const cheap=auditText('new THREE.MeshBasicMaterial({})'),exp=auditText('shadowMap.enabled=true; transparent:true; THREE.DoubleSide; new THREE.MeshStandardMaterial(); new EffectComposer()');assert.ok(exp.cost>cheap.cost)});
test('V5 animation LOD keeps hero animation floor',()=>{assert.ok(animationLod(100,{hero:true}).hz>=45);assert.ok(animationLod(100,{hero:false}).hz<45);assert.equal(animationLod(50,{mobile:true,pressure:1}).poseCache,true)});
test('V5 deterministic replay contract is stable',()=>{assert.ok(CASES.includes('mobile_move_plus_look'));assert.equal(hashReplay({a:1}),hashReplay({a:1}));assert.notEqual(hashReplay({a:1}),hashReplay({a:2}))});
test('V5 multiview visual gate never treats partial baselines as complete',()=>{assert.equal(assess({approvedBaselines:[{view:'desktop-front'}]}).complete,false);assert.equal(assess({approvedBaselines:['x']}).selfApprovalForbidden,true)});
test('V5 quality SLO catches p95 regression',()=>{assert.equal(evaluate({fps:60,frameP95Ms:20,errorRate:0,crashFree:1}).healthy,true);assert.equal(evaluate({fps:60,frameP95Ms:70,errorRate:0,crashFree:1}).healthy,false)});
test('V5 causality guard rejects any regression',()=>{const r=compare({visual:90,fps:50,controls:1},{visual:92,fps:49,controls:1});assert.equal(r.winner,false);assert.ok(r.regressions.includes('fps'));assert.equal(r.mutationAllowed,false)});
test('V5 canary release never auto-merges or writes master',()=>{const p=plan();assert.equal(p.autoMerge,false);assert.equal(p.masterWrite,false);assert.ok(p.stages.length>=4);assert.ok(p.rollbackOn.includes('mobile_touch_regression'))});
test('runtime V5 exposes replay and SLO adapters',()=>{const src=fs.readFileSync(path.join(__dirname,'../shared/world-quality-autopilot.js'),'utf8');assert.ok(src.includes('registerReplayAdapter'));assert.ok(src.includes('registerSloAdapter'));assert.ok(src.includes('deterministicReplay:true'));assert.ok(src.includes('qualitySlo:true'))});

const {normalizeDeclared}=require('../scripts/world-graphics-technology-scout');
const {integrate}=require('../scripts/world-graphics-technology-integrator');
const {classifyEvidence}=require('../scripts/world-evidence-provenance-guard');
const {route}=require('../scripts/world-graphics-quality-router');
const {humanApproved}=require('../scripts/world-multiview-visual-gate');
const {synthetic}=require('../scripts/world-animation-semantic-validator');

test('V6 graphics technology aliases normalize server audit names',()=>{
  assert.equal(normalizeDeclared('Three.js/WebGL2'),'three-webgl2');
  assert.equal(normalizeDeclared('Godot 4.7.1'),'godot');
  assert.equal(normalizeDeclared('Goo Engine'),'goo-engine');
  assert.equal(normalizeDeclared('UPBGE'),'upbge');
});

test('V6 technology integrator requires both detail and optimization adapters',()=>{
  const registry={adapters:{godot:{detail:['multimesh-detail'],optimization:['lod'],gpuOptional:true}}};
  const ok=integrate({technologies:[{id:'godot',status:'runtime-detected',runtimeReady:true}]},registry);
  assert.equal(ok.connectivityPercent,100);assert.equal(ok.hardGateReady,true);assert.equal(ok.routes[0].detailAdapter.length,1);assert.equal(ok.routes[0].optimizationAdapter.length,1);
  const bad=integrate({technologies:[{id:'package:mystery-renderer',status:'runtime-package',runtimeReady:true}]},{adapters:{}});
  assert.equal(bad.hardGateReady,false);assert.equal(bad.blockers[0].reason,'generic-adapter-needs-review');
});

test('V6 adapter registry covers major current and planned graphics technologies',()=>{
  const registry=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/world-graphics-technology-adapters.json'),'utf8'));
  for(const id of ['three-webgl2','godot','blender','cpu-reconstruction','depth-anything','instantmesh','trellis2','hunyuan3d','voxel-greedy','goo-engine','upbge','unirig','rigify','mpfb','world-quality']){
    const a=registry.adapters[id];assert.ok(a,`missing ${id}`);assert.ok(a.detail.length>0,`${id} detail`);assert.ok(a.optimization.length>0,`${id} optimization`);
  }
});

test('V6 evidence provenance never promotes synthetic proof to production proof',()=>{
  assert.equal(classifyEvidence({source:'local-test-synthetic'}),'synthetic');
  assert.equal(classifyEvidence({provider:'physical-ios-phone real-device'}),'physical');
  assert.equal(humanApproved({approval:'auto-verified-front-exact',path:'test/fixtures/cube_object.png'}),false);
  assert.equal(humanApproved({approval:'user-approved',view:'desktop-front'}),true);
  assert.equal(synthetic({source:'local-test-synthetic'}),true);
  assert.equal(synthetic({source:'godot-runtime-production'}),false);
});

test('V6 graphics router prefers CPU-safe routes and keeps GPU routes optional',()=>{
  const out=route({hardGateReady:true,routes:[
    {technology:'three-webgl2',runtimeReady:true,productionReady:true,cpuSafe:true,detailAdapter:['d'],optimizationAdapter:['o']},
    {technology:'trellis2',runtimeReady:true,productionReady:true,cpuSafe:false,detailAdapter:['d'],optimizationAdapter:['o']}
  ]},{readinessPercent:100});
  assert.equal(out.defaultPolicy,'CPU_FIRST_FREE_LOCAL');assert.equal(out.routes[0].technology,'three-webgl2');assert.ok(out.gpuRoutesOptional.includes('trellis2'));
});

test('V6 orchestrator scans graphics technology before quality mutation stages',()=>{
  const src=fs.readFileSync(path.join(__dirname,'../scripts/world-quality-autopilot.js'),'utf8');
  const scout=src.indexOf('world-graphics-technology-scout.js'),semantic=src.indexOf('world-semantic-detail-indexer.js');
  assert.ok(scout>=0&&semantic>=0&&scout<semantic);assert.ok(src.includes('world-technology-drift-gate.js'));assert.ok(src.includes('world-evidence-provenance-guard.js'));
});

test('V6 policy makes technology scan and dual adapters hard gates',()=>{
  const policy=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/world-quality-autopilot.json'),'utf8'));
  assert.equal(policy.hardGates.scanGraphicsTechnologiesBeforeEveryCycle,true);
  assert.equal(policy.hardGates.requireDetailAndOptimizationAdapterForEveryRuntimeGraphicsTechnology,true);
  assert.equal(policy.hardGates.syntheticEvidenceCannotUnlockProduction100,true);
  assert.equal(policy.optimization.cpuFirstGraphicsOptimization,true);
  assert.equal(policy.optimization.paidGpuRequired,false);
});

const {detect:detectTechnologyCandidates}=require('../scripts/world-technology-candidate-intake');

test('V6 candidate branch intake never promotes branch names to runtime evidence',()=>{
  const r=detectTechnologyCandidates(['origin/master','origin/ai/desktop/hunyuan-full-quality-v3','origin/feature/auth']);
  assert.equal(r.candidates.length,1);
  assert.equal(r.candidates[0].runtimeReady,false);
  assert.equal(r.candidates[0].requiresCheckoutAndTechnologyScout,true);
});

test('V6 runtime resilience audit detects CDN paths without silently changing versions',()=>{
  const src=fs.readFileSync(path.join(__dirname,'../scripts/world-runtime-dependency-resilience.js'),'utf8');
  assert.ok(src.includes('unpkg\\.com'));
  assert.ok(src.includes('vendor-three-locally'));
  assert.ok(src.includes('do not silently change runtime library version'));
  const orchestrator=fs.readFileSync(path.join(__dirname,'../scripts/world-quality-autopilot.js'),'utf8');
  assert.ok(orchestrator.indexOf('world-runtime-dependency-resilience.js')<orchestrator.indexOf('world-semantic-detail-indexer.js'));
});
