const DEFAULT_TIMELINE = [
  ['cube',0,.16],['matter',.10,.36],['terrain',.24,.52],['biome',.38,.66],
  ['architecture',.50,.78],['materials',.60,.86],['lighting',.68,.93],['life',.78,1],['final',.92,1]
];

export function clamp01(v){ return Math.max(0,Math.min(1,Number(v)||0)); }
export function smoothstep(v){ const t=clamp01(v); return t*t*(3-2*t); }
export function easeOutBack(v){ const t=clamp01(v),c=1.70158; return 1+(c+1)*(t-1)**3+c*(t-1)**2; }

function hashSeed(value){
  if(Number.isInteger(value)&&value>0)return value>>>0;
  let h=2166136261;
  for(const ch of String(value||'world-evolution-v1')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}
  return h||1;
}

export function createRng(seed){
  let a=hashSeed(seed);
  return ()=>{a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};
}

function timelineOf(recipe){
  const raw=Array.isArray(recipe?.timeline)&&recipe.timeline.length?recipe.timeline:DEFAULT_TIMELINE;
  return raw.map((s)=>Array.isArray(s)?{name:s[0],start:s[1],end:s[2]}:s);
}

export function sampleTimeline(recipe,t){
  const p=clamp01(t), stages={};
  for(const stage of timelineOf(recipe)){
    const span=Math.max(.0001,Number(stage.end)-Number(stage.start));
    stages[stage.name]=smoothstep((p-Number(stage.start))/span);
  }
  return {progress:p,stages};
}

function valueNoise(x,z,seed){
  let h=(Math.imul(x|0,374761393)^Math.imul(z|0,668265263)^seed)|0;
  h=Math.imul(h^(h>>>13),1274126177);h=(h^(h>>>16))>>>0;return h/4294967295;
}

function terrainPlan(recipe,rng){
  const radius=Math.max(5,Math.min(14,Number(recipe?.terrain?.radius)||9));
  const relief=Math.max(1,Math.min(6,Number(recipe?.terrain?.relief)||3.4));
  const seed=hashSeed(recipe.seed), cells=[];
  for(let z=-radius;z<=radius;z++)for(let x=-radius;x<=radius;x++){
    const d=Math.hypot(x,z)/radius;if(d>1.08)continue;
    const n=valueNoise(x,z,seed)+valueNoise(x*2,z*2,seed+97)*.45;
    const h=Math.max(-.8,(n-.52)*relief+(1-d)*.7);
    cells.push({x:x*.72,z:z*.72,y:h-.32,scaleY:.42+.18*n,delay:rng()*.34,spin:(rng()-.5)*1.4});
  }
  return cells;
}

function scatterPlan(recipe,rng,terrain){
  const choose=()=>terrain[Math.floor(rng()*terrain.length)]||{x:0,y:0,z:0};
  const rocks=[],grass=[],trees=[];
  for(let i=0;i<(recipe.biome?.rocks||22);i++){const c=choose();rocks.push({x:c.x+(rng()-.5)*.5,y:c.y+.42,z:c.z+(rng()-.5)*.5,s:.25+rng()*.45,delay:rng()});}
  for(let i=0;i<(recipe.biome?.grass||140);i++){const c=choose();if(Math.hypot(c.x,c.z)<2.3)continue;grass.push({x:c.x+(rng()-.5)*.45,y:c.y+.42,z:c.z+(rng()-.5)*.45,s:.35+rng()*.45,phase:rng()*6.28,delay:rng()});}
  for(let i=0;i<(recipe.biome?.trees||5);i++){const a=(i/(recipe.biome?.trees||5))*Math.PI*2+rng()*.6;const r=4.4+rng()*2.2;trees.push({x:Math.cos(a)*r,z:Math.sin(a)*r,y:-.05,scale:.8+rng()*.45,delay:.12+rng()*.75});}
  return {rocks,grass,trees};
}

function architecturePlan(recipe,rng){
  const blocks=[], spacing=.52, ox=1.15, oz=-.35;
  const add=(x,y,z,kind='stone',delay=0)=>blocks.push({x:ox+x*spacing,y:.25+y*spacing,z:oz+z*spacing,kind,delay});
  for(let y=0;y<8;y++)for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++){
    const edge=Math.abs(x)===3||Math.abs(z)===3;if(!edge)continue;
    const door=z===3&&Math.abs(x)<=1&&y<=3;const window=(y===4||y===5)&&((z===3&&x===0)||(x===3&&z===0));
    if(door||window)continue;add(x,y,z,window?'glass':'stone',rng()*.5+y*.035);
  }
  for(let x=-4;x<=4;x++){add(x,8,-4,'roof',.55+rng()*.25);add(x,8,4,'roof',.55+rng()*.25);}
  for(let z=-3;z<=3;z++){add(-4,8,z,'roof',.55+rng()*.25);add(4,8,z,'roof',.55+rng()*.25);}
  for(let x=-5;x<=5;x++)if(Math.abs(x)>1)add(x,0,5,'path',rng()*.35);
  return blocks.slice(0,Math.max(48,Number(recipe.architecture?.blocks)||112));
}

function lifePlan(recipe,rng){
  const birds=[];for(let i=0;i<(recipe.life?.birds||3);i++)birds.push({radius:4.5+rng()*2,height:4.5+rng()*2,phase:rng()*6.28,speed:.45+rng()*.35});
  return {walker:{radius:2.7,speed:.52,phase:rng()*6.28},birds};
}

export function createEvolutionPlan(recipeInput={}){
  const recipe={seed:hashSeed(recipeInput.seed),terrain:{radius:9,relief:3.4,...recipeInput.terrain},biome:{trees:5,grass:140,rocks:22,...recipeInput.biome},architecture:{blocks:112,...recipeInput.architecture},life:{walkers:1,birds:3,...recipeInput.life},...recipeInput};
  const rng=createRng(recipe.seed), terrain=terrainPlan(recipe,rng), biome=scatterPlan(recipe,rng,terrain), architecture=architecturePlan(recipe,rng), life=lifePlan(recipe,rng);
  return {schemaVersion:'1.0.0',seed:recipe.seed,terrain,biome,architecture,life,quality:{semanticDetail:.84,materialRichness:.78,lightingResponse:.76,lifeMotion:.72,depthComposition:.81}};
}

export function planSignature(plan){
  let h=2166136261;const feed=(v)=>{for(const ch of String(v)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}};
  feed(plan.seed);for(const c of plan.terrain.slice(0,80))feed(`${c.x.toFixed(2)},${c.y.toFixed(2)},${c.z.toFixed(2)}`);
  for(const b of plan.architecture.slice(0,80))feed(`${b.x.toFixed(2)},${b.y.toFixed(2)},${b.kind}`);return h.toString(16).padStart(8,'0');
}
