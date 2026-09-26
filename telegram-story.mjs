// Telegram owns story presentation/state; the canonical shared engine owns
// every resource and population calculation for events and day aftermath.
import {engine,applyPlan,LABELS} from './telegram-state.mjs';
import {classifyStoryText,STORY_ACTIONS,supportedBuildType} from './telegram-story-parse.mjs';

const THREATS=new Set(['dragon_fire','fire','flood','storm','earthquake',
  'meteor','epidemic','attack','drought']);
const BURNING=new Set(['dragon_fire','fire']);
const TITLE={
  dragon_fire:'🐉 Дракон сжёг часть города!',
  dragon_help:'🐉 Дракон принёс неожиданный подарок.',
  dragon_arrival:'🐉 Над городом появился дракон.',
  fire:'🔥 В городе вспыхнул пожар.',flood:'🌊 Наводнение!',
  storm:'🌪️ Город накрыл ураган.',earthquake:'🌋 Землетрясение!',
  meteor:'☄️ Метеорит ударил по окрестностям.',
  epidemic:'🦠 По городу распространяется эпидемия.',
  attack:'⚔️ На город напали.',drought:'☀️ Началась засуха.',
  rain:'🌧️ Пошёл дождь.',forest:'🌲 Появились новые леса.',
  festival:'🎉 В городе праздник.',trade:'🚚 Оживилась торговля.',
  rescue:'🚑 Жителям оказали помощь.',
  unknown:'📜 Новый поворот сюжета.'
};
const storyState=world=>world.story||{active:null,ruins:[],last:null,evacuated:0};
function damagedTarget(world,text){
  const projects=world.projects;
  let p=null;
  if(/комплекс|туризм|отел|гостиниц/i.test(text))
    p=[...projects].reverse().find(x=>['tourism','luxury_arcology','water_park'].includes(x.type));
  if(!p&&/солнеч|панел/i.test(text))
    p=[...projects].reverse().find(x=>x.type==='solar');
  if(!p&&/мастерск|завод/i.test(text))
    p=[...projects].reverse().find(x=>['workshop','bottling_plant'].includes(x.type));
  return p||[...projects].reverse().find(x=>x.active)||projects.at(-1)||null;
}
function destroyStructure(next,text,source){
  const p=damagedTarget(next,text),ruins=next.story.ruins;
  if(p){
    next.projects=next.projects.filter(x=>x.id!==p.id);
    if(!p.active&&!p.workersReleased){
      const released=engine.applyResourceDelta(next,{workers:p.workersReserved||0});
      next.resources.workers=released.resources.workers;
    }
    ruins.push({id:p.id,type:p.type,name:LABELS[p.type]||p.type,source,rebuilding:null});
    return LABELS[p.type]||p.type;
  }
  const house=next.houses.pop();
  if(house){
    next.residents=next.residents.filter(x=>x.building!==house.id);
    ruins.push({id:house.id,type:'luxury_arcology',name:'Жилой комплекс',source,rebuilding:null});
    return 'Жилой комплекс';
  }
  return 'Городские постройки';
}
function makeLast(kind,description,text='',target=''){
  return {kind,scene:'story_'+kind,title:TITLE[kind]||'Мир изменился.',
    description,text:String(text).trim().slice(0,190),target};
}
function closeCrisis(world){
  world.crisis=['power','water','food'].some(k=>world.resources[k]<15);
}
function enactWorldEvent(world,input){
  const kind=input.kind,next=engine.applyNarrativeEvent(world,kind);
  next.story=storyState(next);
  let target='';
  if(BURNING.has(kind)||['earthquake','meteor','attack'].includes(kind)||
     (['flood','storm'].includes(kind)&&/смы|разруш|снес|разбил|уничтож/i.test(input.text)))
    target=destroyStructure(next,input.text,kind);
  if(THREATS.has(kind))
    next.story.active={kind,severity:kind==='dragon_fire'?3:2,age:0,target};
  const lost=target?' Повреждён объект: '+target+'.':'';
  const danger=THREATS.has(kind)
    ?' Теперь кризис будет развиваться каждый игровой день, пока не принять меры.'
    :'';
  const detail=kind==='unknown'
    ?(input.requestedBuild?'В нашей модели пока нет такой постройки. Уточни её назначение или выбери доступный тип. Я не стал подменять её мастерскими.':
      'Не удалось надёжно определить физические последствия. Мир не изменён: уточни, что пострадало или что построить.')
    :kind==='dragon_arrival'
      ?'Пока дракон только появился. Реши, защищаться, договориться или наблюдать.'
      :kind==='dragon_help'
        ?'Горожане получили ресурсы. Теперь их можно направить на восстановление и развитие.'
        :'Событие немедленно повлияло на город.'+lost+danger;
  next.story.last=makeLast(kind,detail,input.text,target);
  next.history.push({tick:next.tick,kind:'telegram_story_'+kind,target,
    // Private player text lives only inside the user's D1 session.
    text:next.story.last.text});
  closeCrisis(next);
  return{world:next,accepted:true,action:'story',kind};
}
function reject(world,description){
  const next=structuredClone(world);
  next.story=storyState(next);next.story.last={
    kind:'blocked',scene:'story_unknown',title:'🚧 Действие пока недоступно.',
    description,text:'',target:''
  };
  next.revision++;
  return{world:next,accepted:false,action:'story',kind:'blocked'};
}
function rescueTarget(world){
  const s=world.story;
  return s?.active||s?.ruins?.length;
}
export function applyStoryAction(world,action,text=''){
  if(!STORY_ACTIONS.has(action))return reject(world,'Неизвестное действие.');
  if(!rescueTarget(world)&&action!=='relief')
    return reject(world,'Сейчас нет активной угрозы или разрушений.');
  let next=structuredClone(world);next.story=storyState(next);
  const initialIncident=next.story.active,initialResources=next.resources;
  const cost={extinguish:12,evacuate:6,defend:15,rebuild:25,relief:8}[action];
  if(initialResources.budget<cost)return reject(world,'Не хватает денег: нужно '+cost+'.');
  if(action==='extinguish'&&(!initialIncident||!BURNING.has(initialIncident.kind)))
    return reject(world,'Нечего тушить — выбери другое действие.');
  if(action==='extinguish'&&initialResources.water<8)return reject(world,'Нужно минимум 8 единиц воды.');
  if(action==='rebuild'){
    const ruin=next.story.ruins.find(x=>!x.rebuilding);
    if(!ruin)return reject(world,'Нет разрушенных объектов для восстановления.');
    const plan=engine.preview(next,engine.interpretIntent('',ruin.type));
    if(!plan.feasible)return reject(world,'Для восстановления пока не хватает ресурсов.');
    const result=applyPlan(next,ruin.type,'');
    if(!result.accepted)return reject(world,'Строительство пока невозможно.');
    result.world.story.ruins.find(x=>x.id===ruin.id).rebuilding=
      result.world.projects.at(-1)?.id||null;
    result.world.story.last={
      kind:'rebuild',scene:'story_rebuild',title:'🏗 Начинается восстановление: '+ruin.name+'.',
      description:'Стройка займёт '+plan.buildTicks+' игровых дн. Новый объект не появится мгновенно.',
      text,target:ruin.name
    };
    return{world:result.world,accepted:true,action:'story',kind:'rebuild'};
  }
  next=engine.applyResourceDelta(next,{budget:-cost});next.revision++;
  const incident=next.story.active;
  let detail='';
  if(action==='extinguish'){
    next=engine.applyResourceDelta(next,{water:-8,health:3});next.story.active=null;
    detail='Пожар потушен. Разрушенные здания сами не восстановятся.';
  }else if(action==='evacuate'){
    const moved=Math.min(4,Math.max(0,next.population-1));
    next.population-=moved;next.story.evacuated+=moved;
    next=engine.applyResourceDelta(next,{health:5});detail='Эвакуировано '+moved+' жителей. Они временно покинули город.';
  }else if(action==='defend'){
    if(incident)incident.severity=Math.max(0,incident.severity-2);
    if(incident?.severity===0)next.story.active=null;
    detail='Защитники ослабили угрозу. Последствия разрушений остались.';
  }else{
    next=engine.applyResourceDelta(next,{water:8,food:7,health:3});
    detail='Спасатели доставили воду и еду, здоровью жителей стало лучше.';
  }
  const name={extinguish:'extinguish',evacuate:'evacuation',defend:'defense',
    relief:'rescue'}[action];
  next.story.last={kind:name,scene:'story_'+name,title:{
    extinguish:'🧯 Пожар потушен.',evacuation:'🚑 Идёт эвакуация.',
    defense:'🛡 Город организовал оборону.',rescue:'🚑 Доставлена гуманитарная помощь.'
  }[name],description:detail,text,target:''};
  next.history.push({tick:next.tick,kind:'telegram_story_'+name});
  closeCrisis(next);
  return{world:next,accepted:true,action:'story',kind:name};
}
export function applyStoryText(world,text){
  const intent=classifyStoryText(text);
  if(intent.kind==='build'){
    const type=supportedBuildType(intent.text);
    if(!type)return enactWorldEvent(world,{kind:'unknown',text:intent.text,requestedBuild:true});
    // Explicit noun routing prevents the canonical keyword "electricity"
    // from silently changing a coal/solar request to a geothermal plant.
    const result=applyPlan(world,type,'');
    if(!result.accepted)return reject(world,'Недостаточно ресурсов для строительства.');
    result.world.projects.at(-1).intent.comment=intent.text;
    return{world:result.world,accepted:true,action:'start',kind:type};
  }
  if(intent.kind==='action')return applyStoryAction(world,intent.action,intent.text);
  return enactWorldEvent(world,intent);
}
export function advanceStoryDay(previous,world){
  const active=previous.story?.active;
  const rebuilding=previous.story?.ruins?.some(x=>x.rebuilding);
  if(!active&&!rebuilding)return world;
  let next=structuredClone(world);next.story=structuredClone(previous.story);
  if(active){
  const incident=next.story.active;incident.age++;
  if(incident.age>=3){
    next.story.active=null;
    next.story.last={kind:'recovery',scene:'story_recovery',
      title:'🌤 Опасность миновала.',description:
        'Непосредственная угроза закончилась, но разрушенные объекты всё ещё требуют восстановления.',
      text:'',target:''};
  }else{
    next=engine.applyNarrativeAftermath(next,incident.kind);
    const kind=incident.kind==='dragon_fire'?'dragon_aftermath':incident.kind;
    next.story.last={kind,scene:'story_'+kind,title:'⏳ Последствия продолжаются.',
      description:'Прошёл ещё один день. Проводите спасательные работы и восстанавливайте город.',
      text:'',target:incident.target};
  }
  }
  let restored='';
  for(const ruin of next.story.ruins||[]){
    if(ruin.rebuilding&&next.projects.some(x=>x.id===ruin.rebuilding&&x.active)){
      ruin.complete=true;restored=ruin.name;
    }
  }
  next.story.ruins=next.story.ruins.filter(x=>!x.complete);
  if(restored){
    next.story.last={kind:'recovery',scene:'story_recovery',
      title:'🏘 Объект снова построен: '+restored+'.',
      description:'Новый объект готов после строительства. Его вклад в ресурсы начнётся со следующего игрового дня.',
      text:'',target:restored};
  }
  closeCrisis(next);
  return next;
}
