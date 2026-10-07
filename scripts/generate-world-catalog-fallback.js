'use strict';
const fs=require('fs');
const path=require('path');
const {worldMenuWithLore,buildUniversalLoreGraph}=require('../lib/world-lore');
const root=path.resolve(__dirname,'..');
const registry=JSON.parse(fs.readFileSync(path.join(root,'data','app-release-registry.json'),'utf8').replace(/^\uFEFF/,''));
const defaultLoreBible=JSON.parse(fs.readFileSync(path.join(root,'data','world-lore-v2.json'),'utf8').replace(/^\uFEFF/,''));
function project(registry,loreBible=defaultLoreBible){
  const local=Object.entries(registry.apps||{}).filter(([,m])=>m?.worldMenu?.show).map(([id,m])=>({
    id,title:m.title||id,url:`/apps/${id}/`,status:m.status||'unknown',kind:m.kind||'game',external:false,available:true,
    certified:m.visible===true&&m.status==='certified',source:'static-fallback',
    worldMenu:worldMenuWithLore(id,m.worldMenu,loreBible)
  }));
  const external=(registry.externalWorlds||[]).filter(x=>x?.worldMenu?.show!==false).map(x=>({
    ...x,external:true,available:true,certified:false,source:'static-fallback',
    worldMenu:worldMenuWithLore(x.id,x.worldMenu,loreBible)
  }));
  const inventory=[...local,...external];
  return {
    schemaVersion:'1.1.0',
    generatedFrom:'data/app-release-registry.json + data/world-lore-v2.json',
    releasePolicy:registry.policy||'deny-by-default',
    loreGraph:buildUniversalLoreGraph(inventory,loreBible),
    inventory
  };
}
if(require.main===module){const out=path.join(root,'shared','world-catalog-fallback.json');fs.writeFileSync(out,JSON.stringify(project(registry),null,2)+'\n');console.log(`Generated ${out}`);}
module.exports={project};