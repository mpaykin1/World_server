#!/usr/bin/env node
'use strict';

const { grow, continueGrow } = require('./science-h2-temporal-organized-build-growth.cjs');
const { damage, lcc } = require('./science-h2-organized-growth-damage-robustness.cjs');
const { growRedundant, graph, continueGrowRedundant } = require('./science-h2-redundancy-during-growth.cjs');

const EXP='RUN_072_H2_REPEATED_DAMAGE_REGROWTH';
const INITIAL=256, DAMAGE=.20, REGROW=64, CYCLES=4;
const HOLD=[72077,72101,72139,72221,72307,72467];

function one(seed,redundant){
  let fs=redundant?growRedundant(seed,INITIAL):grow(seed,INITIAL).at(-1).foundations;
  const rows=[];
  for(let cycle=1;cycle<=CYCLES;cycle++){
    fs=damage(fs,DAMAGE,seed+cycle*1009);
    const afterDamageLcc=lcc(fs),beforeN=fs.length;
    fs=redundant?continueGrowRedundant(fs,seed+cycle*7919,REGROW):continueGrow(fs,seed+cycle*7919,REGROW);
    rows.push({cycle,beforeN,afterN:fs.length,afterDamageLcc,afterRegrowLcc:lcc(fs),cycleRank:graph(fs).cycleRank});
  }
  return rows;
}
function mean(xs){return xs.reduce((a,b)=>a+b,0)/Math.max(1,xs.length)}
function run(){
  const rows=HOLD.map(seed=>({seed,redundant:one(seed,true),baseline:one(seed,false)}));
  const finalR=rows.map(x=>x.redundant.at(-1));
  const allDamage=rows.flatMap(x=>x.redundant.map(r=>r.afterDamageLcc));
  const allRegrow=rows.flatMap(x=>x.redundant.map(r=>r.afterRegrowLcc));
  const paired=rows.flatMap(x=>x.redundant.map((r,i)=>r.afterDamageLcc-x.baseline[i].afterDamageLcc));
  const summary={allDamageLccAtLeast090:allDamage.filter(x=>x>=.90).length,allRegrowLccAtLeast098:allRegrow.filter(x=>x>=.98).length,seedsFinalDamageLccAtLeast095:finalR.filter(x=>x.afterDamageLcc>=.95).length,seedsFinalRegrowLccAtLeast099:finalR.filter(x=>x.afterRegrowLcc>=.99).length,seedsFinalBeatsBaselineBy050:rows.filter(x=>x.redundant.at(-1).afterDamageLcc-x.baseline.at(-1).afterDamageLcc>=.50).length,meanDamageLiftOverBaseline:mean(paired),meanFinalCycleRankRatio:mean(rows.map(x=>x.redundant.at(-1).cycleRank/Math.max(1,x.baseline.at(-1).cycleRank)))};
  const pass=summary.allDamageLccAtLeast090>=22&&summary.allRegrowLccAtLeast098>=22&&summary.seedsFinalDamageLccAtLeast095>=5&&summary.seedsFinalRegrowLccAtLeast099>=5&&summary.seedsFinalBeatsBaselineBy050>=5&&summary.meanDamageLiftOverBaseline>=.45&&summary.meanFinalCycleRankRatio>=2.0;
  return {experiment:EXP,scientificStatus:pass?'CONFIRMED_BY_PREREGISTERED_CRITERIA':'REFUTED_BY_PREREGISTERED_CRITERIA',source:'RUN_071 exact exported continuation + RUN_062 exact exported continuation + RUN_066 deterministic damage/LCC',subhypothesis:'A minimal local cycle-closing growth rule retains organized connectivity through repeated 20% damage followed by continued growth, rather than being robust only to a single damage event.',preregistration:{holdoutSeeds:HOLD,initialFoundations:INITIAL,cycles:CYCLES,damageFraction:DAMAGE,regrowFoundations:REGROW,control:'RUN_062 original exported continuation receives identical seeds, damage fraction, damage schedule and regrowth budget.',confirm:'Across 24 redundant damage events >=22 LCC>=0.90; across 24 regrowth events >=22 LCC>=0.98; final-cycle damaged LCC>=0.95 in >=5/6; final regrown LCC>=0.99 in >=5/6; final damaged lift over baseline >=0.50 in >=5/6; mean damage lift>=0.45; final cycle-rank ratio>=2.0.',refute:'Any confirmation criterion fails. Preserve FAIL and never retune holdout seeds.'},rows,summary,pass};
}
module.exports={run};
if(require.main===module){try{const r=run();console.log(JSON.stringify(r,null,2));process.exitCode=0}catch(err){console.error(JSON.stringify({experiment:EXP,softwareFailure:true,message:err.message},null,2));process.exitCode=1}}
