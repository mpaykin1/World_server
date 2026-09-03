'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const CAPABILITIES=new Set(['world.read','world.spec.read','feedback.summary.read','translation.translate','navigator.tool','multiplayer.presence.read','telemetry.summary.read']);
const ID=/^[a-z][a-z0-9-]{2,63}$/; const VER=/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
function sha256(v){return crypto.createHash('sha256').update(v).digest('hex')}
function validateManifest(m={}){
  const e=[];if(!ID.test(String(m.id||'')))e.push('invalid id');if(!VER.test(String(m.version||'')))e.push('invalid semver');
  if(typeof m.name!=='string'||!m.name.trim())e.push('name required');if(m.runtime!=='server')e.push('runtime must be server');if(String(m.entry||'')!=='handler.js')e.push('entry must be handler.js');
  const caps=Array.isArray(m.capabilities)?m.capabilities:[];for(const c of caps)if(!CAPABILITIES.has(c))e.push('capability denied: '+c);
  if(m.installMode!=='revision')e.push('installMode must be revision');if(m.hotCode===true)e.push('hotCode forbidden');
  if(!Array.isArray(m.gameDesignSections)||!m.gameDesignSections.length)e.push('gameDesignSections required');
  if(!Array.isArray(m.acceptance)||!m.acceptance.length)e.push('acceptance required');
  if(m.rollbackSafe!==true)e.push('rollbackSafe must be true');
  return{ok:e.length===0,errors:e,manifest:{...m,capabilities:caps}};
}
const FORBIDDEN=[/\beval\s*\(/,/\bnew\s+Function\b/,/child_process/,/process\.env/,/\brequire\(['\"](?:fs|net|tls|dgram|cluster|worker_threads)['\"]\)/,/https?:\/\//i,/import\s*\(\s*['\"]https?:/i];
function auditSource(source){const hits=[];for(const r of FORBIDDEN)if(r.test(source))hits.push(String(r));return{ok:hits.length===0,hits}}
function inspectPackage(dir){
  const mf=path.join(dir,'manifest.json'),hf=path.join(dir,'handler.js');if(!fs.existsSync(mf)||!fs.existsSync(hf))return{ok:false,errors:['manifest.json and handler.js required'],dir};
  let m;try{m=JSON.parse(fs.readFileSync(mf,'utf8'))}catch(e){return{ok:false,errors:['manifest json: '+e.message],dir}}
  const v=validateManifest(m),src=fs.readFileSync(hf,'utf8'),a=auditSource(src);return{ok:v.ok&&a.ok,errors:[...v.errors,...a.hits.map(x=>'forbidden source pattern '+x)],manifest:v.manifest,sourceSha256:sha256(src),manifestSha256:sha256(fs.readFileSync(mf)),dir};
}
function discover(root){const base=path.join(root,'world-functions');if(!fs.existsSync(base))return[];return fs.readdirSync(base,{withFileTypes:true}).filter(x=>x.isDirectory()&&!x.name.startsWith('_')).map(x=>inspectPackage(path.join(base,x.name))).sort((a,b)=>String(a.manifest?.id).localeCompare(String(b.manifest?.id)))}
function loadHandler(root,id){const pkg=discover(root).find(x=>x.ok&&x.manifest.id===id);if(!pkg)throw new Error('function package unavailable');const file=path.join(pkg.dir,'handler.js');delete require.cache[require.resolve(file)];const mod=require(file);if(typeof mod.run!=='function')throw new Error('handler must export run(ctx,input)');return{pkg,run:mod.run}}
module.exports={CAPABILITIES,validateManifest,auditSource,inspectPackage,discover,loadHandler,sha256};
