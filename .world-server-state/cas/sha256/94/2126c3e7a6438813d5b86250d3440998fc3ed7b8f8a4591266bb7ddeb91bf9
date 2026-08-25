(() => {
'use strict';const G=globalThis;if(G.WorldProceduralFramePacing?.version==='10.0.0')return;
const q=(a,p)=>{if(!a.length)return 0;const x=[...a].sort((a,b)=>a-b);return x[Math.min(x.length-1,Math.floor((x.length-1)*p))]};
function create({targetHz=60,maxSamples=300}={}){
 const target=1000/targetHz,s=[],long=[];let last=performance.now(),jank=0,stutter=0;
 function frame(now=performance.now()){const dt=now-last;last=now;if(dt>0&&dt<1000){s.push(dt);if(s.length>maxSamples)s.shift();if(dt>target*1.5)jank++;if(dt>target*2.5)stutter++}return snapshot()}
 function longTask(ms){if(ms>0){long.push(ms);if(long.length>80)long.shift()}}
 function snapshot(){const p50=q(s,.5),p95=q(s,.95),p99=q(s,.99),n=Math.max(1,s.length);return{version:10,targetMs:target,p50,p95,p99,jankRate:jank/n,stutterRate:stutter/n,longTaskP95:q(long,.95),stable:p95<=target*1.35&&stutter/n<.03}}
 return{frame,longTask,snapshot}
}
G.WorldProceduralFramePacing={version:'10.0.0',create};
})();