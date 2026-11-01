#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..'),manifest=path.join(root,'architecture/engines/engines.json');
const data=JSON.parse(fs.readFileSync(manifest,'utf8'));
const exists=p=>typeof p==='string'&&fs.existsSync(path.join(root,p));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function importsModule(game,modulePath){
 if(!exists(game)||!exists(modulePath))return false;
 const text=read(game),base=path.basename(modulePath);
 return text.includes(modulePath)||text.includes(base);
}
for(const e of data.engines){
 let contract=false;
 if(exists(e.contract))try{
  const c=JSON.parse(read(e.contract));
  contract=c.input===e.input&&c.output===e.output&&!!c.api;
 }catch{}
 let api=false;
 if(exists(e.module))try{
  const r=cp.spawnSync(process.execPath,['-e',
   'const x=require(process.argv[1]);if(!x||typeof x!=="object"&&typeof x!=="function"||!Object.keys(x).length)process.exit(1)',
   path.join(root,e.module)],{timeout:15000,encoding:'utf8'});
  api=r.status===0;
 }catch{}
 let tested=false;
 if(api&&typeof e.test_command==='string'&&e.test_command===`node ${e.module} --self-test`){
  const r=cp.spawnSync(process.execPath,[path.join(root,e.module),'--self-test'],{timeout:20000,encoding:'utf8'});
  tested=r.status===0;
 }
 const consumers=[...new Set((e.consumers||[]).filter(p=>importsModule(p,e.module)))];
 const gates={G1:contract,G2:api,G3:tested,G4:consumers.length>=1,G5:consumers.length>=2};
 e.gates=gates;e.percent=Object.values(gates).filter(Boolean).length*20;
 console.log(e.id+': '+e.percent+'% '+Object.entries(gates).map(([k,v])=>k+'='+Number(v)).join(' '));
}
data.overall_percent=Number((data.engines.reduce((s,e)=>s+e.percent,0)/data.engines.length).toFixed(2));
console.log('overall: '+data.overall_percent+'%');
console.log('baseline discrepancy: Claude estimates are qualitative; this score counts only G1–G5 evidenced gates.');
if(process.argv.includes('--write'))fs.writeFileSync(manifest,JSON.stringify(data,null,2)+'\n');
