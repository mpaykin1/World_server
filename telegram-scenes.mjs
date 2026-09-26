// Deterministic, zero-token storyboards for the Telegram transport.
// Every visible turn gets an event-specific media scene and causal explanation.
import {LABELS, delta} from './telegram-state.mjs';
import {STORY_SCENES} from './telegram-story-parse.mjs';

export const SCENE_ROOT='https://world-server.mmmpaykin.workers.dev/apps/telegram-scenes/media/';
const CATEGORIES=Object.freeze({
  solar:'solar',coal:'coal',geothermal:'geothermal',biofuel_refinery:'coal',
  desalination:'water',deep_wells:'water',water_recycling:'water',
  bottling_plant:'water',water_park:'water',
  volcanic_farm:'food',greenhouse:'food',intensive_farm:'food',livestock_export:'food',
  workshop:'workshop',automated_mine:'workshop',export_market:'workshop',
  luxury_arcology:'city',tourism:'city',temple:'city',festival:'city'
});
export const MEDIA_CATEGORIES=[...new Set(Object.values(CATEGORIES))];
export const MEDIA_SCENES=[
  'origin','planning','blocked','refresh','day','accident','recovery',
  'growth','crisis_power','crisis_water','crisis_food',
  ...MEDIA_CATEGORIES.flatMap(type=>['start','progress','done'].map(stage=>stage+'_'+type)),
  ...STORY_SCENES
];
const ANIMATED=new Set([
  'origin','accident','recovery','crisis_power','crisis_water','crisis_food',
  ...MEDIA_CATEGORIES.flatMap(type=>['start_'+type,'done_'+type]),
  ...STORY_SCENES
]);
const ICONS={power:'⚡',water:'💧',food:'🌾',budget:'💰',ecology:'🌳',health:'❤️'};
const WORDS={power:'электроэнергии',water:'воды',food:'продовольствия',
  budget:'бюджета',ecology:'экологии',health:'здоровья'};
const OUTPUTS={power:'электроэнергию',water:'воду',food:'продовольствие',
  budget:'доход',jobs:'рабочие места',culture:'культуру'};
const category=type=>CATEGORIES[type]||'city';
const changed=(before,after)=>after.history.slice(before.history.length);
const textProject=p=>LABELS[p?.type]||'новый проект';
const attr=(items)=>Object.entries(items||{}).filter(([,v])=>v>0)
  .map(([k,v])=>(ICONS[k]||'•')+' '+(OUTPUTS[k]||WORDS[k]||k)+' '+v).join(', ');
export function classifyTurn(before,after,action='day',projectType=''){
  if(action==='story'){
    const last=after.story?.last;
    return{id:last?.scene||'story_unknown',headline:last?.title||'📜 Новый поворот сюжета.',
      story:true};
  }
  if(action==='resume'&&after.story?.active){
    const active=after.story.active;
    return{id:active.kind==='dragon_fire'?'story_dragon_aftermath':
      'story_'+active.kind,headline:'⚠️ Последствия предыдущего события ещё продолжаются.',
      story:true};
  }
  if(action==='day'&&before.story?.active){
    const last=after.story?.last;
    return{id:last?.scene||'story_unknown',
      headline:last?.title||'⚠️ Мир переживает последствия.',story:true};
  }
  if(action==='new')return {id:'origin',headline:'🌱 Новый мир создан.'};
  if(action==='plan')return {id:'planning',headline:'📝 Совет города изучает твою идею.'};
  if(action==='blocked')return {id:'blocked',headline:'🚧 План пока невозможно осуществить.'};
  if(action==='resume')return {id:'refresh',headline:'🗺 Продолжаем развитие твоего мира.'};
  if(action==='stale')return {id:'refresh',headline:'🔄 Мир уже изменился. Вот его состояние.'};
  if(action==='start'){
    const p=after.projects.find(x=>!before.projects.some(old=>old.id===x.id));
    const type=p?.type||projectType||'workshop';
    return {id:'start_'+category(type),type,project:p,
      headline:'🏗 Началось строительство: '+(LABELS[type]||type)+'.'};
  }
  const newHistory=changed(before,after);
  const finished=after.projects.find(x=>x.active&&before.projects.some(old=>old.id===x.id&&!old.active));
  if(finished)return{id:'done_'+category(finished.type),project:finished,type:finished.type,
    headline:'🏭 Завершено строительство: '+textProject(finished)+'.'};
  if(newHistory.some(x=>x.kind==='accident'))return{id:'accident',
    headline:'⚠️ На производстве произошла авария.'};
  if(!before.crisis&&after.crisis)return crisisScene(after);
  if(before.crisis&&!after.crisis)return{id:'recovery',
    headline:'🌿 Кризис преодолён. Город восстанавливается.'};
  if(after.crisis)return crisisScene(after);
  const unfinished=after.projects.find(x=>!x.active);
  if(unfinished)return{id:'progress_'+category(unfinished.type),project:unfinished,type:unfinished.type,
    headline:'🚧 Продолжается строительство: '+textProject(unfinished)+'.'};
  if(after.population>before.population+1)return{id:'growth',
    headline:'🏙 Город растёт: появились новые жители.'};
  return{id:'day',headline:'🌄 Наступил новый день в городе.'};
}
function crisisScene(world){
  const resources=world.resources;
  const resource=['power','water','food'].sort((a,b)=>resources[a]-resources[b])[0];
  const headline={power:'⚡ Не хватает электроэнергии.',water:'💧 Город испытывает нехватку воды.',
    food:'🌾 Жителям не хватает продовольствия.'}[resource];
  return{id:'crisis_'+resource,headline,resource};
}
export function turnDescription(before,after,scene){
  const lines=[scene.headline],d=delta(before,after);
  if(scene.story){
    const record=after.story?.last;
    if(record?.text)lines.push('Твой сюжет: «'+record.text+'».');
    if(record?.description)lines.push(record.description);
    if(after.story?.active)lines.push('🚨 Угроза продолжается. Действия ниже помогут ограничить последствия.');
    if(after.story?.ruins?.length)lines.push('🏚 Разрушено объектов: '+after.story.ruins.length+'.');
  }else if(scene.id.startsWith('start_')){
    const p=scene.project;
    lines.push('Город вложил ресурсы и выделил работников. Стройка займёт '+(p?.remaining||'?')+
      ' игровых дн.; до её окончания новый объект ещё не производит ресурсы.');
  }else if(scene.id.startsWith('done_')){
    lines.push('Объект готов. Его вклад в ресурсы начнётся со следующего игрового дня;'+
      ' работа может потребовать воды, энергии или денег.');
  }else if(scene.id.startsWith('progress_')){
    lines.push('До запуска: '+(scene.project?.remaining||'?')+' дн. Затраты уже сделаны,'+
      ' а преимущества ещё впереди.');
  }else if(scene.id.startsWith('crisis_')){
    lines.push('Запасы '+WORDS[scene.resource]+' опасно малы. Дефицит влияет на жителей.'+
      ' Строительство и работа инфраструктуры могут потребовать дополнительных ресурсов.');
  }else if(scene.id==='accident'){
    lines.push('Часть производственной инфраструктуры дала сбой. Следи за экологией'+
      ' и ресурсами, чтобы ограничить последствия.');
  }else if(scene.id==='recovery'){
    lines.push('Нехватка жизненно важных ресурсов устранена. Жители снова могут'+
      ' развивать город, но запасы стоит восстановить.');
  }else if(scene.id==='origin'){
    lines.push('Пока ничего не построено. Твои решения изменят эту долину.');
  }else if(scene.id==='planning'){
    lines.push('Напиши, что именно построить и с какой целью (до 600 символов).');
  }else if(scene.id==='day'){
    lines.push('Жители ежедневно расходуют электричество, воду и еду.'+
      ' Действующие объекты влияют на производство и экологию.');
  }
  const differences=Object.entries(d).filter(([,v])=>v!==0).map(([k,v])=>
    (ICONS[k]||k)+(v>0?'+':'')+v);
  const people=after.population-before.population;
  lines.push('За этот ход: '+(differences.join('  ')||'ресурсы без изменений')+
    (people?'  👥'+(people>0?'+':'')+people:'')+'.');
  if(after.projects.some(p=>!p.active)&&scene.id==='day')
    lines.push('🏗 Незавершённые стройки продолжаются.');
  return lines.join('\n');
}
export function sceneMedia(scene,world,updateId=0){
  const nonmutating=new Set(['origin','planning','blocked','refresh']);
  // Consecutive mutations get different variants; repeated /start and
  // correction prompts use Telegram's increasing update ID instead.
  const variant=scene.id.startsWith('progress_')&&scene.project
    ? Math.max(0,Math.min(2,3-scene.project.remaining))
    :nonmutating.has(scene.id)?updateId%3:world.revision%3;
  const name=scene.id+'-'+variant;
  return {
    kind:ANIMATED.has(scene.id)?'animation':'photo',
    animation:SCENE_ROOT+name+'.mp4',photo:SCENE_ROOT+name+'.png',
    scene:scene.id,variant
  };
}
export function makeVisualTurn(before,after,action,projectType,updateId,game){
  const scene=classifyTurn(before,after,action,projectType);
  const description=turnDescription(before,after,scene);
  const text=description+'\n\n'+game.text;
  // Telegram media captions have a hard 1024-character limit.
  const caption=[...text].slice(0,960).join('');
  return {...game,text:caption,media:sceneMedia(scene,after,updateId),scene:scene.id};
}
