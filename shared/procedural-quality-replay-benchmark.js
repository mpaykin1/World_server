(() => {
'use strict';const G=globalThis;if(G.WorldProceduralReplayBenchmark?.version==='10.0.0')return;
function create({seed=123456789}={}){
 let s=seed>>>0,events=[],recording=false,start=0;
 const rand=()=>((s=(s*1664525+1013904223)>>>0)/4294967296);
 function begin(){events=[];recording=true;start=performance.now();return seed}
 function record(type,data={}){if(recording)events.push({t:+(performance.now()-start).toFixed(3),type,data})}
 function end(){recording=false;return{version:10,seed,events:[...events],durationMs:events.at(-1)?.t||0}}
 async function play(trace,handler,{speed=1}={}){const t0=performance.now();for(const e of trace.events||[]){const wait=e.t/speed-(performance.now()-t0);if(wait>0)await new Promise(r=>setTimeout(r,wait));await handler(e)}return{played:(trace.events||[]).length,seed:trace.seed}}
 return{rand,begin,record,end,play}
}
G.WorldProceduralReplayBenchmark={version:'10.0.0',create};
})();