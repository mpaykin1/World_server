(() => {
'use strict';
const G=globalThis;if(G.WorldProceduralPassBudget?.version==='9.0.0')return;
function percentile(a,p){if(!a.length)return 0;const x=[...a].sort((u,v)=>u-v);return x[Math.min(x.length-1,Math.floor((x.length-1)*p))]}
function create({targetMs=16.67,maxSamples=180}={}){
 const samples=[],passes=new Map();let pressure=0,lastChange=0,quality=1;
 function frame(ms){if(Number.isFinite(ms)&&ms>0&&ms<500){samples.push(ms);if(samples.length>maxSamples)samples.shift()}const p95=percentile(samples,.95),now=performance.now();
  const desired=p95>targetMs*1.45?3:p95>targetMs*1.2?2:p95>targetMs*1.04?1:p95<targetMs*.86?0:pressure;
  if(desired!==pressure&&now-lastChange>1200){pressure=desired;lastChange=now;quality=[1,.88,.72,.55][pressure]}return snapshot()}
 function record(name,ms,importance=.5){let r=passes.get(name);if(!r){r={name,samples:[],importance};passes.set(name,r)}r.importance=importance;r.samples.push(ms);if(r.samples.length>90)r.samples.shift()}
 function plan(){const list=[...passes.values()].map(r=>({name:r.name,p95:percentile(r.samples,.95),importance:r.importance})).sort((a,b)=>(a.importance-b.importance)||b.p95-a.p95);
  let over=Math.max(0,percentile(samples,.95)-targetMs),disabled=[];for(const x of list){if(over<=0||x.importance>=.9)break;disabled.push(x.name);over-=x.p95*.65}return{pressure,quality,disabled,passes:list}}
 function snapshot(){return{version:9,targetMs,p50:percentile(samples,.5),p95:percentile(samples,.95),pressure,quality,...plan()}}
 return{frame,record,plan,snapshot}
}
G.WorldProceduralPassBudget={version:'9.0.0',create};
})();