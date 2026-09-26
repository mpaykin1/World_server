// Deterministic social life, fictional faiths and named residents.
// These are world mechanics, not claims about real people or religions.
import {engine,LABELS} from './telegram-state.mjs';

export const FAITHS=Object.freeze({
  spiral:{name:'Орден Лазурной Спирали',title:'Луминарх',
    goal:'знания, свободное время и энергия',
    check:w=>w.insight.knowledge>=70&&w.insight.leisure>=65&&w.resources.power>=55},
  moss:{name:'Содружество Поющего Мха',title:'Верховный Моховед',
    goal:'здоровье, природа и гармония',
    check:w=>w.resources.ecology>=70&&w.resources.health>=65&&
      w.insight.sustainability>=65},
  lantern:{name:'Конфессия Семнадцати Фонарей',title:'Фонариарх',
    goal:'взаимопомощь, продовольствие и вода',
    check:w=>w.insight.cooperation>=70&&w.resources.food>=55&&
      w.resources.water>=55&&!w.crisis}
});
const clamp=x=>Math.max(0,Math.min(100,Math.round(x)));
const mix=(w,weights)=>clamp(Object.entries(weights).reduce((sum,[k,v])=>
  sum+(w.resources[k]??w.insight[k]??0)*v,0));
export function satisfaction(world){
  const r=world.resources;
  const groups={
    workers:mix(world,{power:.16,water:.13,food:.14,health:.16,jobs:.23,culture:.18}),
    families:mix(world,{power:.12,water:.24,food:.25,health:.25,culture:.14}),
    scholars:mix(world,{power:.22,water:.1,health:.12,knowledge:.31,culture:.25}),
    guardians:mix(world,{food:.16,water:.17,health:.25,ecology:.17,cooperation:.25}),
    naturalists:mix(world,{water:.14,health:.18,ecology:.45,culture:.23})
  };
  const happiness=clamp(Object.values(groups).reduce((a,b)=>a+b,0)/5-
    (world.crisis?12:0)-
    (world.story?.active?10:0)-
    (world.story?.ruins?.length||0)*3);
  return{happiness,groups,concerns:[
    ...(['power','water','food','health','ecology'].filter(k=>r[k]<30)),
    ...(world.story?.active?['danger']:[])
  ].slice(0,4)};
}
function seeded(seed,salt){
  let h=2166136261;for(const ch of String(seed)+salt)
    h=Math.imul(h^ch.charCodeAt(0),16777619);
  return h>>>0;
}
export function initialMap(world){
  const h=seeded(world.seed,'geography');
  const base=[
    {id:'town',kind:'city',x:18+h%34,z:25+(h>>>6)%40},
    {id:'farmland',kind:'forest',x:55+(h>>>11)%31,z:12+(h>>>17)%41},
    {id:'river',kind:'river',x:15+(h>>>13)%30,z:56+(h>>>7)%20}
  ];
  if(world.land.volcano)base.push({id:'crater',kind:'volcano',x:70,z:69});
  if(world.land.coast)base.push({id:'coast',kind:'ocean',x:8,z:78});
  return{seed:world.seed,terrain:['forest','highlands','archipelago','desert'][h%4],
    macro:base,changes:[]};
}
export function prepareWorld(world){
  const w=structuredClone(world);
  w.map??=initialMap(w);
  w.society??=satisfaction(w);
  w.beliefs??={selected:'spiral',streaks:{spiral:0,moss:0,lantern:0},
    attained:[],conversations:0};
  w.memories??=[];
  return w;
}
export function recordMemory(world,kind,text){
  world.memories??=[];
  const item={day:world.tick,kind,summary:String(text).slice(0,190)};
  world.memories.push(item);world.memories=world.memories.slice(-40);
  return item;
}
export function advanceSociety(world){
  const w=prepareWorld(world);
  w.society=satisfaction(w);
  for(const [key,faith] of Object.entries(FAITHS)){
    const value=faith.check(w);
    w.beliefs.streaks[key]=value?(w.beliefs.streaks[key]||0)+1:0;
    if(w.beliefs.streaks[key]===8&&!w.beliefs.attained.includes(key)){
      w.beliefs.attained.push(key);
      recordMemory(w,'enlightenment','Озарение: '+faith.name);
      w.history.push({tick:w.tick,kind:'fantasy_enlightenment',faith:key});
    }
  }
  // Recovery is never blocked by zero resources; citizens improvise.
  if(w.crisis&&w.resources.budget<0){
    const r=w.resources;r.food=Math.min(100,r.food+2);
    r.water=Math.min(100,r.water+2);
    recordMemory(w,'adaptation','Жители устроили обмен и общую кухню.');
  }
  return w;
}
export function setFaith(world,key){
  if(!Object.hasOwn(FAITHS,key))return null;
  const w=prepareWorld(world);
  if(w.beliefs.selected!==key){
    w.beliefs.selected=key;w.revision++;
    recordMemory(w,'faith','Жители выбрали путь: '+FAITHS[key].name);
  }
  return w;
}
export function faithDialogue(world,question=''){
  const w=prepareWorld(world),choice=w.beliefs.selected;
  const faith=FAITHS[choice],npc=w.culture.spokesperson;
  if(!npc)return'⛪ Построй три храма и дождись окончания строительства, '+
    'чтобы жители выбрали первого '+faith.title+'а.';
  const s=satisfaction(w),r=w.resources,low=
    ['power','water','food','ecology','health'].sort((a,b)=>r[a]-r[b])[0];
  const line=low==='power'?'Без света наши лучшие мысли видны лишь днём.':
    low==='water'?'Мысли прекрасны, но фонари водой не наполнишь.':
    low==='food'?'Наше великое озарение начнётся после обеда.':
    low==='ecology'?'Роща больше не разговаривает с нашим храмом.':
    'Для прозрения сначала доживём до завтра.';
  const named=npc.name+' — '+faith.title+' '+faith.name;
  const answer=/кто ты|имя|как звать/i.test(question)?'Я говорю от имени жителей.':
    /озарен|просвет|гармон/i.test(question)?
      'Наш путь: '+faith.goal+'. Восемь благополучных дней подряд.':
    /как|что делат|совет|помоги/i.test(question)?
      'Сначала помоги решить главную проблему: '+low+'.':line;
  return'🕯 '+named+'\n«'+answer+'»\nДовольство жителей: '+s.happiness+
    '/100. Путь озарения: '+w.beliefs.streaks[choice]+'/8 дней.';
}
export function residentAnswer(world,house,floor,flat){
  if(!Number.isSafeInteger(house)||!Number.isSafeInteger(floor)||
    !Number.isSafeInteger(flat)||house<1)return null;
  const actual='house-'+(house-1),npc=engine.address(world,actual,floor,flat);
  if(!npc)return null;
  return'🏠 Дом '+house+', этаж '+floor+', квартира '+flat+
    ': '+npc.name+'. Это вымышленный житель твоего мира.';
}
export function chronicle(world){
  const entries=world.memories?.slice(-8)||[];
  if(!entries.length)return'📚 Летопись пока пуста. Построй что-нибудь или измени сюжет.';
  return'📚 Летопись твоего мира:\n'+entries.map(x=>
    'День '+x.day+': '+x.summary).join('\n');
}
