#!/usr/bin/env node
'use strict';
const crypto=require('crypto'),zlib=require('zlib');
const {generateChunk}=require('../lib/game-rules');
const EDIT_SEED=59059;
const WINDOWS=[{id:'w0',ox:0,oz:0},{id:'w1',ox:37,oz:-19},{id:'w2',ox:-101,oz:88},{id:'w3',ox:1000,oz:-1000}];
const RADII=[2,4,8,16];
function rng(seed){let x=seed>>>0;return()=>((x=(Math.imul(x,1664525)+1013904223)>>>0)/4294967296)}
function chunksInWindow(ox,oz,r){const out=[];for(let cz=oz-r;cz<=oz+r;cz++)for(let cx=ox-r;cx<=ox+r;cx++)out.push([cx,cz]);return out}
function canonicalState(ox,oz,r,remaining=new Map()){const rows=[];for(const [cx,cz] of chunksInWindow(ox,oz,r)){const c=generateChunk(cx,cz,remaining);for(const q of c.resources)rows.push([q.id,q.type,+q.position.x.toFixed(6),+q.position.z.toFixed(6),q.amount,q.remaining])}return Buffer.from(JSON.stringify(rows))}
function makeHistory(ox,oz,r,seed){const rr=rng((seed^Math.imul(ox,73856093)^Math.imul(oz,19349663)^r)>>>0),base=[];for(const [cx,cz] of chunksInWindow(ox,oz,r)){const c=generateChunk(cx,cz);for(const q of c.resources){if(rr()<0.02){const remain=Math.max(0,Math.floor(q.amount*(0.15+rr()*0.7)));base.push([q.id,remain])}}}return base}
function descriptor(ox,oz,r,history){return Buffer.from(JSON.stringify({model:'survival-chunk-v1',window:[ox,oz,r],history}))}
function hash(b){return crypto.createHash('sha256').update(b).digest('hex')}
function br(b){return zlib.brotliCompressSync(b,{params:{[zlib.constants.BROTLI_PARAM_QUALITY]:6}})}
function mapOf(h){return new Map(h)}
function shuffledHistory(h){if(h.length<2)return h.map(x=>[x[0]+'x',x[1]]);const ids=h.map(x=>x[0]);return h.map((x,i)=>[ids[(i+1)%ids.length],x[1]])}
function median(a){const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length/2)]}
function run(){
 const rows=[];
 for(const w of WINDOWS)for(const r of RADII){
  const history=makeHistory(w.ox,w.oz,r,EDIT_SEED),full=canonicalState(w.ox,w.oz,r,mapOf(history)),d=descriptor(w.ox,w.oz,r,history),parsed=JSON.parse(d.toString()),rebuilt=canonicalState(parsed.window[0],parsed.window[1],parsed.window[2],new Map(parsed.history)),control=canonicalState(w.ox,w.oz,r,mapOf(shuffledHistory(history))),cb=br(full),resources=JSON.parse(full).length;
  rows.push({window:w.id,origin:[w.ox,w.oz],radius:r,chunks:(2*r+1)**2,resources,edits:history.length,descriptorBytes:d.length,compressedExplicitBytes:cb.length,exact:hash(full)===hash(rebuilt),controlMismatch:hash(full)!==hash(control),compressedToDescriptor:cb.length/d.length,editRate:history.length/resources});
 }
 const largest=rows.filter(x=>x.radius===16),growth=WINDOWS.map(w=>{const a=rows.find(x=>x.window===w.id&&x.radius===8),b=rows.find(x=>x.window===w.id&&x.radius===16);return{window:w.id,descriptorGrowth:b.descriptorBytes/a.descriptorBytes,explicitGrowth:b.compressedExplicitBytes/a.compressedExplicitBytes}});
 const criterion={exactAll:rows.every(x=>x.exact),controlMismatchAll:rows.filter(x=>x.edits>=2).every(x=>x.controlMismatch),minLargestRatio:Math.min(...largest.map(x=>x.compressedToDescriptor)),maxLargestEditRate:Math.max(...largest.map(x=>x.editRate)),medianDescriptorGrowth:median(growth.map(x=>x.descriptorGrowth)),medianExplicitGrowth:median(growth.map(x=>x.explicitGrowth))};
 const pass=criterion.exactAll&&criterion.controlMismatchAll&&criterion.minLargestRatio>=8&&criterion.maxLargestEditRate<=0.03&&criterion.medianDescriptorGrowth<=4.8&&criterion.medianExplicitGrowth>=3.2;
 return{experiment:'RUN_059_H1_DYNAMIC_DELTA_RECONSTRUCTION',productionPath:'lib/game-rules.js::generateChunk',subhypothesis:'A large modified survival world can be represented exactly by deterministic procedural chunk rules plus a sparse history of resource deltas, with description size tracking edits rather than full world state.',seedAndControl:{editSeed:EDIT_SEED,windows:WINDOWS,radii:RADII,control:'cyclically reassign the same remaining values to the wrong resource IDs; explicit baseline is Brotli-compressed full resource state'},confirmation:'All exact; wrong-ID control mismatches when >=2 edits; every radius-16 compressed explicit state >=8x descriptor; edit rate <=3%; median descriptor growth 8->16 <=4.8x while compressed explicit state grows >=3.2x.',refutation:'Any fixed confirmation criterion fails.',criterion,growth,rows,pass}
}
module.exports={run};
if(require.main===module){const r=run();console.log(JSON.stringify(r,null,2));process.exitCode=r.pass?0:2}
