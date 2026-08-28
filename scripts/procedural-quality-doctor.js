#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');const root=path.resolve(__dirname,'..'),fix=process.argv.includes('--fix'),maxRounds=12;
const required=[
'shared/procedural-quality-runtime.js','shared/procedural-quality-generic-renderer.js','shared/procedural-quality-deformation-velocity.js',
'shared/procedural-quality-temporal-artifacts.js','shared/procedural-quality-frame-pacing.js','shared/procedural-quality-resource-watchdog.js',
'shared/procedural-quality-thermal-governor.js','shared/procedural-quality-shader-prewarm.js','shared/procedural-quality-replay-benchmark.js',
'shared/procedural-quality-canary.js','lib/api-handlers/procedural-quality-profile.js','lib/api-handlers/procedural-quality-runtime-health.js','scripts/procedural-quality-evidence-orchestrator.js'
];
function read(p){return fs.existsSync(path.join(root,p))?fs.readFileSync(path.join(root,p),'utf8'):''}
function inspect(){
 const issues=[];for(const f of required)if(!fs.existsSync(path.join(root,f)))issues.push({code:'missing-file',file:f,repairable:false});
 const pkgp=path.join(root,'package.json');if(fs.existsSync(pkgp)){let pkg;try{pkg=JSON.parse(fs.readFileSync(pkgp,'utf8').replace(/^\uFEFF/,''))}catch(_){issues.push({code:'invalid-package-json',repairable:false});return issues}
  const scripts=pkg.scripts||{};for(const [k,v] of [['procedural:check','node scripts/procedural-quality-v10-gate.js'],['procedural:doctor','node scripts/procedural-quality-doctor.js --fix'],['procedural:evidence','node scripts/procedural-quality-evidence-orchestrator.js'],['procedural:canary','node scripts/procedural-quality-canary-gate.js']])if(scripts[k]!==v)issues.push({code:'script',key:k,want:v,repairable:true});
 }
 const rt=read('shared/procedural-quality-runtime.js');for(const m of ['10.0.0','WORLD_PROCEDURAL_QUALITY_DISABLED','temporalArtifacts','framePacing','resourceWatchdog','thermalGovernor','shaderPrewarm','replayBenchmark','canary'])if(rt&&!rt.includes(m))issues.push({code:'runtime-marker',marker:m,repairable:false});
 const inj=read('scripts/inject-procedural-quality-runtime.js');for(const m of ['procedural-quality-temporal-artifacts.js','procedural-quality-frame-pacing.js','procedural-quality-resource-watchdog.js','procedural-quality-thermal-governor.js','procedural-quality-shader-prewarm.js','procedural-quality-replay-benchmark.js','procedural-quality-canary.js'])if(inj&&!inj.includes(m))issues.push({code:'inject-missing',marker:m,repairable:false});
 const html=[];function walk(d){if(!fs.existsSync(d))return;for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(e.name.toLowerCase().endsWith('.html'))html.push(p)}}walk(path.join(root,'apps'));
 for(const p of html){const s=fs.readFileSync(p,'utf8'),n=(s.match(/procedural-quality-runtime\.js/g)||[]).length;if(n>1)issues.push({code:'duplicate-runtime',file:path.relative(root,p),count:n,repairable:true})}
 return issues;
}
function repair(issues){
 const repairs=[],pkgp=path.join(root,'package.json'),scriptIssues=issues.filter(x=>x.code==='script');
 if(scriptIssues.length&&fs.existsSync(pkgp)){const pkg=JSON.parse(fs.readFileSync(pkgp,'utf8').replace(/^\uFEFF/,''));pkg.scripts=pkg.scripts||{};for(const x of scriptIssues){pkg.scripts[x.key]=x.want;repairs.push({code:'script',key:x.key})}fs.writeFileSync(pkgp,JSON.stringify(pkg,null,2)+'\n')}
 for(const x of issues.filter(x=>x.code==='duplicate-runtime')){const p=path.join(root,x.file);let s=fs.readFileSync(p,'utf8'),seen=false;s=s.replace(/<script[^>]+src=["'][^"']*procedural-quality-runtime\.js[^"']*["'][^>]*><\/script>\s*/gi,m=>{if(seen)return'';seen=true;return m});fs.writeFileSync(p,s,'utf8');repairs.push({code:'duplicate-runtime',file:x.file})}
 return repairs;
}
function gate(){try{cp.execFileSync(process.execPath,['scripts/procedural-quality-v10-gate.js'],{cwd:root,stdio:'pipe'});return{pass:true}}catch(e){return{pass:false,error:String(e.stderr||e.message).slice(0,5000)}}}
let history=[],last='';
for(let round=1;round<=maxRounds;round++){
 let issues=inspect(),repairs=[];if(fix&&issues.some(x=>x.repairable))repairs=repair(issues);issues=inspect();const g=issues.length?{pass:false,error:'static issues remain'}:gate();history.push({round,issues,repairs,gate:g});console.log(JSON.stringify({round,issues:issues.length,repairs:repairs.length,gate:g.pass},null,2));
 if(!issues.length&&g.pass){fs.writeFileSync(path.join(root,'PROCEDURAL_QUALITY_DOCTOR.json'),JSON.stringify({version:10,status:'PASS',rounds:round,history},null,2)+'\n');console.log('PROCEDURAL QUALITY DOCTOR V10: PASS');process.exit(0)}
 const sig=JSON.stringify({issues:issues.map(x=>x.code+':'+(x.file||x.key||x.marker||'')),gate:g.error?.slice(0,700)});
 if(sig===last&&!issues.some(x=>x.repairable)){fs.writeFileSync(path.join(root,'PROCEDURAL_QUALITY_DOCTOR.json'),JSON.stringify({version:10,status:'BLOCKED',rounds:round,history},null,2)+'\n');console.error('DOCTOR BLOCKED: fix every reproducible unresolved error manually, add regression coverage, then rerun');process.exit(2)}last=sig;
}
fs.writeFileSync(path.join(root,'PROCEDURAL_QUALITY_DOCTOR.json'),JSON.stringify({version:10,status:'FAILED',history},null,2)+'\n');process.exit(3);
