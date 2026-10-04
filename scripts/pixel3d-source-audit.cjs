#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const cp=require('child_process');

const args=process.argv.slice(2);
const getArg=(name,def)=>{const i=args.indexOf(name);return i>=0?args[i+1]:def;};
const sourceRoot=path.resolve(getArg('--source-root',path.join(process.env.LOCALAPPDATA||'.','WorldServerAI','pixel3d-sources')));
const outJson=path.resolve(getArg('--out-json',path.join(process.cwd(),'data','pixel3d-source-audit.json')));
const outMd=path.resolve(getArg('--out-md',path.join(process.cwd(),'docs','PIXEL3D_SOURCE_AUDIT.md')));

const REPOS=[
  {dir:'2d-to-3d-voxelizer',name:'GazPrash/2d-to-3d-voxelizer',license:'MIT'},
  {dir:'orthovoxel-studio',name:'felirami/orthovoxel-studio',license:'MIT'},
  {dir:'SpriteToVoxel',name:'CreggHancock/SpriteToVoxel',license:'MIT'},
  {dir:'blockbench',name:'JannisX11/blockbench',license:'GPL-3.0'}
];
const TEXT_EXT=new Set(['.js','.cjs','.mjs','.ts','.tsx','.jsx','.go','.py','.json','.md','.txt','.css','.scss','.html','.yml','.yaml','.toml','.xml','.glsl','.vert','.frag','.d.ts','.gitignore','.gitattributes','.webmanifest']);
const KEYWORDS=['voxel','pixel','projection','silhouette','extrude','mesh','cube','texture','uv','editor','paint','undo','export','import','model','scene','camera','raycast','animation','gltf','obj','palette','quantiz','depth','sprite'];
function sha256(buf){return crypto.createHash('sha256').update(buf).digest('hex');}
function git(dir,...a){try{return cp.execFileSync('git',['-C',dir,...a],{encoding:'utf8'}).trim();}catch{return null;}}
function walk(dir){const out=[];for(const ent of fs.readdirSync(dir,{withFileTypes:true})){if(ent.name==='.git')continue;const p=path.join(dir,ent.name);if(ent.isDirectory())out.push(...walk(p));else out.push(p);}return out;}
function isText(file,buf){const ext=path.extname(file).toLowerCase();if(TEXT_EXT.has(ext)||['LICENSE','README','Dockerfile'].includes(path.basename(file)))return !buf.includes(0);return !buf.includes(0)&&buf.length<2_000_000&&/^[\x09\x0A\x0D\x20-\x7E\x80-\xFF]*$/.test(buf.toString('latin1'));}
function capabilityHits(rel,text){const s=(rel+'\n'+text.slice(0,200000)).toLowerCase();return KEYWORDS.filter(k=>s.includes(k));}
function classify(repo,rel,text,hits){
  const p=rel.replace(/\\/g,'/').toLowerCase();
  const generated=/package-lock\.json$|go\.sum$|wailsjs\/|\.min\.js$|\.d\.ts$/.test(p);
  const asset=/\.(png|jpg|jpeg|webp|ico|icns|ttf|woff2|mp4|gif)$/i.test(p)||/\/assets\//.test(p)||/^demos\//.test(p);
  const docs=/readme|license|contributing|code_of_conduct|\.md$/.test(p);
  const core=/voxelengine|projections\.ts$|generator\.go$|processor\.go$|quantizer\.go$|editor\.go$|voxel\.go$|extrude_image|outliner\/types\/(cube|mesh)|undo\.js$|io\/project|io\/codec|io\/format|standards\/(obj|gltf)|texturing\/painter|uv\/uv|preview\/canvas/.test(p);
  const currentNeed=/voxelengine|projections\.ts$|generator\.go$|processor\.go$|quantizer\.go$|editor\.go$|voxel\.go$|extrude_image/.test(p);
  const editorNeed=/viewport|editor|paint|undo|raycast|outliner\/types\/(cube|mesh)/.test(p);
  const exporter=/export|standards\/(obj|gltf)|codec/.test(p);
  const animation=/animation|armature|bone|weight_paint/.test(p);

  if(repo.license==='GPL-3.0'){
    if(asset||generated)return {decision:'SKIP',reason:'GPL project asset/generated dependency; no need to copy into World Server'};
    if(core||editorNeed)return {decision:'LEARN-REIMPLEMENT',reason:'Relevant Blockbench behavior/architecture, but GPL code must stay out of World Server clean-room implementation'};
    if(animation||exporter||/texture|uv|format|model|preview|mesh|cube/.test(p))return {decision:'PRESERVE-FOR-LATER',reason:'Potential future capability reference; GPL prevents direct import'};
    return {decision:'SKIP',reason:'No unique Pixel2World capability for the current integration'};
  }
  if(generated)return {decision:'SKIP',reason:'Generated/vendor/lock output; importing adds weight without unique capability'};
  if(asset)return {decision:'SKIP',reason:'Demo/UI asset is not required for the algorithm and may have separate provenance'};
  if(docs)return {decision:'PRESERVE-FOR-LATER',reason:'Useful provenance/build documentation, not runtime code'};

  if(repo.name==='felirami/orthovoxel-studio'){
    if(/src\/lib\/voxelengine\.ts$/.test(p))return {decision:'ADAPT',reason:'Orthographic silhouette intersection is the missing World Server capability'};
    if(/src\/lib\/projections\.ts$/.test(p))return {decision:'ADAPT',reason:'Projection decoding/orientation normalization is directly useful'};
    if(/src\/components\/voxelviewport\.tsx$/.test(p))return {decision:'LEARN-REIMPLEMENT',reason:'Editor raycast/add/erase/paint patterns useful, but existing World Server render stack should be reused'};
    if(/src\/lib\/exporters\.ts$/.test(p))return {decision:'SKIP',reason:'World Server already has stronger voxel meshing/render/export runtime'};
    if(/src\/types\.ts$/.test(p))return {decision:'ADAPT',reason:'Small multi-view model schema maps cleanly to World Server scene contracts'};
    return {decision:editorNeed?'PRESERVE-FOR-LATER':'SKIP',reason:editorNeed?'Potential editor UX reference':'Framework/UI/build plumbing is not needed'};
  }
  if(repo.name==='GazPrash/2d-to-3d-voxelizer'){
    if(/backend\/(generator|processor|quantizer|editor|voxel)\.go$/.test(p))return {decision:'ADAPT',reason:'Useful depth, palette, voxel editing or face-culling algorithm; port concepts into existing JS/runtime rather than Go/Wails stack'};
    if(/backend\/types\.go$/.test(p))return {decision:'LEARN-REIMPLEMENT',reason:'Data-shape reference only; World Server already has voxel/world schemas'};
    if(/frontend\/src\/editor\/editorlogic\.ts$/.test(p))return {decision:'LEARN-REIMPLEMENT',reason:'Raycast voxel editing interaction is useful, reuse current World Server rendering'};
    if(/frontend\/src\/renderscene\.ts$/.test(p))return {decision:'SKIP',reason:'Three.js rendering duplicated by stronger World Server runtime'};
    return {decision:currentNeed?'ADAPT':(editorNeed?'PRESERVE-FOR-LATER':'SKIP'),reason:currentNeed?'Useful algorithmic component':'UI/build/runtime plumbing is not required'};
  }
  if(repo.name==='CreggHancock/SpriteToVoxel'){
    if(/main\.js$/.test(p))return {decision:'LEARN-REIMPLEMENT',reason:'Tiny pixel-to-cube baseline is useful as a regression oracle; World Server already has stronger meshing'};
    return {decision:'SKIP',reason:'Capability is already superseded by World Server voxel representation/mesher'};
  }
  return {decision:'SKIP',reason:'No unique capability identified'};
}

const report={schema:'world-server-pixel3d-source-audit-v1',generatedAt:new Date().toISOString(),policy:{goal:'100% source inventory, minimum imported code',decisions:['IMPORT','ADAPT','LEARN-REIMPLEMENT','PRESERVE-FOR-LATER','SKIP'],note:'Every non-.git file is hashed and classified; source code is not bulk-imported.'},repos:[]};
for(const repo of REPOS){
  const dir=path.join(sourceRoot,repo.dir);if(!fs.existsSync(dir))throw new Error(`Missing source repo: ${dir}`);
  const files=walk(dir).sort();const entries=[];
  for(const file of files){
    const rel=path.relative(dir,file).replace(/\\/g,'/');const buf=fs.readFileSync(file);const textFile=isText(file,buf);const text=textFile?buf.toString('utf8'):'';const hits=textFile?capabilityHits(rel,text):[];const c=classify(repo,rel,text,hits);
    entries.push({path:rel,size:buf.length,sha256:sha256(buf),kind:textFile?'text':'binary',lines:textFile?(text.match(/\n/g)||[]).length+1:0,capabilityHits:hits,decision:c.decision,reason:c.reason});
  }
  const counts={};for(const e of entries)counts[e.decision]=(counts[e.decision]||0)+1;
  report.repos.push({name:repo.name,license:repo.license,head:git(dir,'rev-parse','HEAD'),files:entries.length,bytes:entries.reduce((n,e)=>n+e.size,0),decisionCounts:counts,entries});
}
report.totals={files:report.repos.reduce((n,r)=>n+r.files,0),bytes:report.repos.reduce((n,r)=>n+r.bytes,0)};
fs.mkdirSync(path.dirname(outJson),{recursive:true});fs.writeFileSync(outJson,JSON.stringify(report,null,2));
const lines=['# Pixel2World source audit','',`Generated: ${report.generatedAt}`,'',`Audited **${report.totals.files} files** across ${report.repos.length} repositories. Every non-.git file was read, SHA-256 hashed, scanned for capability markers, and classified. No bulk source import was performed.`,'','## Repository summary','', '| Repository | License | HEAD | Files | Decisions |','|---|---|---|---:|---|'];
for(const r of report.repos)lines.push(`| ${r.name} | ${r.license} | \`${r.head}\` | ${r.files} | ${Object.entries(r.decisionCounts).map(([k,v])=>`${k}: ${v}`).join(', ')} |`);
lines.push('','## Integration rules','','- **IMPORT**: copy only when the source is license-safe and uniquely useful.','- **ADAPT**: port the useful algorithm into World Server conventions and existing runtime.','- **LEARN-REIMPLEMENT**: study behavior/architecture, then implement independently.','- **PRESERVE-FOR-LATER**: useful reference but not needed in the current MVP.','- **SKIP**: duplicate, generated, UI/build plumbing, asset, or otherwise not useful now.','','Blockbench is GPL-3.0, so relevant code is never imported into World Server; it is only used as a behavioral/architectural reference. The three voxel converters are MIT, but even there the integration favors small ports over importing whole frameworks.','','## Full per-file decisions','','The machine-readable file `data/pixel3d-source-audit.json` contains the decision, reason, SHA-256, size, line count and capability markers for every audited file.');
fs.mkdirSync(path.dirname(outMd),{recursive:true});fs.writeFileSync(outMd,lines.join('\n')+'\n');
console.log(JSON.stringify({outJson,outMd,totals:report.totals,repos:report.repos.map(r=>({name:r.name,head:r.head,files:r.files,decisionCounts:r.decisionCounts}))},null,2));
