#!/usr/bin/env node
'use strict';
const crypto=require('crypto');
const {snapBuilding,validateBuild}=require('../lib/game-rules');
const {grow,randomControl}=require('./science-h2-temporal-organized-build-growth.cjs');
const {damage,lcc}=require('./science-h2-organized-growth-damage-robustness.cjs');
const {repair,features,score}=require('./science-h2-local-repair-rule-selection.cjs');
const GRID=4,FRAC=.20,H=4,RULES=['n2','opposite','ray2','ray3'];
const HOLD=[70111,70117,70141,70157,70181,70207];
const key=(x,z)=>`${x},${z}`,dirs=[[1,0],[-1,0],[0,1],[0,-1]];
const hash=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
function localStats(occ,cx,cz,r=3){
 const cells=[];for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){if(Math.abs(dx)+Math.abs(dz)>r)continue;const x=cx+dx*GRID,z=cz+dz*GRID;if(occ.has(key(x,z)))cells.push([x,z]);}
 const set=new Set(cells.map(([x,z])=>key(x,z))),seen=new Set();let components=0,edges=0;
 for(const [sx,sz] of cells){for(const [dx,dz] of dirs)if(set.has(key(sx+dx*GRID,sz+dz*GRID)))edges++;const sk=key(sx,sz);if(seen.has(sk))continue;components++;const q=[[sx,sz]];seen.add(sk);while(q.length){const [x,z]=q.pop();for(const [dx,dz] of dirs){const nk=key(x+dx*GRID,z+dz*GRID);if(set.has(nk)&&!seen.has(nk)){seen.add(nk);q.push([x+dx*GRID,z+dz*GRID]);}}}}
 return{components,n:cells.length,edges:edges/2};
}
function maturedReward(occ,p){const s=localStats(occ,p.x,p.z,3);return(s.edges/Math.max(1,s.n))*1.5+Math.min(s.n,18)*.08-Math.max(0,s.components-1)*.8;}
function proposals(fs,occ,seed,step){const cand=new Map(),out={};for(const f of fs)for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){if(!dx&&!dz)continue;const x=f.position.x+dx*GRID,z=f.position.z+dz*GRID,k=key(x,z);if(occ.has(k)||cand.has(k))continue;cand.set(k,{x,z,ft:features(x,z,occ)});}for(const rule of RULES){let best=null;for(const c of cand.values()){const s=score(rule,c.ft);if(s<0)continue;const tie=hash(`${seed}|${step}|${rule}|${c.x}|${c.z}`);if(!best||s>best.s||(s===best.s&&tie<best.tie))best={...c,s,tie};}out[rule]=best?{piece:'foundation',position:{x:best.x,y:0,z:best.z}}:null;}return out;}
function delayedRepair(foundations,budget,seed){
 const fs=foundations.map(x=>({...x,position:{...x.position}})),stats=Object.fromEntries(RULES.map(r=>[r,{n:0,sum:0,q:0}])),pending=[],ruleUse=Object.fromEntries(RULES.map(r=>[r,0]));
 for(let step=0;step<budget;step++){const occ=new Set(fs.map(f=>key(f.position.x,f.position.z)));for(let i=pending.length-1;i>=0;i--){const p=pending[i];if(step-p.step<H)continue;const reward=maturedReward(occ,p),st=stats[p.rule];st.n++;st.sum+=reward;st.q=st.sum/st.n;pending.splice(i,1);}const ps=proposals(fs,occ,seed,step),choices=[];
  for(const rule of RULES){const cand=ps[rule];if(!cand)continue;const st=stats[rule],ucb=st.n===0?1e6:st.q+.55*Math.sqrt(Math.log(step+2)/st.n);choices.push({rule,cand,ucb,tie:hash(`${seed}|${step}|${rule}`)});}if(!choices.length)break;choices.sort((a,b)=>b.ucb-a.ucb||a.tie.localeCompare(b.tie));const pick=choices[0],sn=snapBuilding('foundation',pick.cand.position,0,fs);validateBuild('foundation',sn,sn);const pos={x:sn.x,y:0,z:sn.z};if(occ.has(key(pos.x,pos.z)))break;fs.push({id:`d:${seed}:${step}`,piece:'foundation',position:pos,rotationY:0,supportId:null,slot:sn.slot});ruleUse[pick.rule]++;pending.push({step,rule:pick.rule,x:pos.x,z:pos.z});}
 return{foundations:fs,ruleUse};
}
const mean=a=>a.reduce((s,x)=>s+x,0)/Math.max(1,a.length);
function evalSeed(seed,control=false){const grown=grow(seed,256).at(-1),base=control?randomControl(grown,seed^0x6a09e667):grown,removed=Math.floor(base.foundations.length*FRAC),d=damage(base.foundations,FRAC,seed+970),fixed=repair(d,removed,seed,'ray2'),delayed=delayedRepair(d,removed,seed);const damagedLcc=lcc(d),fixedLcc=lcc(fixed.foundations),delayedLcc=lcc(delayed.foundations);return{seed,control,damagedLcc,fixedLcc,delayedLcc,gain:delayedLcc-damagedLcc,lift:delayedLcc-fixedLcc,ruleUse:delayed.ruleUse};}
function run(){const rows=HOLD.map(seed=>{const s=evalSeed(seed,false),c=evalSeed(seed,true);return{...s,controlDelayedLcc:c.delayedLcc,ratio:s.delayedLcc/Math.max(1e-9,c.delayedLcc)};});const summary={meanDelayed:mean(rows.map(x=>x.delayedLcc)),meanFixed:mean(rows.map(x=>x.fixedLcc)),meanLift:mean(rows.map(x=>x.lift)),recovered:rows.filter(x=>x.delayedLcc>=.70).length,beatsFixed:rows.filter(x=>x.lift>=.03).length,controlLow:rows.filter(x=>x.controlDelayedLcc<=.22).length,separated:rows.filter(x=>x.ratio>=4).length,multiRule:rows.filter(x=>Object.values(x.ruleUse).filter(n=>n>0).length>=2).length};const pass=summary.recovered>=5&&summary.beatsFixed>=4&&summary.meanLift>=.05&&summary.controlLow>=5&&summary.separated>=5&&summary.multiRule===6;
 return{experiment:'RUN_070_H2_DELAYED_LOCAL_REWARD',source:'RUN_062 + RUN_066 + RUN_068; production snapBuilding/validateBuild on every accepted placement',subhypothesis:'Delayed radius-3 local reward after four later repair actions generalizes better than fixed ray2 without pristine blueprint or global LCC during decisions.',preregistration:{holdoutSeeds:HOLD,damageFraction:FRAC,horizon:H,fixedBaseline:'ray2 from RUN_068',control:'matched-density RUN_062 random control receives identical damage and policy',confirm:'>=5/6 LCC>=0.70; >=4/6 lift>=0.03; mean lift>=0.05; >=5/6 control<=0.22; >=5/6 ratio>=4; multi-rule 6/6',refute:'any criterion fails; preserve result; never retune on holdout'},rows,summary,pass};}
module.exports={run,delayedRepair,localStats,maturedReward};
if(require.main===module)console.log(JSON.stringify(run(),null,2));
