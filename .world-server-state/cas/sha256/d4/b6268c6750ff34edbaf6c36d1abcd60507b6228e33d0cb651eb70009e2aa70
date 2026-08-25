'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function readJson(p){return JSON.parse(fs.readFileSync(p,'utf8'));}
function buildSbom(root){
  const pkgPath=path.join(root,'package.json'); if(!fs.existsSync(pkgPath)) return {ok:false,status:'HOLD',reason:'package-json-missing',components:[]};
  const pkg=readJson(pkgPath),lockPath=['package-lock.json','npm-shrinkwrap.json'].map(x=>path.join(root,x)).find(fs.existsSync);
  const all={...(pkg.dependencies||{}),...(pkg.devDependencies||{}),...(pkg.optionalDependencies||{})};
  const components=Object.entries(all).sort(([a],[b])=>a.localeCompare(b)).map(([name,version])=>({name,version:String(version),pinned:/^(?:\d+\.\d+\.\d+|git\+[^#]+#[a-f0-9]{7,}|https?:\/\/[^#]+#[a-f0-9]{7,})$/i.test(String(version))}));
  const lockHash=lockPath?sha(fs.readFileSync(lockPath)):null;
  const manifestHash=sha(fs.readFileSync(pkgPath));
  return {ok:true,format:'quality-sbom-v10',package:{name:pkg.name||null,version:pkg.version||null},components,manifestHash,lockfile:lockPath?path.basename(lockPath):null,lockHash,unpinned:components.filter(x=>!x.pinned).map(x=>x.name)};
}
function evaluateSupplyChain(sbom,{requireLock=true,requirePinned=false}={}){
  if(!sbom||!sbom.ok)return {ok:false,status:'HOLD',reason:sbom?.reason||'sbom-unavailable'};
  const findings=[];if(requireLock&&!sbom.lockHash)findings.push({severity:'major',id:'lockfile-missing'});if(requirePinned&&sbom.unpinned.length)findings.push({severity:'major',id:'unpinned-dependencies',packages:sbom.unpinned});
  return {ok:findings.length===0,status:findings.length?'HOLD':'PASS',findings};
}
module.exports={buildSbom,evaluateSupplyChain,sha};
