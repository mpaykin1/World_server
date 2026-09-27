// The ONLY HTTP game engine for Telegram, Telegram WebApp and a guest browser.
// Telegram and the browser share telegram_sessions and the same simulation/story code.
import {engine,initialWorld,loadSession,options,applyPlan,view,describeChange,MAX_INTENT} from './telegram-state.mjs';
import {applyStoryText,applyStoryAction,advanceStoryDay} from './telegram-story.mjs';
import {STORY_ACTIONS} from './telegram-story-parse.mjs';
import {authorizeBrowser,createBrowserSession,redeemLinkCode} from './chain-session.mjs';

const ALLOWED=new Set(['https://mpaykin1.github.io']);
const BUILDS=Object.freeze({
  city:'luxury_arcology',forest:'forest',energy:'solar',volcano:'geothermal'
});
function corsOrigin(request){
  const origin=request.headers.get('origin');
  if(!origin)return '';
  if(ALLOWED.has(origin)||origin===new URL(request.url).origin||
    /^http:\/\/(?:localhost|127\.0\.0\.1):\d{2,5}$/.test(origin))return origin;
  return null;
}
function response(value,status=200,origin=''){
  return new Response(JSON.stringify(value),{status,headers:{
    'content-type':'application/json; charset=utf-8','cache-control':'no-store',
    'x-content-type-options':'nosniff','vary':'Origin',
    ...(origin?{'access-control-allow-origin':origin}: {})
  }});
}
async function input(request){
  if(Number(request.headers.get('content-length')||0)>8192)throw Error('Слишком большой запрос.');
  const raw=await request.text();
  if(raw.length>8192)throw Error('Слишком большой запрос.');
  try{return JSON.parse(raw);}catch{throw Error('Ожидается JSON.');}
}
function placedOf(world){
  const projects=world.projects||[],kinds=projects.map(p=>p.type);
  const story=world.story||{},history=world.history||[];
  return {
    city:world.houses?.length||kinds.filter(t=>['luxury_arcology','tourism','temple'].includes(t)).length,
    forest:history.some(h=>h.kind==='telegram_story_forest')?1:0,
    energy:kinds.filter(t=>['solar','coal','geothermal','biofuel_refinery'].includes(t)).length,
    volcano:kinds.some(t=>['geothermal','volcanic_farm'].includes(t))?1:0,
    dragon:!!(story.dragon?.active||
      (!story.dragon&&['dragon_arrival','dragon_fire','dragon_help'].includes(story.last?.kind)))
  };
}
export function browserSnapshot(world,linked=false){
  const r=world.resources,story=world.story||{},offered=options(world);
  return {revision:world.revision,turn:world.tick,linked,
    state:{turn:world.tick,population:world.population,
      power:r.power,water:r.water,food:r.food,eco:r.ecology,
      budget:r.budget,health:r.health,happiness:r.satisfaction??r.happiness??50},
    placed:placedOf(world),
    story:{last:story.last||null,active:story.active||null,
      dragon:story.dragon||null,ruins:story.ruins||[]},
    building:(world.projects||[]).filter(p=>!p.active)
      .map(p=>({type:p.type,remaining:p.remaining})),
    choices:offered.map(p=>({type:p.type,label:p.label,
      cost:p.plan.cost,days:p.plan.buildTicks})),
    actions:{shoot:!!story.dragon?.active,
      defend:!!story.active,extinguish:['dragon_fire','fire'].includes(story.active?.kind)},
    history:(world.history||[]).slice(-16).map(e=>({
      tick:e.tick,type:e.kind,text:e.text||e.description||e.kind
    })),message:view(world).text};
}
async function browserSave(db,session,world,restart=session.restart){
  // The browser NEVER modifies last_update_id: Telegram's update replay gate
  // remains monotonic independently of the browser's revision CAS.
  const result=await db.prepare(
    'UPDATE telegram_sessions SET world=?,revision=?,restart=?,pending_revision=NULL,updated_at=CURRENT_TIMESTAMP WHERE chat_id=? AND revision=?'
  ).bind(JSON.stringify(world),world.revision,restart,session.chatId,session.revision).run();
  return result.meta?.changes===1;
}
function advance(session,action){
  const previous=session.world,kind=action?.kind;
  if(kind==='reset'){
    return{world:initialWorld(session.chatId,session.restart+1),
      restart:session.restart+1,label:'Создан новый мир'};
  }
  if(kind==='next')
    return{world:advanceStoryDay(previous,engine.tick(previous)),label:'Следующий день'};
  if(kind==='idea'){
    if(typeof action.text!=='string'||!action.text.trim()||action.text.length>MAX_INTENT)
      throw Error('Напиши идею до 600 символов.');
    const result=applyStoryText(previous,action.text);
    if(!result.accepted)throw Error(result.world.story?.last?.description||'Действие недоступно.');
    return{world:result.world,label:result.world.story?.last?.title||'Идея принята'};
  }
  if(kind==='build'){
    if(!Object.hasOwn(BUILDS,action.type))throw Error('Неизвестный объект.');
    if(action.type==='forest'){
      const result=applyStoryText(previous,'Мы посадили лес');
      return{world:result.world,label:'Посажен лес'};
    }
    const result=applyPlan(previous,BUILDS[action.type]);
    if(!result.accepted)throw Error('Недостаточно ресурсов для постройки.');
    return{world:result.world,label:'Началось строительство'};
  }
  if(kind==='choice'){
    const offer=options(previous).find(o=>o.type===action.type);
    if(!offer)throw Error('Это решение больше недоступно.');
    const result=applyPlan(previous,offer.type);
    if(!result.accepted)throw Error('Недостаточно ресурсов для решения.');
    return{world:result.world,label:'Решение принято'};
  }
  if(kind==='story_action'){
    if(!STORY_ACTIONS.has(action.type))throw Error('Неизвестное действие.');
    const result=applyStoryAction(previous,action.type);
    if(!result.accepted)throw Error(result.world.story?.last?.description||'Действие пока недоступно.');
    return{world:result.world,label:result.world.story?.last?.title||'Действие принято'};
  }
  throw Error('Неизвестная команда.');
}
export async function handleUnifiedGame(request,env){
  const origin=corsOrigin(request);
  if(origin===null)return response({error:'Origin forbidden'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{
    'access-control-allow-origin':origin||new URL(request.url).origin,
    'access-control-allow-methods':'GET,POST,OPTIONS',
    'access-control-allow-headers':'authorization,content-type',
    'access-control-max-age':'600','vary':'Origin'
  }});
  if(!env.TELEGRAM_DB)return response({error:'Game storage unavailable'},503,origin);
  const path=new URL(request.url).pathname,db=env.TELEGRAM_DB;
  try{
    if(path==='/api/chain/session'&&request.method==='POST'){
      const payload=await input(request);
      const created=await createBrowserSession(db,payload?.initData||'',
        String(env.TELEGRAM_BOT_TOKEN||''));
      if(!created)return response({error:'Telegram signature expired or invalid'},403,origin);
      return response({token:created.token,linked:created.linked},201,origin);
    }
    const auth=await authorizeBrowser(db,request);
    if(!auth)return response({error:'Browser session expired; open a new world'},401,origin);
    if(path==='/api/chain/link'&&request.method==='POST'){
      const body=await input(request),chatId=await redeemLinkCode(db,
        String(body.code||'').trim().toUpperCase(),auth.tokenHash);
      if(!chatId)return response({error:'Код недействителен или истёк.'},400,origin);
      const s=await loadSession(db,chatId);
      return response(browserSnapshot(s.world,true),200,origin);
    }
    const session=await loadSession(db,auth.chatId);
    if(path==='/api/chain/state'&&request.method==='GET')
      return response(browserSnapshot(session.world,!auth.chatId.startsWith('guest:')),200,origin);
    if(path==='/api/chain/action'&&request.method==='POST'){
      const body=await input(request);
      if(!Number.isSafeInteger(body.revision)||body.revision!==session.revision)
        return response({error:'Мир изменился в другом окне.',...browserSnapshot(session.world,
          !auth.chatId.startsWith('guest:'))},409,origin);
      const changed=advance(session,body);
      const saved=await browserSave(db,session,changed.world,changed.restart);
      if(!saved)return response({error:'Ход уже сделан. Обнови мир.'},409,origin);
      return response({...browserSnapshot(changed.world,!auth.chatId.startsWith('guest:')),
        notice:describeChange(session.world,changed.world,changed.label)},200,origin);
    }
    return response({error:'Unknown route or method'},404,origin);
  }catch(error){
    // Deliberately do not return SQL, tokens or other internal exception details.
    if(error instanceof Error&&/^(Напиши|Недостаточно|Неизвестн|Это решение|Действие|Слишком|Ожидается)/.test(error.message))
      return response({error:error.message},422,origin);
    return response({error:'Game request failed'},500,origin);
  }
}
