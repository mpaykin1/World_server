'use strict';
const { snapBuilding } = require('../lib/game-rules');
const SEEDS=[60061,60071,60083,60101,60103,60107];
const PIECES=['foundation','wall','doorway','door','stairs','campfire'];
const GRID=4, RADII=[1.6,2,2.4,2.8,3.2,3.6,4];
function rng(seed){let x=seed>>>0;return()=>((x=(1664525*x+1013904223)>>>0)/4294967296)}
const snap=n=>Math.round(Number(n||0)/GRID)*GRID;
const d2=(a,b)=>(a.x-b.x)**2+(a.z-b.z)**2;
function edges(b){const x=b.position.x,z=b.position.z;return[
{x,z:z-2,rotY:0,supportId:b.id,slot:`edge:${b.id}:n`},{x,z:z+2,rotY:0,supportId:b.id,slot:`edge:${b.id}:s`},
{x:x-2,z,rotY:Math.PI/2,supportId:b.id,slot:`edge:${b.id}:w`},{x:x+2,z,rotY:Math.PI/2,supportId:b.id,slot:`edge:${b.id}:e`}];}
function nearest(buildings,piece,pos,radius,candidates){let best=null,bd=Infinity;for(const b of buildings){if(b.piece!==piece)continue;for(const c of candidates(b)){const d=d2(c,pos);if(d<bd){bd=d;best=c}}}return best&&bd<=radius*radius?best:null}
function fallback(piece,pos,rot=0){const x=snap(pos.x),z=snap(pos.z);return{x,y:0,z,rotY:Number(rot)||0,supportId:null,slot:`${piece}:${x}:${z}`}}
function freeWall(piece,pos){const gx=snap(pos.x),gz=snap(pos.z),lx=pos.x-gx,lz=pos.z-gz;return Math.abs(lx)>Math.abs(lz)?{x:gx+Math.sign(lx||1)*2,y:0,z:gz,rotY:Math.PI/2,supportId:null,slot:`freewall:${gx}:${gz}:x`}:{x:gx,y:0,z:gz+Math.sign(lz||1)*2,rotY:0,supportId:null,slot:`freewall:${gx}:${gz}:z`};}
const MODELS={
 gridOnly:{fit:()=>({}),predict:(p,pos,rot)=>p==='foundation'?{x:snap(pos.x),y:0,z:snap(pos.z),rotY:0,supportId:null,slot:`foundation:${snap(pos.x)}:${snap(pos.z)}`}:fallback(p,pos,rot)},
 globalSupport:{fit:()=>({radius:3.2}),predict:(p,pos,rot,bs,par)=>{if(p==='foundation')return{x:snap(pos.x),y:0,z:snap(pos.z),rotY:0,supportId:null,slot:`foundation:${snap(pos.x)}:${snap(pos.z)}`};const b=nearest(bs,'foundation',pos,par.radius,x=>[{x:x.position.x,y:0,z:x.position.z,rotY:Number(rot)||0,supportId:x.id,slot:`global:${x.id}`}]);return b||fallback(p,pos,rot)}},
 relational:{fit:rows=>{let best={score:-1,wall:3.2,door:1.6,stairs:3.2};for(const wall of RADII)for(const door of RADII)for(const stairs of RADII){const par={wall,door,stairs},score=accuracy(rows,r=>MODELS.relational.predict(r.piece,r.pos,r.rot,r.buildings,par));if(score>best.score)best={score,wall,door,stairs}}return best},predict:(p,pos,rot,bs,par)=>{if(p==='foundation')return{x:snap(pos.x),y:0,z:snap(pos.z),rotY:0,supportId:null,slot:`foundation:${snap(pos.x)}:${snap(pos.z)}`};if(p==='wall'||p==='doorway')return nearest(bs,'foundation',pos,par.wall,edges)||freeWall(p,pos);if(p==='door'){const q=nearest(bs,'doorway',pos,par.door,b=>[{x:b.position.x,y:0,z:b.position.z,rotY:b.rotationY||0,supportId:b.id,slot:`door:${b.id}`}]);if(q)return q}if(p==='stairs'){const q=nearest(bs,'foundation',pos,par.stairs,b=>[{x:b.position.x,y:0,z:b.position.z,rotY:Number(rot)||0,supportId:b.id,slot:`stairs:${b.id}`}]);if(q)return q}return fallback(p,pos,rot)}}
};
function eq(a,b){return a.x===b.x&&a.y===b.y&&a.z===b.z&&Math.abs((a.rotY||0)-(b.rotY||0))<1e-9&&(a.supportId||null)===(b.supportId||null)&&a.slot===b.slot}
function accuracy(rows,pred){return rows.length?rows.reduce((n,r)=>n+(eq(pred(r),r.y)?1:0),0)/rows.length:0}
function layout(r,tag){const bs=[];for(let i=0;i<5;i++){const x=(Math.floor(r()*9)-4)*8,z=(Math.floor(r()*9)-4)*8,id=`f:${tag}:${i}`;bs.push({id,piece:'foundation',position:{x,y:0,z},rotationY:0});if(i<3){const side=Math.floor(r()*4),e=edges(bs.at(-1))[side];bs.push({id:`d:${tag}:${i}`,piece:'doorway',position:{x:e.x,y:0,z:e.z},rotationY:e.rotY})}}return bs}
function makeRows(seed,count){const r=rng(seed),rows=[];for(let i=0;i<count;i++){const buildings=layout(r,`${seed}:${i}`),piece=PIECES[i%PIECES.length],anchor=buildings[Math.floor(r()*buildings.length)].position,pos={x:anchor.x+(r()-.5)*10,y:0,z:anchor.z+(r()-.5)*10},rot=(r()-.5)*Math.PI*2;rows.push({piece,pos,rot,buildings,y:snapBuilding(piece,pos,rot,buildings)})}return rows}
function select(train){const scores={};let best=null;for(const [name,m] of Object.entries(MODELS)){const par=m.fit(train),score=accuracy(train,r=>m.predict(r.piece,r.pos,r.rot,r.buildings,par));scores[name]={score,par};if(!best||score>best.score)best={name,score,par}}return{best,scores}}
function intervene(row){const bs=row.buildings.map(b=>({...b,position:{...b.position}}));const target=bs.find(b=>b.id===row.y.supportId)||bs[0];target.position.x+=8;target.position.z-=4;return{...row,buildings:bs,y:snapBuilding(row.piece,row.pos,row.rot,bs)}}
function shuffled(row){const bs=row.buildings.map((b,i)=>({...b,piece:i%2?'foundation':'doorway'}));return{...row,buildings:bs}}
function run(){const results=[];for(const seed of SEEDS){const train=makeRows(seed,360),hold=makeRows(seed^0x9e3779b9,180),sel=select(train),m=MODELS[sel.best.name],par=sel.best.par;const holdAcc=accuracy(hold,r=>m.predict(r.piece,r.pos,r.rot,r.buildings,par));const ints=hold.map(intervene),intAcc=accuracy(ints,r=>m.predict(r.piece,r.pos,r.rot,r.buildings,par));const noChange=accuracy(ints,(r,i)=>m.predict(r.piece,r.pos,r.rot,hold[i]?.buildings||r.buildings,par));const shuf=accuracy(hold,r=>m.predict(r.piece,r.pos,r.rot,shuffled(r).buildings,par));results.push({seed,selected:sel.best.name,trainScores:sel.scores,holdAcc,intAcc,noChangeControl:noChange,shuffledLabelControl:shuf})}
 const relationalWins=results.filter(x=>x.selected==='relational').length, minHold=Math.min(...results.map(x=>x.holdAcc)),minInt=Math.min(...results.map(x=>x.intAcc)),maxNoChange=Math.max(...results.map(x=>x.noChangeControl)),maxShuffle=Math.max(...results.map(x=>x.shuffledLabelControl));
 const criterion={relationalWins,minHold,minIntervention:minInt,maxNoChangeControl:maxNoChange,maxShuffledLabelControl:maxShuffle};
 const pass=relationalWins>=5&&minHold>=.97&&minInt>=.95&&maxNoChange<=.90&&maxShuffle<=.90;
 return{experiment:'RUN_060_H3_BLIND_BUILD_CAUSAL_MODEL_SELECTION',subhypothesis:'A model family selected only from observed production snapBuilding input/output examples can identify relational support causality and predict held-out support interventions.',seedAndControl:{seeds:SEEDS,trainPerSeed:360,holdoutPerSeed:180,controls:['no-change support control','shuffled support-piece labels']},confirmation:'relational model selected on >=5/6 seeds; each holdout exact >=97%; each intervention exact >=95%; both controls <=90%.',refutation:'Any fixed threshold fails.',results,criterion,pass};}
module.exports={run,MODELS};
if(require.main===module){const out=run();console.log(JSON.stringify(out,null,2));process.exitCode=out.pass?0:2}
