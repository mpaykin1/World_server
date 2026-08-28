#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const ROOT=process.cwd();
const args=new Set(process.argv.slice(2));
const strict=args.has('--strict');
const policyPath=path.join(ROOT,'data/cinematic-voxel-quality-policy.json');
const required=[
  'shared/world-quality-autopilot.js','shared/golden-performance-autotuner.js','shared/quality-telemetry.js',
  'shared/cinematic-voxel-quality-guard.js','data/visual-quality-policy.json','data/visual-baselines.json',
  'reference/cinematic_eye_fire_reference.png','scripts/cinematic-reference-score.py','e2e/cinematic-voxel-quality.spec.js'
];
const failures=[],warnings=[];
for(const rel of required) if(!fs.existsSync(path.join(ROOT,rel))) failures.push(`missing:${rel}`);
let policy=null,pkg=null;
try{policy=JSON.parse(fs.readFileSync(policyPath,'utf8'))}catch(e){failures.push('invalid-policy:'+e.message)}
try{pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'))}catch(e){failures.push('invalid-package:'+e.message)}
if(policy){
  const t=policy.targetScores||{},h=policy.hardFloors||{};
  for(const k of ['composition','voxelStyle','geometryDetail','lighting','fogAtmosphere','depth','eyeQuality','fireQuality','ui','cinematic']){
    if(Number(t[k]||0)<95)failures.push(`target-too-low:${k}`);
    if(Number(h[k]||0)<80)failures.push(`floor-too-low:${k}`);
  }
  if(!policy.principles?.primitivePrototypeCannotShip)failures.push('primitive-prototype-not-blocked');
  if(!policy.principles?.reuseExistingWorldQualityAutopilot)failures.push('must-reuse-world-quality-autopilot');
  if(!policy.principles?.goldenFrameRegressionRequired)failures.push('golden-frame-required');
}
if(pkg){
  if(!pkg.scripts?.['quality:cinematic'])failures.push('missing-package-script:quality:cinematic');
  if(!pkg.scripts?.['quality:cinematic:strict'])failures.push('missing-package-script:quality:cinematic:strict');
  if(!String(pkg.scripts?.['release:gate']||'').includes('quality:cinematic'))warnings.push('release-gate-does-not-run-cinematic-gate');
}
const candidate=process.env.CINEMATIC_CANDIDATE||path.join(ROOT,'artifacts/cinematic/voxel-world-desktop.png');
let referenceReport=null;
if(fs.existsSync(candidate)&&fs.existsSync(path.join(ROOT,'reference/cinematic_eye_fire_reference.png'))){
  const py=process.env.PYTHON||process.env.PYTHON3||(process.platform==='win32'?'python':'python3');
  const out=path.join(ROOT,'CINEMATIC_REFERENCE_REPORT.json');
  const r=cp.spawnSync(py,[path.join(ROOT,'scripts/cinematic-reference-score.py'),'--reference',path.join(ROOT,'reference/cinematic_eye_fire_reference.png'),'--candidate',candidate,'--policy',policyPath,'--require-ui','--out',out],{stdio:'inherit'});
  if(fs.existsSync(out))try{referenceReport=JSON.parse(fs.readFileSync(out,'utf8'))}catch{}
  if(r.status!==0)failures.push('reference-proxy-failed');
}else{
  const msg=`runtime-candidate-missing:${path.relative(ROOT,candidate)}`;
  if(strict)failures.push(msg); else warnings.push(msg);
}
const report={generatedAt:new Date().toISOString(),strict,pass:failures.length===0,failures,warnings,referenceReport,candidate:path.relative(ROOT,candidate)};
fs.writeFileSync(path.join(ROOT,'CINEMATIC_VOXEL_QUALITY_REPORT.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[CINEMATIC_VOXEL_GUARD] ${report.pass?'PASS':'FAIL'} failures=${failures.length} warnings=${warnings.length}`);
if(failures.length)process.exit(10);
