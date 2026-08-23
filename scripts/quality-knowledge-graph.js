#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=process.cwd(),load=r=>{const p=path.join(ROOT,r);return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):{}};
const rel=load('data/app-release-registry.json'),caps=load('data/app-capabilities.json'),errs=load('data/error-prevention-registry.json'),gold=load('data/golden-components.json'),tech=load('data/technology-registry.json'),model=load('data/quality-model.json');
const nodes=new Map(),edges=[];const node=(id,type,data={})=>nodes.set(id,{id,type,...data}),edge=(a,b,k)=>edges.push({from:a,to:b,kind:k});
for(const [id,a] of Object.entries(rel.apps||{}))node(`app:${id}`,'app',{status:a.status,visible:a.visible});
for(const [id,a] of Object.entries(caps.apps||{}))for(const [c,v] of Object.entries(a.capabilities||{}))if(v===true){node(`cap:${c}`,'capability');edge(`app:${id}`,`cap:${c}`,'has')}
for(const e of errs.knownErrors||[]){node(`error:${e.id}`,'error',{status:e.status,severity:e.severity});for(const a of e.apps||[])edge(`error:${e.id}`,`app:${a}`,'affects')}
for(const [id,g] of Object.entries(gold.components||{}))node(`golden:${id}`,'golden',{status:g.status,canonical:g.canonical});
for(const [id,t] of Object.entries(tech.technologies||{}))node(`tech:${id}`,'technology',{percent:t.percent,status:t.status});
for(const [id,m] of Object.entries(model.metrics||{})){node(`metric:${id}`,'metric');for(const c of m.controls||[]){node(`control:${c.id}`,'control',{weight:c.weight});edge(`metric:${id}`,`control:${c.id}`,'measured-by')}}
const out={generatedAt:new Date().toISOString(),nodes:[...nodes.values()],edges};fs.writeFileSync(path.join(ROOT,'QUALITY_KNOWLEDGE_GRAPH.json'),JSON.stringify(out,null,2)+'\n');console.log(`[KNOWLEDGE_GRAPH] nodes=${out.nodes.length} edges=${edges.length}`);
