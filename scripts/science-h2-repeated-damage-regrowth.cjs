#!/usr/bin/env node
'use strict';

const { snapBuilding, validateBuild } = require('../lib/game-rules');
const { grow } = require('./science-h2-temporal-organized-build-growth.cjs');
const { damage, lcc } = require('./science-h2-organized-growth-damage-robustness.cjs');
const { growRedundant } = require('./science-h2-redundancy-during-growth.cjs');

const EXP='RUN_072_H2_REPEATED_DAMAGE_REGROWTH';
const GRID=4, INITIAL=256, DAMAGE=.20, REGROW=64, CYCLES=4;
const HOLD=[72077,72101,72139,72221,72307,72467];

function rng(seed){let x=seed>>>0||1;return()=>{x^=x<<13;x>>>=0;x^=x>>>17;x>>>=0;x^=x<<5;x>>>=0;return(x>>>0)/4294967296}}
const key=(x,z)=>`${x},${z}`;
const ns=(x,z)=>[[x+GRID,z],[x-GRID,z],[x,z+GRID],[x,z-GRID]];

function graph(fs){
  const set=new Set(fs.map(f=>key(f.position.x,f.position.z)));
  let edges=0;
  for(const f of fs)for(const [x,z] of ns(f.position.x,f.position.z))if(set.has(key(x,z)))edges++;
  edges/=2;
  const seen=new Set(); let comps=0;
  for(const s of set){
    if(seen.has(s))continue;
    comps++; const q=[s]; seen.add(s);
    while(q.length){
      const [x,z]=q.pop().split(',').map(Number);
      for(const [a,b] of ns(x,z)){
        const k=key(a,b);
        if(set.has(k)&&!seen.has(k)){seen.add(k);q.push(k)}
      }
    }
  }
  return {vertices:fs.length,edges,components:comps,cycleRank:Math.max(0,edges-fs.length+comps)};
}

function continueRedundant(start, seed, addCount){
  const r=rng(seed);
  const fs=start.map((f,i)=>({...f,id:`rr:${i}`,position:{...f.position}}));
  const occ=new Set(fs.map(f=>key(f.position.x,f.position.z)));
  const target=fs.length+addCount;
  while(fs.length<target){
    const candidates=new Map();
    for(const f of fs)for(const [x,z] of ns(f.position.x,f.position.z)){
      const k=key(x,z); if(occ.has(k))continue;
      const n=ns(x,z).filter(([a,b])=>occ.has(key(a,b))).length;
      const score=n*4-Math.hypot(x,z)/GRID*.15+r()*.75;
      const old=candidates.get(k);
      if(!old||score>old.score)candidates.set(k,{x,z,score});
    }
    const xs=[...candidates.values()].sort((a,b)=>b.score-a.score);
    const top=xs.slice(0,Math.min(8,xs.length));
    const c=top[Math.floor(r()*top.length)]||xs[0];
    if(!c)throw new Error(`redundant frontier exhausted at ${fs.length}`);
    const sn=snapBuilding('foundation',{x:c.x,z:c.z},0,fs);
    validateBuild('foundation',sn,sn);
    const k=key(sn.x,sn.z);
    if(occ.has(k))throw new Error(`duplicate snapped foundation ${k}`);
    const b={id:`rr:${fs.length}`,piece:'foundation',position:{x:sn.x,y:0,z:sn.z},rotationY:0,supportId:null,slot:sn.slot};
    fs.push(b); occ.add(k);
  }
  return fs;
}

function continueBaseline(start, seed, addCount){
  const r=rng(seed);
  const fs=start.map((f,i)=>({...f,id:`bb:${i}`,position:{...f.position}}));
  const occ=new Set(fs.map(f=>key(f.position.x,f.position.z)));
  const target=fs.length+addCount;
  while(fs.length<target){
    const m=new Map();
    for(const f of fs)for(const [x,z] of ns(f.position.x,f.position.z)){
      const k=key(x,z); if(occ.has(k))continue;
      const nc=ns(x,z).filter(([a,b])=>occ.has(key(a,b))).length;
      const rad=Math.hypot(x,z)/GRID;
      const score=rad*1.7-nc*.55+r()*2;
      const old=m.get(k);
      if(!old||score>old.score)m.set(k,{x,z,score});
    }
    const xs=[...m.values()].sort((a,b)=>b.score-a.score);
    const top=xs.slice(0,Math.min(10,xs.length));
    const c=top[Math.floor(r()*top.length)]||xs[0];
    if(!c)throw new Error(`baseline frontier exhausted at ${fs.length}`);
    const sn=snapBuilding('foundation',{x:c.x,z:c.z},0,fs);
    validateBuild('foundation',sn,sn);
    const k=key(sn.x,sn.z);
    if(occ.has(k))throw new Error(`duplicate snapped foundation ${k}`);
    const b={id:`bb:${fs.length}`,piece:'foundation',position:{x:sn.x,y:0,z:sn.z},rotationY:0,supportId:null,slot:sn.slot};
    fs.push(b); occ.add(k);
  }
  return fs;
}

function one(seed, redundant){
  let fs = redundant ? growRedundant(seed,INITIAL) : grow(seed,INITIAL).at(-1).foundations;
  const rows=[];
  for(let cycle=1;cycle<=CYCLES;cycle++){
    fs=damage(fs,DAMAGE,seed+cycle*1009);
    const afterDamageLcc=lcc(fs);
    const beforeN=fs.length;
    fs=redundant
      ? continueRedundant(fs,seed+cycle*7919,REGROW)
      : continueBaseline(fs,seed+cycle*7919,REGROW);
    rows.push({
      cycle,
      beforeN,
      afterN:fs.length,
      afterDamageLcc,
      afterRegrowLcc:lcc(fs),
      cycleRank:graph(fs).cycleRank
    });
  }
  return rows;
}

function mean(xs){return xs.reduce((a,b)=>a+b,0)/Math.max(1,xs.length)}

function run(){
  const rows=HOLD.map(seed=>{
    const redundant=one(seed,true), baseline=one(seed,false);
    return {seed,redundant,baseline};
  });
  const finalR=rows.map(x=>x.redundant.at(-1));
  const allDamage=rows.flatMap(x=>x.redundant.map(r=>r.afterDamageLcc));
  const allRegrow=rows.flatMap(x=>x.redundant.map(r=>r.afterRegrowLcc));
  const paired=rows.flatMap(x=>x.redundant.map((r,i)=>r.afterDamageLcc-x.baseline[i].afterDamageLcc));
  const summary={
    allDamageLccAtLeast090: allDamage.filter(x=>x>=.90).length,
    allRegrowLccAtLeast098: allRegrow.filter(x=>x>=.98).length,
    seedsFinalDamageLccAtLeast095: finalR.filter(x=>x.afterDamageLcc>=.95).length,
    seedsFinalRegrowLccAtLeast099: finalR.filter(x=>x.afterRegrowLcc>=.99).length,
    seedsFinalBeatsBaselineBy050: rows.filter(x=>x.redundant.at(-1).afterDamageLcc-x.baseline.at(-1).afterDamageLcc>=.50).length,
    meanDamageLiftOverBaseline: mean(paired),
    meanFinalCycleRankRatio: mean(rows.map(x=>x.redundant.at(-1).cycleRank/Math.max(1,x.baseline.at(-1).cycleRank)))
  };
  const pass=
    summary.allDamageLccAtLeast090>=22 &&
    summary.allRegrowLccAtLeast098>=22 &&
    summary.seedsFinalDamageLccAtLeast095>=5 &&
    summary.seedsFinalRegrowLccAtLeast099>=5 &&
    summary.seedsFinalBeatsBaselineBy050>=5 &&
    summary.meanDamageLiftOverBaseline>=.45 &&
    summary.meanFinalCycleRankRatio>=2.0;

  return {
    experiment:EXP,
    source:'RUN_071 redundant growth + RUN_062 baseline + RUN_066 deterministic damage/LCC + production snapBuilding/validateBuild',
    subhypothesis:'A minimal local cycle-closing growth rule retains organized connectivity through repeated 20% damage followed by continued growth, rather than being robust only to a single damage event.',
    preregistration:{
      holdoutSeeds:HOLD,initialFoundations:INITIAL,cycles:CYCLES,damageFraction:DAMAGE,regrowFoundations:REGROW,
      control:'RUN_062 original local frontier rule receives identical seeds, damage fraction, damage schedule and regrowth budget.',
      confirm:'Across 24 redundant damage events >=22 LCC>=0.90; across 24 regrowth events >=22 LCC>=0.98; final-cycle damaged LCC>=0.95 in >=5/6; final regrown LCC>=0.99 in >=5/6; final damaged lift over baseline >=0.50 in >=5/6; mean damage lift>=0.45; final cycle-rank ratio>=2.0.',
      refute:'Any confirmation criterion fails. Preserve FAIL and never retune holdout seeds.'
    },
    rows,summary,pass
  };
}

module.exports={run,continueRedundant,continueBaseline};
if(require.main===module){const r=run();console.log(JSON.stringify(r,null,2));process.exitCode=r.pass?0:2}
