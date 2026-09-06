#!/usr/bin/env node
'use strict';
const crypto=require('crypto');
const {snapBuilding,validateBuild}=require('../lib/game-rules');
const {grow,randomControl}=require('./science-h2-temporal-organized-build-growth.cjs');
const {damage,lcc}=require('./science-h2-organized-growth-damage-robustness.cjs');
const {repair,features,score}=require('./science-h2-local-repair-rule-selection.cjs');

const EXP='RUN_069_H2_ADAPTIVE_LOCAL_REPAIR_GRAMMAR';
const GRID=4,FRAC=.20,RULES=['n2','opposite','ray2','ray3'];
const TRAIN=[69001,69017,69031,69061,69073,69109];
const HOLD=[69191,69221,69239,69257,69271,69313];
const key=(x,z)=>`${x},${z}`;
const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
const h=s=>crypto.createHash('sha256').update(String(s)).digest('hex');

function localComponents(occ,cx,cz,r=3){
  const cells=[];
  for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
    if(Math.abs(dx)+Math.abs(dz)>r)continue;
    const x=cx+dx*GRID,z=cz+dz*GRID;
    if(occ.has(key(x,z)))cells.push([x,z]);
  }
  const set=new Set(cells.map(([x,z])=>key(x,z))),seen=new Set();let comps=0;
  for(const [sx,sz] of cells){const sk=key(sx,sz);if(seen.has(sk))continue;comps++;const q=[[sx,sz]];seen.add(sk);
    while(q.length){const [x,z]=q.pop();for(const [dx,dz] of dirs){const nk=key(x+dx*GRID,z+dz*GRID);if(set.has(nk)&&!seen.has(nk)){seen.add(nk);q.push([x+dx*GRID,z+dz*GRID])}}}}
  return comps;
}
function localReward(beforeOcc,candidate){
  const {x,z}=candidate.position,pre=localComponents(beforeOcc,x,z,3),f=features(x,z,beforeOcc);
  const after=new Set(beforeOcc);after.add(key(x,z));const post=localComponents(after,x,z,3);
  const merges=Math.max(0,pre-post);
  return merges*4+f.opp*2+Math.min(3,f.card)*.75+Math.min(2,f.ray2)*.35+Math.min(2,f.ray3)*.15;
}
function proposals(foundations,occ,seed,step){
  const byRule=Object.fromEntries(RULES.map(r=>[r,null]));
  const cand=new Map();
  for(const f of foundations)for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){
    if(!dx&&!dz)continue;
    const x=f.position.x+dx*GRID,z=f.position.z+dz*GRID,k=key(x,z);
    if(occ.has(k)||cand.has(k))continue;
    cand.set(k,{x,z,ft:features(x,z,occ),tie:h(`${seed}|${step}|${x}|${z}`)});
  }
  for(const rule of RULES){
    let best=null;
    for(const c of cand.values()){
      const s=score(rule,c.ft);
      if(s<0)continue;
      if(!best||s>best.s||(s===best.s&&c.tie<best.tie))best={...c,s};
    }
    if(best)byRule[rule]={id:`a:${seed}:${rule}:${step}`,piece:'foundation',position:{x:best.x,y:0,z:best.z},rotationY:0,supportId:null,slot:'grid'};
  }
  return byRule;
}
function adaptiveRepair(foundations,budget,seed){
  let fs=foundations.map(x=>({...x,position:{...x.position}}));
  const stats=Object.fromEntries(RULES.map(r=>[r,{n:0,sum:0,q:0}]));
  const trace=[];
  for(let step=0;step<budget;step++){
    const occ=new Set(fs.map(f=>key(f.position.x,f.position.z)));
    const candidates=[], props=proposals(fs,occ,seed,step);
    for(const rule of RULES){
      const cand=props[rule];if(!cand)continue;
      const reward=localReward(occ,cand),st=stats[rule];
      const ucb=st.n===0?1e6:st.q+0.55*Math.sqrt(Math.log(step+2)/st.n);
      candidates.push({rule,cand,reward,ucb,tie:h(`${seed}|${step}|${rule}`)});
    }
    if(!candidates.length)break;
    candidates.sort((a,b)=>b.ucb-a.ucb||b.reward-a.reward||a.tie.localeCompare(b.tie));
    const pick=candidates[0],sn=snapBuilding('foundation',{x:pick.cand.position.x,z:pick.cand.position.z},0,fs);
    validateBuild('foundation',sn,sn);
    const f={...pick.cand,position:{x:sn.x,y:0,z:sn.z},rotationY:0};
    if(occ.has(key(f.position.x,f.position.z)))break;
    fs.push(f);
    const st=stats[pick.rule];st.n++;st.sum+=pick.reward;st.q=st.sum/st.n;
    trace.push({step,rule:pick.rule,reward:pick.reward,q:st.q,x:f.position.x,z:f.position.z});
  }
  return{foundations:fs,added:fs.length-foundations.length,stats,trace};
}
function evalSeed(seed,control=false){
  const grown=grow(seed,256).at(-1),base=control?randomControl(grown,seed^0x9e3779b9):grown;
  const removed=Math.floor(base.foundations.length*FRAC),d=damage(base.foundations,FRAC,seed+969);
  const fixed=repair(d,removed,seed,'ray2'),adapt=adaptiveRepair(d,removed,seed);
  return{seed,control,damagedLcc:lcc(d),fixedLcc:lcc(fixed.foundations),adaptiveLcc:lcc(adapt.foundations),
    fixedGain:lcc(fixed.foundations)-lcc(d),adaptiveGain:lcc(adapt.foundations)-lcc(d),
    adaptiveVsFixed:lcc(adapt.foundations)-lcc(fixed.foundations),added:adapt.added,ruleUse:Object.fromEntries(RULES.map(r=>[r,adapt.stats[r].n]))};
}
function mean(a){return a.reduce((s,x)=>s+x,0)/a.length}
function run(){
  const train=TRAIN.map(seed=>evalSeed(seed,false));
  const rows=HOLD.map(seed=>{const structured=evalSeed(seed,false),control=evalSeed(seed,true);return{...structured,controlAdaptiveLcc:control.adaptiveLcc,ratio:structured.adaptiveLcc/Math.max(1e-9,control.adaptiveLcc)}});
  const summary={
    meanAdaptive:mean(rows.map(x=>x.adaptiveLcc)),meanFixed:mean(rows.map(x=>x.fixedLcc)),
    meanLift:mean(rows.map(x=>x.adaptiveVsFixed)),
    recovered:rows.filter(x=>x.adaptiveLcc>=.70).length,
    beatsFixed:rows.filter(x=>x.adaptiveVsFixed>=.03).length,
    controlLow:rows.filter(x=>x.controlAdaptiveLcc<=.22).length,
    separated:rows.filter(x=>x.ratio>=4).length,
    multiRule:rows.filter(x=>Object.values(x.ruleUse).filter(n=>n>0).length>=2).length
  };
  const pass=summary.recovered>=5&&summary.beatsFixed>=4&&summary.meanLift>=.05&&summary.controlLow>=5&&summary.separated>=5&&summary.multiRule===6;
  return{
    experiment:EXP,
    source:'RUN_062 production growth + RUN_068 local rules + lib/game-rules.js snapBuilding/validateBuild on every accepted repair',
    subhypothesis:'A local online grammar that changes among minimal repair rules using only realized neighborhood-level repair reward can generalize better than the best fixed RUN_068 rule, without access to the original blueprint or global connectivity during decisions.',
    preregistration:{
      trainingSeeds:TRAIN,holdoutSeeds:HOLD,damageFraction:FRAC,
      fixedBaseline:'ray2 from RUN_068',
      adaptiveSignal:'radius-3 local connected-component merge + local cardinal/opposite/ray-gap features only; no global LCC and no pristine blueprint',
      control:'matched-density RUN_062 random control receives the identical adaptive algorithm and damage budget',
      confirm:'blind HOLD: >=5/6 adaptive LCC>=0.70; >=4/6 adaptive-fixed lift>=0.03; mean lift>=0.05; >=5/6 control LCC<=0.22; >=5/6 structured/control ratio>=4; >=2 rules used in 6/6',
      refute:'any confirmation criterion fails; preserve result and do not retune on HOLD'
    },train,rows,summary,pass
  };
}
module.exports={run,adaptiveRepair,localReward,localComponents};
if(require.main===module){const r=run();console.log(JSON.stringify(r,null,2));process.exitCode=r.pass?0:2}
