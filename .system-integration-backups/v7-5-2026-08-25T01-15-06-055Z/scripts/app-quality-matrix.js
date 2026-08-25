#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd(),load=r=>JSON.parse(fs.readFileSync(path.join(ROOT,r),'utf8'));
const rel=load('data/app-release-registry.json'),caps=load('data/app-capabilities.json'),contracts=load('data/system-contracts.json');
const rows=[];
for(const [id,a] of Object.entries(rel.apps||{})){
  const cap=caps.apps?.[id]||{};
  const html=path.join(ROOT,'apps',id,'index.html');
  const exists=fs.existsSync(html);
  const content=exists?fs.readFileSync(html,'utf8'):'';
  const checks={
    exists,
    certified:a.status==='certified',
    visible:a.visible===true,
    goldenUi:content.includes('/shared/golden-ui-shell.js'),
    goldenPhysics:content.includes('/shared/golden-physics.js'),
    playable:cap.capabilities?.playable===true
  };
  const vals=Object.values(checks).map(Boolean);
  const score=Math.round(vals.filter(Boolean).length*100/vals.length);
  rows.push({id,type:a.type||cap.type,status:a.status,score,checks});
}
rows.sort((a,b)=>a.score-b.score);
fs.writeFileSync(path.join(ROOT,'APP_QUALITY_MATRIX.json'),JSON.stringify({generatedAt:new Date().toISOString(),rows},null,2)+'\n');
console.log(`[APP_QUALITY_MATRIX] apps=${rows.length} weakest=${rows[0]?.id||'none'}:${rows[0]?.score??'-'}%`);
