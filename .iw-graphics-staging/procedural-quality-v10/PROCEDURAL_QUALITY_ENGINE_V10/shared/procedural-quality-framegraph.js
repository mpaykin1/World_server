(() => {
'use strict';const G=globalThis;if(G.WorldProceduralFrameGraph)return;
function create({budgetMs=16.67}={}){
  const passes=new Map(),timings=new Map();
  function add(name,{deps=[],critical=false,quality=1,costMs=1,enabled=()=>true,execute=async()=>{}}={}){
    passes.set(name,{name,deps:[...deps],critical,quality,costMs,enabled,execute});return api;
  }
  function sample(name,ms){const a=timings.get(name)||[];a.push(Math.max(0,Number(ms)||0));if(a.length>60)a.shift();timings.set(name,a)}
  function estimate(name){const a=timings.get(name);if(!a?.length)return passes.get(name)?.costMs||0;const s=[...a].sort((x,y)=>x-y);return s[Math.floor((s.length-1)*.9)]}
  function topo(names){
    const want=new Set(names),out=[],temp=new Set(),done=new Set();
    function visit(n){if(done.has(n)||!want.has(n))return;if(temp.has(n))throw new Error('framegraph cycle '+n);temp.add(n);for(const d of passes.get(n)?.deps||[])if(want.has(d))visit(d);temp.delete(n);done.add(n);out.push(n)}
    for(const n of want)visit(n);return out;
  }
  function plan(context={}){
    const list=[...passes.values()].filter(p=>p.enabled(context));
    const selected=new Set(list.filter(p=>p.critical).map(p=>p.name));
    const ranked=list.filter(p=>!p.critical).sort((a,b)=>(b.quality/Math.max(.05,estimate(b.name)))-(a.quality/Math.max(.05,estimate(a.name))));
    let used=[...selected].reduce((s,n)=>s+estimate(n),0);
    for(const p of ranked){
      const needs=[p.name,...p.deps].filter(n=>passes.has(n));
      const extra=needs.filter(n=>!selected.has(n)).reduce((s,n)=>s+estimate(n),0);
      if(used+extra<=budgetMs){for(const n of needs)selected.add(n);used+=extra}
    }
    return{passes:topo([...selected]),estimatedMs:+used.toFixed(3),budgetMs};
  }
  async function run(context={}){
    const p=plan(context),results={};
    for(const name of p.passes){const pass=passes.get(name),t=performance.now();results[name]=await pass.execute(context,results);sample(name,performance.now()-t)}
    return{...p,results};
  }
  function setBudget(ms){budgetMs=Math.max(2,Number(ms)||16.67)}
  const api={add,sample,estimate,plan,run,setBudget,get budgetMs(){return budgetMs}};
  return api;
}
G.WorldProceduralFrameGraph={version:'6.0.0',create};
})();
