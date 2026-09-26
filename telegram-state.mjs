// D1-backed session state for Telegram; canonical deterministic game logic is shared.
import './supabase/functions/_shared/world-consequence-engine.js';
export const engine = globalThis.WorldConsequenceEngine;
export const MAX_INTENT = 600;
export const LABELS = Object.freeze({
  geothermal:'Геотермальная станция',tourism:'Туристический комплекс',
  volcanic_farm:'Вулканические фермы',solar:'Солнечная станция',
  temple:'Культурный центр',workshop:'Мастерские',desalination:'Опреснение',
  coal:'Угольная станция',festival:'Городской фестиваль',
  water_recycling:'Переработка воды',deep_wells:'Глубокие скважины',
  greenhouse:'Теплицы',intensive_farm:'Интенсивная ферма',
  export_market:'Экспортный рынок',luxury_arcology:'Жилой район',
  automated_mine:'Автоматическая шахта',water_park:'Аквапарк',
  bottling_plant:'Завод воды',biofuel_refinery:'Биотопливный завод',
  livestock_export:'Животноводство'
});
const PROJECT_TYPES = Object.keys(engine.PROJECTS);
export function seedFor(chatId,restart=0){return 'telegram:'+String(chatId)+':'+restart;}
export function initialWorld(chatId,restart=0){return engine.createWorld(seedFor(chatId,restart));}
export function options(world){
  const r=world.resources;
  const target=['power','water','food'].sort((a,b)=>r[a]-r[b])[0];
  const order={
    power:['solar','coal','geothermal','workshop'],
    water:['water_recycling','deep_wells','desalination','workshop'],
    food:['greenhouse','intensive_farm','volcanic_farm','export_market']
  }[target];
  const offered=[];
  for(const type of new Set([...order,...PROJECT_TYPES])){
    const plan=engine.preview(world,engine.interpretIntent('',type));
    if(plan.feasible)offered.push({type,label:LABELS[type]||type,plan});
    if(offered.length===4)break;
  }
  return offered;
}
export function applyPlan(world,type,text=''){
  const intent=engine.interpretIntent(text,type);
  const plan=engine.preview(world,intent);
  if(!plan.feasible)return {world,plan,accepted:false};
  const committed=engine.commit(world,intent,world.revision);
  // An operating plant changes the economy only after its build delay.
  const next=engine.simulateTicks(committed,Math.min(plan.buildTicks+1,8));
  return {world:next,plan,accepted:true};
}
export function delta(previous,next){
  return Object.fromEntries(['power','water','food','budget','ecology','health']
    .map(k=>[k,Math.round((next.resources[k]-previous.resources[k])*10)/10]));
}
export function signedDelta(n){return(n>0?'+':'')+n;}
function rowSession(row){
  return {chatId:row.chat_id,world:JSON.parse(row.world),restart:Number(row.restart),
    revision:Number(row.revision),lastUpdate:Number(row.last_update_id),
    pending:row.pending_revision===null?null:Number(row.pending_revision)};
}
export async function loadSession(db,chatId){
  const id=String(chatId);
  let row=await db.prepare('SELECT * FROM telegram_sessions WHERE chat_id=?').bind(id).first();
  if(!row){
    const world=initialWorld(id);
    await db.prepare('INSERT OR IGNORE INTO telegram_sessions (chat_id,world,revision) VALUES (?,?,?)')
      .bind(id,JSON.stringify(world),world.revision).run();
    row=await db.prepare('SELECT * FROM telegram_sessions WHERE chat_id=?').bind(id).first();
  }
  if(!row)throw Error('Telegram session storage unavailable');
  return rowSession(row);
}
export async function saveSession(db,session,{world=session.world,restart=session.restart,
  pending=null,updateId}={}){
  if(!Number.isSafeInteger(updateId)||updateId<0)throw Error('Invalid Telegram update');
  const query=db.prepare(
    'UPDATE telegram_sessions SET world=?,revision=?,restart=?,pending_revision=?,last_update_id=?,updated_at=CURRENT_TIMESTAMP WHERE chat_id=? AND revision=? AND last_update_id<?'
  );
  const result=await query.bind(JSON.stringify(world),world.revision,restart,pending,updateId,
    session.chatId,session.revision,updateId).run();
  return result.meta?.changes===1;
}
export function summary(world){
  const r=world.resources;
  return '⚡'+r.power+'  💧'+r.water+'  🌾'+r.food+
    '\n💰'+r.budget+'  🌳'+r.ecology+'  ❤️'+r.health;
}
export function view(world,notice=''){
  const offered=options(world);
  const intro='🌍 ЦЕПНАЯ РЕАКЦИЯ — ЗЛОЙ ДЖИНН\nДень '+world.tick+
    ' · Жителей: '+world.population+'\n'+summary(world);
  const choices=offered.map(o=>[{
    text:o.label+'  💰'+o.plan.cost+'  ⏳'+o.plan.buildTicks,
    callback_data:'tg2:'+world.revision+':'+o.type
  }]);
  if(!offered.length)choices.push([{text:'⏩ Прожить день',callback_data:'tg2:'+world.revision+':next'}]);
  choices.push([{text:'✍️ Свой вариант',callback_data:'tg2:'+world.revision+':free'}]);
  choices.push([{text:'🔄 Новый мир',callback_data:'tg2:'+world.revision+':reset'}]);
  return {text:(notice?notice+'\n\n':'')+intro+
    (world.crisis?'\n🚨 Кризис: город продолжает бороться.':'')+
    '\n\n'+(offered.length?'Выбери решение:':'Нет доступных построек. Проживи день или начни заново.'),
    reply_markup:{inline_keyboard:choices}};
}
export function describeChange(before,next,label){
  const d=delta(before,next);
  const parts=Object.entries(d).filter(([,value])=>value!==0).map(([k,v])=>
    ({power:'⚡',water:'💧',food:'🌾',budget:'💰',ecology:'🌳',health:'❤️'})[k]+signedDelta(v));
  const disasters=next.history.filter(x=>x.tick>before.tick&&
    /crisis|disaster|adaptation|commissioned|eruption|shortage/i.test(x.kind)).slice(-3)
    .map(x=>x.kind==='commissioned'?'🏭 Строительство завершено.':
      x.kind==='adaptation'?'🛠 Жители приспосабливаются.':
      '⚠️ '+x.kind.replaceAll('_',' ')+'.');
  return '✅ '+label+'. Прошло '+(next.tick-before.tick)+' дн.\n'+
    'Изменения: '+(parts.join('  ')||'без резких перемен')+
    (disasters.length?'\n'+disasters.join('\n'):'');
}
