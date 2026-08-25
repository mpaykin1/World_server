#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd(),BACKUP=process.env.QUALITY_V6_BACKUP_ROOT||'';
function backup(p){if(!BACKUP||!fs.existsSync(p))return;const rel=path.relative(ROOT,p),dst=path.join(BACKUP,rel);fs.mkdirSync(path.dirname(dst),{recursive:true});if(!fs.existsSync(dst))fs.copyFileSync(p,dst)}
function readJson(p){return JSON.parse(fs.readFileSync(p,'utf8'))}function writeJson(p,v){fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n')}
function certifiedApps(){try{const r=readJson(path.join(ROOT,'data','app-release-registry.json'));return Object.entries(r.apps||{}).filter(([,v])=>v.status==='certified'&&v.visible===true).map(([k])=>k)}catch(_){return[]}}
const vp=path.join(ROOT,'vercel.json');backup(vp);const v=readJson(vp);v.functions=v.functions||{};
for(const[f,region]of Object.entries({'api/quality-probe-us.js':'iad1','api/quality-probe-eu.js':'fra1','api/quality-probe-ap.js':'sin1'}))v.functions[f]={...(v.functions[f]||{}),regions:[region],maxDuration:30};
for(const f of ['api/quality-rollout-config.js','api/quality-trace.js','api/quality-telemetry.js','api/quality-summary.js'])v.functions[f]={...(v.functions[f]||{}),maxDuration:30};writeJson(vp,v);

const pp=path.join(ROOT,'package.json');backup(pp);const pkg=readJson(pp);pkg.scripts=pkg.scripts||{};Object.assign(pkg.scripts,{
 'quality:v6:monitor':'node scripts/quiet-quality-autopilot.js',
 'quality:v6:improve':'node scripts/quiet-quality-autopilot.js --apply',
 'quality:v6:visual':'node scripts/quality-real-device-visual-oracle.js',
 'quality:v6:renderer':'node scripts/quality-renderer-tuner-gate.js',
 'quality:v6:trace-opt':'node scripts/quality-trace-critical-path-optimizer.js',
 'quality:v6:chaos':'node scripts/quality-chaos-failover.js',
 'quality:v6:rollout':'node scripts/quality-progressive-rollout.js status'
});writeJson(pp,pkg);

const tags=[
 '<script src="/shared/quality-rollout-router.js"></script>',
 '<script src="/shared/quality-renderer-tuner.js"></script>',
 '<script src="/shared/quality-visual-oracle.js"></script>',
 '<script src="/shared/quality-telemetry.js"></script>'
];
let appCount=0;
for(const id of certifiedApps()){
  const p=path.join(ROOT,'apps',id,'index.html');if(!fs.existsSync(p))continue;backup(p);let s=fs.readFileSync(p,'utf8'),changed=false;
  const telemetry=tags[3];
  const missing=tags.filter(t=>!s.includes(t));
  if(!missing.length)continue;
  if(s.includes(telemetry)){
    const before=missing.filter(t=>t!==telemetry).join('\n');
    if(before){s=s.replace(telemetry,before+'\n'+telemetry);changed=true}
  }else if(/<\/body>/i.test(s)){s=s.replace(/<\/body>/i,missing.join('\n')+'\n</body>');changed=true}
  else throw new Error(`Cannot safely inject V6 quality runtime: ${p}`);
  if(changed){fs.writeFileSync(p,s);appCount++}
}
const rp=path.join(ROOT,'data','autofix-recipes.json');
if(fs.existsSync(rp)){backup(rp);const r=readJson(rp);for(const x of r.recipes||[])if(x.kind==='ensureHtmlIncludes'&&x.id==='golden-shared-runtime'){x.includes=x.includes||[];for(const t of tags)if(!x.includes.includes(t))x.includes.push(t)}writeJson(rp,r)}

const sp=path.join(ROOT,'services','ai3d-worker','server.py');let ai3d='not-present';
if(fs.existsSync(sp)){backup(sp);let s=fs.readFileSync(sp,'utf8');
  if(!s.includes('from quality_trace import QualityTraceMiddleware, trace_job')){const anchor='from ai3d.validation import ALLOWED_IMAGE_TYPES, verify_image\n';if(!s.includes(anchor))throw new Error('AI3D import anchor changed; refuse blind patch');s=s.replace(anchor,anchor+'from quality_trace import QualityTraceMiddleware, trace_job\n')}
  if(!s.includes('app.add_middleware(QualityTraceMiddleware)')){const anchor='app = FastAPI(title="World Server AI3D Worker", version="1.0.0")\n';if(!s.includes(anchor))throw new Error('AI3D app anchor changed; refuse blind patch');s=s.replace(anchor,anchor+'app.add_middleware(QualityTraceMiddleware)\n')}
  if(!s.includes('with trace_job("ai3d.job"')){const anchor='        result = runner.run(job, progress)';if(!s.includes(anchor))throw new Error('AI3D runner anchor changed; refuse blind patch');s=s.replace(anchor,'        with trace_job("ai3d.job", {"job.id": job_id, "mode": str(job.get("mode", ""))}):\n            result = runner.run(job, progress)')}
  fs.writeFileSync(sp,s);ai3d='wired';
}
const exclude=path.join(ROOT,'.git','info','exclude');
if(fs.existsSync(exclude)){backup(exclude);let e=fs.readFileSync(exclude,'utf8');for(const x of ['.quality-autopilot-state/','QUIET_AUTOPILOT_REPORT.json','QUALITY_REAL_DEVICE_VISUAL_ORACLE.json','QUALITY_RENDERER_TUNER_REPORT.json','QUALITY_TRACE_OPTIMIZER_REPORT.json','QUALITY_CHAOS_FAILOVER_REPORT.json','QUALITY_V6_RUNTIME_VERIFY.json'])if(!e.split(/\r?\n/).includes(x))e+=(e.endsWith('\n')?'':'\n')+x+'\n';fs.writeFileSync(exclude,e)}
console.log(JSON.stringify({ok:true,schemaVersion:'6.0.0',certifiedAppsUpdated:appCount,ai3dTrace:ai3d,qualityRuntime:tags},null,2));
