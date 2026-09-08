'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const registry=JSON.parse(fs.readFileSync(path.join(root,'data','app-release-registry.json'),'utf8').replace(/^\uFEFF/,''));
function project(registry){
  const local=Object.entries(registry.apps||{}).filter(([,m])=>m?.worldMenu?.show).map(([id,m])=>({id,title:m.title||id,url:`/apps/${id}/`,status:m.status||'unknown',kind:m.kind||'game',external:false,available:true,worldMenu:m.worldMenu}));
  const external=(registry.externalWorlds||[]).filter(x=>x?.worldMenu?.show!==false).map(x=>({...x,external:true,available:true,certified:false,source:'static-fallback'}));
  return {schemaVersion:'1.0.0',generatedFrom:'data/app-release-registry.json',inventory:[...local,...external]};
}
if(require.main===module){const out=path.join(root,'shared','world-catalog-fallback.json');fs.writeFileSync(out,JSON.stringify(project(registry),null,2)+'\n');console.log(`Generated ${out}`);}
module.exports={project};
