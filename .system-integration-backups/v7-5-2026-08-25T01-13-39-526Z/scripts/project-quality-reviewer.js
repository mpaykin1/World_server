#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd(),read=r=>fs.readFileSync(path.join(ROOT,r),'utf8'),load=r=>JSON.parse(read(r));
const findings=[];
const add=(severity,category,file,message)=>findings.push({severity,category,file,message});
const registry=load('data/app-release-registry.json');
const ui=load('data/ui-policy.json');
const tech=load('data/technology-registry.json');

for(const [id,meta] of Object.entries(registry.apps||{})){
  if(meta.status!=='certified'||meta.visible!==true) continue;
  const htmlPath=`apps/${id}/index.html`;
  if(!fs.existsSync(path.join(ROOT,htmlPath))){add('blocker','release',htmlPath,'certified app index missing');continue;}
  const html=read(htmlPath);
  if(!html.includes('/shared/golden-ui-shell.js')) add('blocker','menu',htmlPath,'certified app lacks Golden UI shell');
  if(!/viewport-fit=cover/.test(html)) add('major','mobile',htmlPath,'viewport-fit=cover missing');
  if(!html.includes('/shared/golden-physics.js')) add('blocker','collision',htmlPath,'certified app lacks canonical Golden physics');
}
const appFiles=[];
function walk(dir){
  if(!fs.existsSync(dir))return;
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(js|html|css)$/.test(e.name))appFiles.push(p);
  }
}
walk(path.join(ROOT,'apps'));
for(const abs of appFiles){
  const rel=path.relative(ROOT,abs).replaceAll('\\','/'),s=fs.readFileSync(abs,'utf8');
  if(/\.toBeTruthy\s*;|\.toBeFalsy\s*;/.test(s)) add('blocker','tests',rel,'false-green matcher without invocation');
  if(/const\s+wishX\s*=\s*\(s\*cos\s*\+\s*f\*sin\)/.test(s)) add('blocker','controls',rel,'known inverted camera-relative formula');
  if(/new THREE\.Vector3\(Math\.cos\(yaw\),0,-Math\.sin\(yaw\)\)/.test(s) && rel.includes('catalog')) add('blocker','controls',rel,'known reversed catalog screen-right vector');
}
for(const [name,t] of Object.entries(tech.technologies||{})){
  for(const ev of t.evidence||[]){
    if(!fs.existsSync(path.join(ROOT,ev))) add('major','technology',ev,`${name}: declared ${t.status} evidence missing`);
  }
  if((t.status==='production'||t.status==='integrated') && !(t.evidence||[]).length) add('major','technology','data/technology-registry.json',`${name}: no executable evidence`);
}
const counts={blocker:0,major:0,warning:0};
for(const f of findings) counts[f.severity]=(counts[f.severity]||0)+1;
const report={generatedAt:new Date().toISOString(),pass:counts.blocker===0,counts,findings};
fs.writeFileSync(path.join(ROOT,'PROJECT_QUALITY_REVIEW.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[PROJECT_REVIEW] blockers=${counts.blocker} major=${counts.major} warnings=${counts.warning}`);
if(counts.blocker) process.exit(4);
