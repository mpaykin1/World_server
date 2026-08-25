#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd(),BACKUP=process.env.QUALITY_V5_BACKUP_ROOT||'';
function backup(p){if(!BACKUP||!fs.existsSync(p))return;const rel=path.relative(ROOT,p),dst=path.join(BACKUP,rel);fs.mkdirSync(path.dirname(dst),{recursive:true});if(!fs.existsSync(dst))fs.copyFileSync(p,dst)}
function readJson(p){return JSON.parse(fs.readFileSync(p,'utf8'))}function writeJson(p,v){fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n')}
function certifiedApps(){try{const r=readJson(path.join(ROOT,'data','app-release-registry.json'));return Object.entries(r.apps||{}).filter(([,v])=>v.status==='certified'&&v.visible===true).map(([k])=>k)}catch(_){return[]}}
// Preserve unrelated Vercel settings and add only V5 functions.
const vp=path.join(ROOT,'vercel.json');backup(vp);const v=readJson(vp);v.functions=v.functions||{};
for(const[f,region]of Object.entries({'api/quality-probe-us.js':'iad1','api/quality-probe-eu.js':'fra1','api/quality-probe-ap.js':'sin1'}))v.functions[f]={...(v.functions[f]||{}),regions:[region],maxDuration:30};
for(const f of ['api/quality-rollout-config.js','api/quality-trace.js','api/quality-telemetry.js','api/quality-summary.js'])v.functions[f]={...(v.functions[f]||{}),maxDuration:30};writeJson(vp,v);
// Add convenience commands without removing existing scripts.
const pp=path.join(ROOT,'package.json');backup(pp);const pkg=readJson(pp);pkg.scripts=pkg.scripts||{};Object.assign(pkg.scripts,{
 'quality:v5:monitor':'node scripts/quiet-quality-autopilot.js','quality:v5:improve':'node scripts/quiet-quality-autopilot.js --apply','quality:v5:rum':'node scripts/quality-real-device-rum.js','quality:v5:geo':'node scripts/quality-geographic-device-gate.js','quality:v5:gpu':'node scripts/quality-mobile-gpu-profiler.js','quality:v5:otel':'node scripts/quality-otel-bridge-check.js','quality:v5:rollout':'node scripts/quality-progressive-rollout.js status'});writeJson(pp,pkg);
// Router must execute before telemetry so rollout metadata is attached to the same real session.
const router='<script src="/shared/quality-rollout-router.js"></script>',telemetry='<script src="/shared/quality-telemetry.js"></script>';
let appCount=0;for(const id of certifiedApps()){
  const p=path.join(ROOT,'apps',id,'index.html');if(!fs.existsSync(p))continue;backup(p);let s=fs.readFileSync(p,'utf8');if(s.includes('/shared/quality-rollout-router.js'))continue;
  if(s.includes(telemetry))s=s.replace(telemetry,router+'\n'+telemetry);else if(/<\/body>/i.test(s))s=s.replace(/<\/body>/i,router+'\n</body>');else throw new Error(`Cannot safely inject rollout router: ${p}`);fs.writeFileSync(p,s);appCount++;
}
// Keep future certified apps protected through the deterministic shared-runtime recipe.
const rp=path.join(ROOT,'data','autofix-recipes.json');if(fs.existsSync(rp)){backup(rp);const r=readJson(rp);for(const x of r.recipes||[])if(x.kind==='ensureHtmlIncludes'&&x.id==='golden-shared-runtime'){x.includes=x.includes||[];if(!x.includes.includes(router))x.includes.push(router)}writeJson(rp,r)}
// Wire AI3D HTTP + background job tracing only when exact stable anchors exist.
const sp=path.join(ROOT,'services','ai3d-worker','server.py');let ai3d='not-present';if(fs.existsSync(sp)){backup(sp);
  let s=fs.readFileSync(sp,'utf8');
  if(!s.includes('from quality_trace import QualityTraceMiddleware, trace_job')){const anchor='from ai3d.validation import ALLOWED_IMAGE_TYPES, verify_image\n';if(!s.includes(anchor))throw new Error('AI3D import anchor changed; refuse blind patch');s=s.replace(anchor,anchor+'from quality_trace import QualityTraceMiddleware, trace_job\n')}
  if(!s.includes('app.add_middleware(QualityTraceMiddleware)')){const anchor='app = FastAPI(title="World Server AI3D Worker", version="1.0.0")\n';if(!s.includes(anchor))throw new Error('AI3D app anchor changed; refuse blind patch');s=s.replace(anchor,anchor+'app.add_middleware(QualityTraceMiddleware)\n')}
  if(!s.includes('with trace_job("ai3d.job"')){const anchor='        result = runner.run(job, progress)';if(!s.includes(anchor))throw new Error('AI3D runner anchor changed; refuse blind patch');s=s.replace(anchor,'        with trace_job("ai3d.job", {"job.id": job_id, "mode": str(job.get("mode", ""))}):\n            result = runner.run(job, progress)')}
  fs.writeFileSync(sp,s);ai3d='wired';
  const ep=path.join(ROOT,'services','ai3d-worker','.env.example');if(fs.existsSync(ep)){backup(ep);let e=fs.readFileSync(ep,'utf8');for(const line of ['QUALITY_TRACE_ENDPOINT=https://world-server.vercel.app/api/quality-trace','QUALITY_TRACE_TOKEN=replace-with-runtime-secret'])if(!e.includes(line.split('=')[0]+'='))e+='\n'+line;fs.writeFileSync(ep,e.replace(/^\n+/,''))}
}

// Keep generated state/evidence out of source control.
const exclude=path.join(ROOT,'.git','info','exclude');if(fs.existsSync(exclude)){backup(exclude);let e=fs.readFileSync(exclude,'utf8');for(const x of ['.quality-autopilot-state/','QUIET_AUTOPILOT_REPORT.json','QUALITY_GEOGRAPHIC_DEVICE_REPORT.json','QUALITY_MOBILE_GPU_REPORT.json','QUALITY_OTEL_BRIDGE_REPORT.json','QUALITY_PROGRESSIVE_ROLLOUT_REPORT.json','QUALITY_V5_RUNTIME_VERIFY.json'])if(!e.split(/\r?\n/).includes(x))e+=(e.endsWith('\n')?'':'\n')+x+'\n';fs.writeFileSync(exclude,e)}
console.log(JSON.stringify({ok:true,schemaVersion:'5.0.0',certifiedRoutersInjected:appCount,ai3dTrace:ai3d,vercelFunctions:Object.keys(v.functions).filter(x=>x.includes('quality-')).length},null,2));
