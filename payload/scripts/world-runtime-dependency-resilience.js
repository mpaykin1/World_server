#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=process.cwd();
const read=p=>{try{return fs.readFileSync(path.join(ROOT,p),'utf8')}catch{return''}};
const exists=p=>fs.existsSync(path.join(ROOT,p));
const TARGETS=['apps/voxel-world/client.js','apps/ai3d-voxel-city/client.js'];
function audit(){
  const dependencies=[];
  for(const file of TARGETS){const s=read(file);if(!s)continue;const urls=[...s.matchAll(/https?:\/\/[^'"\s)]+/g)].map(m=>m[0]);for(const url of urls){const external=/unpkg\.com|jsdelivr\.net|cdnjs\.cloudflare\.com|esm\.sh/i.test(url);if(external)dependencies.push({file,url,type:'runtime-cdn',resilience:'network-dependent'})}}
  const localThree=['vendor/three.module.min.js','vendor/three.module.js','shared/vendor/three.module.min.js'].find(exists)||null;
  const cdnThree=dependencies.some(d=>/three/i.test(d.url));
  const recommendations=[];
  if(cdnThree&&!localThree)recommendations.push({id:'vendor-three-locally',priority:'high',reason:'runtime currently depends on external CDN; vendor exact tested version with license and regression tests'});
  if(cdnThree&&localThree)recommendations.push({id:'promote-local-three',priority:'high',reason:'local vendor exists but runtime still uses CDN; candidate switch must pass full browser/mobile gates'});
  const out={schemaVersion:'6.0.0',system:'WORLD_RUNTIME_DEPENDENCY_RESILIENCE',generatedAt:new Date().toISOString(),dependencies,localThreeVendor:localThree,networkDependentRuntimeCount:dependencies.length,recommendations,hardGateReady:true,policy:'do not silently change runtime library version; local-vendor promotion is a tested candidate, not an automatic destructive rewrite'};
  fs.writeFileSync(path.join(ROOT,'WORLD_RUNTIME_DEPENDENCY_RESILIENCE_REPORT.json'),JSON.stringify(out,null,2)+'\n');return out;
}
if(require.main===module){const o=audit();console.log(`[RUNTIME_RESILIENCE] networkDeps=${o.networkDependentRuntimeCount} recommendations=${o.recommendations.length}`)}
module.exports={audit};
