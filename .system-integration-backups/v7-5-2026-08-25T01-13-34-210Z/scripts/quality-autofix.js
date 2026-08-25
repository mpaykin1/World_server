#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=process.cwd(),APPLY=process.argv.includes('--apply');
const recipes=JSON.parse(fs.readFileSync(path.join(ROOT,'data/autofix-recipes.json'),'utf8'));
const release=JSON.parse(fs.readFileSync(path.join(ROOT,'data/app-release-registry.json'),'utf8'));
const changes=[],skipped=[],errors=[];

function walk(dir,out=[]){
  if(!fs.existsSync(dir))return out;
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const a=path.join(dir,e.name);
    if(e.isDirectory())walk(a,out);else out.push(a);
  } return out;
}
function rel(p){return path.relative(ROOT,p).replaceAll('\\','/')}
function writeIfChanged(file,next,recipe){
  const prev=fs.readFileSync(file,'utf8');
  if(prev===next)return false;
  const before=crypto.createHash('sha256').update(prev).digest('hex');
  const after=crypto.createHash('sha256').update(next).digest('hex');
  changes.push({recipe,file:rel(file),before,after,applied:APPLY});
  if(APPLY)fs.writeFileSync(file,next);
  return true;
}
function certifiedApps(){
  return Object.entries(release.apps||{}).filter(([,a])=>a.status==='certified'&&a.visible===true).map(([id])=>id);
}

for(const r of recipes.recipes||[]){
  try{
    if(r.kind==='replaceAll'){
      for(const file of walk(path.join(ROOT,'e2e')).concat(walk(path.join(ROOT,'test'))).filter(f=>f.endsWith('.js'))){
        const prev=fs.readFileSync(file,'utf8');
        if(prev.includes(r.from))writeIfChanged(file,prev.split(r.from).join(r.to),r.id);
      }
    }else if(r.kind==='htmlViewport'){
      for(const id of certifiedApps()){
        const file=path.join(ROOT,'apps',id,'index.html');if(!fs.existsSync(file))continue;
        let s=fs.readFileSync(file,'utf8');
        if(!/<meta[^>]+name=["']viewport["']/i.test(s)){skipped.push({recipe:r.id,file:rel(file),reason:'viewport meta missing; unsafe to invent placement'});continue;}
        if(/viewport-fit=cover/i.test(s))continue;
        s=s.replace(/(<meta[^>]+name=["']viewport["'][^>]+content=["'])([^"']*)(["'][^>]*>)/i,(m,a,c,b)=>a+(c.includes('viewport-fit=cover')?c:c+',viewport-fit=cover')+b);
        writeIfChanged(file,s,r.id);
      }
    }else if(r.kind==='ensureHtmlIncludes'){
      for(const id of certifiedApps()){
        const file=path.join(ROOT,'apps',id,'index.html');if(!fs.existsSync(file))continue;
        let s=fs.readFileSync(file,'utf8'),added=[];
        for(const inc of r.includes||[])if(!s.includes(inc)){added.push(inc)}
        if(!added.length)continue;
        if(!/<\/body>/i.test(s)){skipped.push({recipe:r.id,file:rel(file),reason:'no body close'});continue;}
        s=s.replace(/<\/body>/i,added.join('\n')+'\n</body>');
        writeIfChanged(file,s,r.id);
      }
    }
  }catch(e){errors.push({recipe:r.id,error:String(e.message||e)})}
}
const report={generatedAt:new Date().toISOString(),mode:APPLY?'apply':'plan',changes,skipped,errors};
fs.writeFileSync(path.join(ROOT,'AUTOFIX_REPORT.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[AUTOFIX] mode=${report.mode} changes=${changes.length} skipped=${skipped.length} errors=${errors.length}`);
if(errors.length)process.exit(12);
