(() => {
'use strict';const G=globalThis;if(G.WorldProceduralBudgetController)return;
function percentile(a,p){if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor((s.length-1)*p))]}
function create({targetFps=60,windowSize=180}={}){
  const frames=[],passes=new Map();let level=2,lastChange=0;
  function frame(ms){frames.push(Math.max(.1,Number(ms)||0));if(frames.length>windowSize)frames.shift()}
  function pass(name,ms){const a=passes.get(name)||[];a.push(Math.max(0,Number(ms)||0));if(a.length>60)a.shift();passes.set(name,a)}
  function stats(){return{p50:+percentile(frames,.5).toFixed(2),p95:+percentile(frames,.95).toFixed(2),p99:+percentile(frames,.99).toFixed(2),samples:frames.length,targetMs:+(1000/targetFps).toFixed(2)}}
  function decide(now=Date.now()){
    const s=stats(),budget=1000/targetFps;if(frames.length<30)return{level,change:0,...s};
    if(now-lastChange<4000)return{level,change:0,...s};
    let d=0;if(s.p95>budget*1.18)d=-1;else if(s.p95<budget*.82&&s.p50<budget*.68)d=1;
    const next=Math.max(0,Math.min(3,level+d));if(next!==level){level=next;lastChange=now}
    return{level,change:d,...s};
  }
  function passP95(name){return percentile(passes.get(name)||[],.95)}
  return{frame,pass,stats,decide,passP95,get level(){return level}};
}
G.WorldProceduralBudgetController={version:'6.0.0',create};
})();
