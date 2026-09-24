'use strict';
// World Consequence Engine: deterministic simulation; no LLM may modify its arithmetic.
const hash=s=>{let h=2166136261;for(const c of String(s)){h=Math.imul(h^c.charCodeAt(0),16777619)}return h>>>0};
const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,n));
const copy=x=>JSON.parse(JSON.stringify(x));
const PROJECTS={
  geothermal:{cost:90,build:4,needs:{water:12,workers:8},output:{power:36,jobs:8},drain:{water:3,budget:3},risk:3},
  tourism:{cost:45,build:2,needs:{water:5,workers:5},output:{budget:12,jobs:6},drain:{water:2,power:3},risk:5},
  volcanic_farm:{cost:35,build:3,needs:{water:14,workers:6},output:{food:24,jobs:5},drain:{water:5,power:2},risk:4},
  solar:{cost:40,build:2,needs:{workers:3},output:{power:16,jobs:2},drain:{budget:1},risk:1},
  temple:{cost:24,build:2,needs:{workers:3},output:{culture:7,jobs:2},drain:{budget:1},risk:1},
  workshop:{cost:20,build:2,needs:{workers:4},output:{jobs:7,budget:4},drain:{power:4,water:2},risk:1},
  desalination:{cost:70,build:3,needs:{workers:5,power:12},output:{water:22,jobs:4},drain:{power:9,budget:2},risk:2},
  coal:{cost:35,build:2,needs:{workers:4},output:{power:30,jobs:6},drain:{ecology:8,budget:3},risk:5},
  festival:{cost:12,build:1,needs:{food:6},output:{culture:9},drain:{food:4,budget:2},risk:1},
  water_recycling:{cost:42,build:2,needs:{workers:4,power:5},output:{water:14,jobs:2},drain:{power:3,budget:1},risk:1},
  deep_wells:{cost:38,build:2,needs:{workers:4,power:6},output:{water:24,jobs:3},drain:{power:10,ecology:6,budget:2},risk:4},
  greenhouse:{cost:46,build:3,needs:{workers:5,power:4,water:4},output:{food:18,jobs:4},drain:{power:2,water:2,budget:1},risk:2},
  intensive_farm:{cost:34,build:2,needs:{workers:5,water:10},output:{food:30,jobs:5},drain:{water:8,ecology:7,budget:2},risk:4},
  export_market:{cost:18,build:1,needs:{workers:2,food:8},output:{budget:10,jobs:2},drain:{food:6,power:2},risk:2},
  luxury_arcology:{cost:35,build:2,needs:{workers:4,power:15,water:4},output:{jobs:6,culture:5},drain:{power:6,water:2,budget:2},risk:2},
  automated_mine:{cost:30,build:2,needs:{workers:3,power:16},output:{budget:8,jobs:5},drain:{power:6,ecology:3},risk:3},
  water_park:{cost:28,build:2,needs:{workers:4,water:18},output:{budget:8,culture:4},drain:{water:6,power:3},risk:2},
  bottling_plant:{cost:24,build:2,needs:{workers:3,water:16},output:{budget:7,jobs:3},drain:{water:5,power:2,ecology:2},risk:2},
  biofuel_refinery:{cost:32,build:2,needs:{workers:4,food:16},output:{power:10,jobs:4},drain:{food:7,water:3,ecology:4},risk:3},
  livestock_export:{cost:24,build:2,needs:{workers:3,food:18},output:{budget:9,jobs:3},drain:{food:6,water:3},risk:2}
};
const FIRST=['Арина','Борис','Вера','Глеб','Дина','Егор','Жанна','Илья','Кира','Лев'];
const LAST=['Тихая','Речной','Зорина','Каменев','Лесная','Ветров','Соколова','Горин'];
const INSIGHT_STREAK_REQUIRED=8;
function resident(seed,building,floor,flat){
 const n=hash(seed+':'+building+':'+floor+':'+flat);
 return {id:'npc-'+hash(seed)+'-'+building+'-'+floor+'-'+flat,name:FIRST[n%FIRST.length]+' '+LAST[(n>>>7)%LAST.length],building,floor,flat,fictional:true};
}
function residentDirectory(seed,houses){
 return houses.flatMap(house=>Array.from({length:house.floors},(_,floorIndex)=>
  Array.from({length:8},(_,flatIndex)=>resident(seed,house.id,floorIndex+1,flatIndex+1))).flat());
}
function canonicalResidents(world){
 const expected=residentDirectory(world.seed,world.houses);
 if(!Array.isArray(world.residents)||world.residents.length!==expected.length)return expected;
 const valid=expected.every((canonical,index)=>{
  const stored=world.residents[index];
  return stored&&stored.id===canonical.id&&stored.name===canonical.name&&stored.building===canonical.building&&
   stored.floor===canonical.floor&&stored.flat===canonical.flat&&stored.fictional===true;
 });
 return valid?world.residents:expected;
}
function ensureResidents(world){
 world.residents=canonicalResidents(world);
 return world.residents;
}
function createWorld(seed='city'){
 const n=hash(seed);const resources={power:40+n%15,water:65,food:62,budget:150,ecology:75,health:75,jobs:36,workers:18,culture:25};
 const houses=Array.from({length:5},(_,i)=>({id:'house-'+i,x:(n+i*17)%70,z:(n>>>3+i*23)%70,floors:2+i%3}));
 const residents=residentDirectory(String(seed),houses);
 return {schema:1,seed:String(seed),revision:0,tick:0,resources,population:80+n%41,projects:[],history:[],houses,residents,land:{volcano:!!(n%2),coast:!!(n%3),forest:true},insight:{knowledge:10,leisure:12,cooperation:15,sustainability:12,harmonyTicks:0,illumination:false,illuminationAtTick:null},culture:{temples:0,spokesperson:null},crisis:false};
}
function interpretIntent(text='',structure='geothermal'){
 const t=String(text).slice(0,600).toLowerCase();
 let type=Object.hasOwn(PROJECTS,structure)?structure:'workshop';
 if(/туризм|турист|экскурс/.test(t))type='tourism';
 else if(/теплиц|ферм|почв|урожа/.test(t))type='volcanic_farm';
 else if(/геотерм|электр|энерг|тепло/.test(t))type='geothermal';
 else if(/храм|святилищ|озарен/.test(t))type='temple';
 else if(/опресн/.test(t))type='desalination';
 else if(/солнечн/.test(t))type='solar';
 const cautious=/поэтап|исследован|эксперт|страхов|эвакуац|осторож/.test(t);
 const reckless=/взорв|без провер|немедлен|любой ценой/.test(t);
 return {goal:type,mechanism:type,resources:copy(PROJECTS[type].needs),assumptions:{cautious,reckless},timeline:PROJECTS[type].build+(cautious?1:0),expected:copy(PROJECTS[type].output),uncertainty:reckless?'high':cautious?'lower':'medium',comment:String(text).slice(0,600)};
}
function preview(world,intent){
 const p=PROJECTS[intent.goal];if(!p)throw Error('Unknown project');
 const cost=p.cost+(intent.assumptions.cautious?12:0);
 const missing=Object.entries({...p.needs,budget:cost}).filter(([k,v])=>(world.resources[k]||0)<v).map(([k,v])=>({resource:k,required:v,available:world.resources[k]||0}));
 if(intent.goal==='geothermal'&&!world.land.volcano)missing.push({resource:'volcano',required:1,available:0});
 if(intent.goal==='desalination'&&!world.land.coast)missing.push({resource:'coast',required:1,available:0});
 return {intent,cost,buildTicks:intent.timeline,missing,feasible:missing.length===0,risk:p.risk+(intent.assumptions.reckless?5:0)-(intent.assumptions.cautious?1:0),output:copy(p.output),drain:copy(p.drain)};
}
function commit(world,intent,expectedRevision=world.revision){
 if(expectedRevision!==world.revision)throw Error('STALE_REVISION');
 const plan=preview(world,intent);if(!plan.feasible)throw Error('INSUFFICIENT_RESOURCES');
 const next=copy(world);ensureResidents(next);next.resources.budget-=plan.cost;
 for(const [k,v] of Object.entries(PROJECTS[intent.goal].needs))next.resources[k]-=v;
 // A public ID must not fingerprint private player text: seed is public and a
 // short text hash would permit dictionary guessing.
 const publicIdentity=[next.seed,next.revision,intent.goal,intent.mechanism,
  intent.assumptions.cautious?'cautious':'standard',intent.assumptions.reckless?'reckless':'bounded'].join(':');
 const id='project-'+next.revision+'-'+hash(publicIdentity);
 next.projects.push({id,type:intent.goal,intent,remaining:plan.buildTicks,active:false,risk:plan.risk,
  workersReserved:PROJECTS[intent.goal].needs.workers||0,workersReleased:false});
 next.revision++;next.history.push({tick:next.tick,kind:'project_started',id,type:intent.goal,comment:intent.comment});
 return next;
}
function tick(world){
 const w=copy(world);ensureResidents(w);w.tick++;w.revision++;
 const flow={power:-Math.ceil(w.population/14),water:-Math.ceil(w.population/18),food:-Math.ceil(w.population/16),budget:1,ecology:0,health:0,jobs:0,culture:0};
 for(const p of w.projects){
  const spec=PROJECTS[p.type];
  if(p.active&&p.workersReleased===undefined){
   const legacyReserved=spec.needs.workers||0;p.workersReserved=legacyReserved;p.workersReleased=true;
   if(legacyReserved>0){w.resources.workers=Math.min(w.population,(w.resources.workers||0)+legacyReserved);
    w.history.push({tick:w.tick,kind:'builders_released',id:p.id,count:legacyReserved,legacy:true})}
  }
  if(!p.active){p.remaining--;if(p.remaining<=0){
   p.active=true;
   const reserved=Number.isSafeInteger(p.workersReserved)?p.workersReserved:(spec.needs.workers||0);
   if(!p.workersReleased&&reserved>0){w.resources.workers=Math.min(w.population,(w.resources.workers||0)+reserved);p.workersReleased=true;
    w.history.push({tick:w.tick,kind:'builders_released',id:p.id,count:reserved})}
   if(p.type==='temple')w.culture.temples++;w.history.push({tick:w.tick,kind:'commissioned',id:p.id,type:p.type})
  }continue}
  const available=Object.entries(spec.drain).every(([k,v])=>k==='ecology'||w.resources[k]+(flow[k]||0)>=v);
  if(!available){w.history.push({tick:w.tick,kind:'resource_shortage',id:p.id});continue}
  for(const [k,v] of Object.entries(spec.output))flow[k]=(flow[k]||0)+v;
  for(const [k,v] of Object.entries(spec.drain))flow[k]=(flow[k]||0)-v;
  if(p.risk>=5&&hash(w.seed+':'+w.tick+':'+p.id)%13===0){flow.ecology-=7;w.history.push({tick:w.tick,kind:'accident',id:p.id})}
 }
 for(const [k,v] of Object.entries(flow))w.resources[k]=clamp((w.resources[k]||0)+v, k==='budget'?-10000:0,k==='budget'?100000:100);
 const deficit=['power','water','food'].filter(k=>w.resources[k]<15);
 w.crisis=deficit.length>0;
 if(w.crisis){w.population=Math.max(1,w.population-1);w.resources.health=clamp(w.resources.health-2);w.history.push({tick:w.tick,kind:'adaptation',deficit,story:'Жители организуют взаимопомощь и ищут альтернативные источники.'})}
 else{w.resources.health=clamp(w.resources.health+1);if(w.resources.food>45&&w.resources.water>45)w.population++}
 if(w.culture.temples>=3){
  const current=w.culture.spokesperson;
  const currentResident=current&&w.residents.find(npc=>npc.id===current.id&&npc.name===current.name&&
   npc.building===current.building&&npc.floor===current.floor&&npc.flat===current.flat&&current.role==='temple_spokesperson');
  if(!currentResident){
   const spokesperson=w.residents[hash(w.seed+':temple-spokesperson')%w.residents.length];
   w.culture.spokesperson={...spokesperson,role:'temple_spokesperson'};
  }
 }
 w.insight.knowledge=clamp(w.insight.knowledge+(w.resources.health>55?1:0));
 w.insight.cooperation=clamp(w.insight.cooperation+(w.crisis?2:1));
 w.insight.leisure=clamp(w.insight.leisure+(w.resources.power>45&&w.resources.food>45?1:0));
 w.insight.sustainability=clamp(w.insight.sustainability+(w.resources.ecology>65?1:0));
 const insightReady=['knowledge','leisure','cooperation','sustainability'].every(k=>w.insight[k]>=70)&&
  w.resources.health>=55&&w.resources.water>=20&&w.resources.food>=20;
 const priorStreak=Number.isSafeInteger(w.insight.harmonyTicks)&&w.insight.harmonyTicks>=0?w.insight.harmonyTicks:0;
 w.insight.harmonyTicks=insightReady?Math.min(INSIGHT_STREAK_REQUIRED,priorStreak+1):0;
 w.insight.illumination=w.insight.harmonyTicks>=INSIGHT_STREAK_REQUIRED;
 if(w.insight.illumination&&!Number.isSafeInteger(w.insight.illuminationAtTick)){
  w.insight.illuminationAtTick=w.tick;
  w.history.push({tick:w.tick,kind:'sustained_insight',streak:INSIGHT_STREAK_REQUIRED});
 }
 return w;
}
const GENIE_CANDIDATES={
 power:['luxury_arcology','automated_mine','coal','solar'],
 water:['water_park','bottling_plant','deep_wells','water_recycling'],
 food:['biofuel_refinery','livestock_export','intensive_farm','greenhouse']
};
function simulateTicks(world,count){let next=copy(world);for(let i=0;i<count;i++)next=tick(next);return next}
function evaluateProposal(world,type,target,horizon){
 const intent=interpretIntent('',type),plan=preview(world,intent);
 if(!plan.feasible)return {type,plan,category:'infeasible',reason:'missing_resources'};
 const ticks=Number.isInteger(horizon)&&horizon>0?horizon:plan.buildTicks+1;
 const baseline=simulateTicks(world,ticks);
 const after=simulateTicks(commit(world,intent),ticks);
 const tracked=['power','water','food','ecology','health','budget'];
 const other=Object.fromEntries(tracked.map(k=>[k,after.resources[k]-baseline.resources[k]]));
 const delta=other[target];
 const severe=tracked.filter(k=>k!==target&&(
  (k==='budget'&&after.resources[k]<0)||
  (k==='ecology'&&other[k]<=-6)||
  (k!=='budget'&&k!=='ecology'&&(other[k]<=-12||(['power','water','food','health'].includes(k)&&after.resources[k]<15)))
 ));
 let category='neutral';
 if(delta<=-2)category='worsens';
 else if(delta>=4&&severe.length)category='shifts_crisis';
 else if(delta>=4&&severe.length===0)category='balanced';
 return {type,plan,category,target,delta,other,severe,afterRevision:after.revision,history:after.history.slice(-12)};
}
function proposeGenieCards(world){
 const target=['power','water','food'].sort((a,b)=>world.resources[a]-world.resources[b])[0];
 const evaluated=GENIE_CANDIDATES[target].map(type=>evaluateProposal(world,type,target));
 const order=(items)=>items.sort((a,b)=>hash(world.seed+':'+world.tick+':'+a.type)-hash(world.seed+':'+world.tick+':'+b.type));
 const selected=[
  ...order(evaluated.filter(x=>x.category==='worsens')).slice(0,2),
  ...order(evaluated.filter(x=>x.category==='shifts_crisis')).slice(0,1),
  ...order(evaluated.filter(x=>x.category==='balanced')).slice(0,1)
 ];
 const need={worsens:2,shifts_crisis:1,balanced:1};
 const counts=selected.reduce((m,c)=>(m[c.category]=(m[c.category]||0)+1,m),{});
 const missingCategories=Object.entries(need).flatMap(([category,n])=>Array(Math.max(0,n-(counts[category]||0))).fill(category));
 return {target,cards:order(selected),degraded:missingCategories.length>0,missingCategories,evaluated:evaluated.map(({type,category,delta,severe,plan})=>({type,category,delta,severe,feasible:plan.feasible}))};
}
function genieOptions(world){
 const proposal=proposeGenieCards(world);
 const cards=proposal.cards.map((card,index)=>({
  id:'genie-'+world.revision+'-'+index+'-'+hash([world.seed,world.revision,world.tick,card.type].join(':')),
  structure:card.type,
  plan:{cost:card.plan.cost,buildTicks:card.plan.buildTicks,risk:card.plan.risk,output:copy(card.plan.output),drain:copy(card.plan.drain)},
  forecast:{target:proposal.target,targetDelta:card.delta,resourceDeltas:copy(card.other),severe:copy(card.severe),afterRevision:card.afterRevision,
   consequenceKinds:[...new Set(card.history.map(event=>event.kind))]}
 }));
 return {target:proposal.target,cards,degraded:proposal.degraded,offeredCount:cards.length,
  fifth:{id:'free-design',kind:'free_intent',acceptsFreeText:true,maxTextLength:600,
   supportedStructures:Object.keys(PROJECTS).sort()}};
}
function propose(world){return proposeGenieCards(world).cards}
function address(world,houseId,floor,flat){
 const h=world.houses.find(house=>house.id===houseId);
 if(!h||!Number.isInteger(floor)||!Number.isInteger(flat)||floor<1||floor>h.floors||flat<1||flat>8)return null;
 const residents=canonicalResidents(world);
 return residents.find(npc=>npc.building===houseId&&npc.floor===floor&&npc.flat===flat)||null;
}
const worldConsequenceEngine={PROJECTS,createWorld,interpretIntent,preview,commit,tick,propose,proposeGenieCards,genieOptions,evaluateProposal,simulateTicks,address,resident,residentDirectory};
// One arithmetic implementation serves Node and the Supabase Edge adapter.
// The global export keeps the file executable as a Deno side-effect import;
// CommonJS remains the canonical Node/test interface.
if(typeof globalThis!=='undefined')globalThis.WorldConsequenceEngine=worldConsequenceEngine;
if(typeof module!=='undefined'&&module.exports)module.exports=worldConsequenceEngine;
