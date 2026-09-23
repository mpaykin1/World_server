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
  festival:{cost:12,build:1,needs:{food:6},output:{culture:9},drain:{food:4,budget:2},risk:1}
};
const FIRST=['Арина','Борис','Вера','Глеб','Дина','Егор','Жанна','Илья','Кира','Лев'];
const LAST=['Тихая','Речной','Зорина','Каменев','Лесная','Ветров','Соколова','Горин'];
function resident(seed,building,floor,flat){
 const n=hash(seed+':'+building+':'+floor+':'+flat);
 return {id:'npc-'+n,name:FIRST[n%FIRST.length]+' '+LAST[(n>>>7)%LAST.length],building,floor,flat,fictional:true};
}
function createWorld(seed='city'){
 const n=hash(seed);const resources={power:40+n%15,water:65,food:62,budget:150,ecology:75,health:75,jobs:36,workers:18,culture:25};
 const houses=Array.from({length:5},(_,i)=>({id:'house-'+i,x:(n+i*17)%70,z:(n>>>3+i*23)%70,floors:2+i%3}));
 return {schema:1,seed:String(seed),revision:0,tick:0,resources,population:80+n%41,projects:[],history:[],houses,land:{volcano:!!(n%2),coast:!!(n%3),forest:true},insight:{knowledge:10,leisure:12,cooperation:15,sustainability:12},culture:{temples:0,spokesperson:null},crisis:false};
}
function interpretIntent(text='',structure='geothermal'){
 const t=String(text).slice(0,600).toLowerCase();
 let type=structure in PROJECTS?structure:'workshop';
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
 const next=copy(world);next.resources.budget-=plan.cost;
 for(const [k,v] of Object.entries(PROJECTS[intent.goal].needs))next.resources[k]-=v;
 const id='project-'+next.revision+'-'+hash(intent.comment+next.seed);
 next.projects.push({id,type:intent.goal,intent,remaining:plan.buildTicks,active:false,risk:plan.risk});
 if(intent.goal==='temple')next.culture.temples++;
 next.revision++;next.history.push({tick:next.tick,kind:'project_started',id,type:intent.goal,comment:intent.comment});
 return next;
}
function tick(world){
 const w=copy(world);w.tick++;w.revision++;
 const flow={power:-Math.ceil(w.population/14),water:-Math.ceil(w.population/18),food:-Math.ceil(w.population/16),budget:1,ecology:0,health:0,jobs:0,culture:0};
 for(const p of w.projects){
  if(!p.active){p.remaining--;if(p.remaining<=0){p.active=true;w.history.push({tick:w.tick,kind:'commissioned',id:p.id,type:p.type})}continue}
  const spec=PROJECTS[p.type];const available=Object.entries(spec.drain).every(([k,v])=>k==='ecology'||w.resources[k]+(flow[k]||0)>=v);
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
 if(w.culture.temples>=3&&!w.culture.spokesperson)w.culture.spokesperson=resident(w.seed,'temple-square',1,1);
 w.insight.knowledge=clamp(w.insight.knowledge+(w.resources.health>55?1:0));
 w.insight.cooperation=clamp(w.insight.cooperation+(w.crisis?2:1));
 w.insight.leisure=clamp(w.insight.leisure+(w.resources.power>45&&w.resources.food>45?1:0));
 w.insight.sustainability=clamp(w.insight.sustainability+(w.resources.ecology>65?1:0));
 w.insight.illumination=Object.values(w.insight).slice(0,4).every(x=>x>=70)&&w.resources.health>=55&&w.resources.water>=20&&w.resources.food>=20;
 return w;
}
function propose(world){
 const target=['power','water','food'].sort((a,b)=>world.resources[a]-world.resources[b])[0];
 const candidates=target==='power'?['coal','festival','tourism','solar']:target==='water'?['coal','festival','workshop','desalination']:['coal','festival','tourism','volcanic_farm'];
 const cards=candidates.map(type=>{const intent=interpretIntent('',type),plan=preview(world,intent);let after=world;
 if(plan.feasible){after=commit(world,intent);for(let i=0;i<plan.buildTicks+3;i++)after=tick(after)}
 return {type,plan,delta:after.resources[target]-world.resources[target],other:Object.fromEntries(['power','water','food','ecology','budget'].map(k=>[k,after.resources[k]-world.resources[k]]))}});
 return cards.filter(c=>c.plan.feasible).sort((a,b)=>hash(world.seed+':'+world.tick+':'+a.type)-hash(world.seed+':'+world.tick+':'+b.type));
}
function address(world,houseId,floor,flat){const h=world.houses.find(h=>h.id===houseId);if(!h||floor<1||floor>h.floors||flat<1||flat>8)return null;return resident(world.seed,houseId,floor,flat)}
module.exports={PROJECTS,createWorld,interpretIntent,preview,commit,tick,propose,address,resident};
