#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const ROOT=process.cwd(),strict=process.argv.includes('--strict');
const failures=[],warnings=[],reports={};
const req=[
 'data/cinematic-voxel-quality-policy.json','shared/cinematic-voxel-quality-guard.js','shared/cinematic-visibility-supervisor.js',
 'shared/cinematic-temporal-quality-governor.js','shared/cinematic-scene-adapter-contract.js','scripts/cinematic-reference-score.py',
 'scripts/cinematic-ml-score.py','scripts/cinematic-depth-regression.py','scripts/cinematic-asset-pipeline.js','reference/cinematic_eye_fire_reference.png'
];
for(const f of req)if(!fs.existsSync(path.join(ROOT,f)))failures.push(`missing:${f}`);
let p={};try{p=JSON.parse(fs.readFileSync(path.join(ROOT,'data/cinematic-voxel-quality-policy.json'),'utf8'))}catch(e){failures.push('policy:'+e.message)}
if(!p.principles?.primitivePrototypeCannotShip)failures.push('primitive-block-disabled');
if(!p.principles?.qualityCannotIncreaseWithoutEvidence)failures.push('evidence-loop-disabled');
const candidate=process.env.CINEMATIC_CANDIDATE||path.join(ROOT,'artifacts/cinematic/voxel-world-desktop.png');
const ref=path.join(ROOT,'reference/cinematic_eye_fire_reference.png');
const py=process.env.PYTHON||process.env.PYTHON3||(process.platform==='win32'?'python':'python3');
function run(name,args,out){const r=cp.spawnSync(args[0],args.slice(1),{stdio:'inherit'});if(out&&fs.existsSync(out))try{reports[name]=JSON.parse(fs.readFileSync(out,'utf8'))}catch{};if(r.status!==0)failures.push(`${name}-failed`)}
if(fs.existsSync(candidate)&&fs.existsSync(ref)){
 const ml=path.join(ROOT,'CINEMATIC_ML_REPORT.json');run('perceptual',[py,path.join(ROOT,'scripts/cinematic-ml-score.py'),'--reference',ref,'--candidate',candidate,'--out',ml,...(strict?['--strict']:[])],ml);
 const dp=path.join(ROOT,'CINEMATIC_DEPTH_REPORT.json');run('depth',[py,path.join(ROOT,'scripts/cinematic-depth-regression.py'),'--reference',ref,'--candidate',candidate,'--out',dp,...(strict?['--strict']:[])],dp);
}else{const m='runtime-candidate-missing:'+path.relative(ROOT,candidate);(strict?failures:warnings).push(m)}
const ap=cp.spawnSync(process.execPath,[path.join(ROOT,'scripts/cinematic-asset-pipeline.js')],{stdio:'inherit'});if(ap.status!==0)warnings.push('asset-pipeline-audit-failed');
const report={generatedAt:new Date().toISOString(),strict,pass:failures.length===0,failures,warnings,reports,candidate:path.relative(ROOT,candidate)};
fs.writeFileSync(path.join(ROOT,'CINEMATIC_V3_QUALITY_REPORT.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[CINEMATIC_V3] ${report.pass?'PASS':'FAIL'} failures=${failures.length} warnings=${warnings.length}`);if(failures.length)process.exit(15);
