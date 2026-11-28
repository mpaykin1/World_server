// Opt-in personal news: reads the real saved world, never advances game time.
import {LABELS} from './telegram-state.mjs';
const PLAY='https://mpaykin1.github.io/meta6-lab/telegram-mini-app/';
const DAY=86400, LIMIT=4;
const SCHEMA=`CREATE TABLE IF NOT EXISTS telegram_world_news (
 chat_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0,
 next_at INTEGER NOT NULL DEFAULT 0, last_update_id INTEGER NOT NULL DEFAULT -1
)`;
async function setup(db){await db.prepare(SCHEMA).run();await db.prepare('CREATE INDEX IF NOT EXISTS telegram_world_news_due ON telegram_world_news(enabled,next_at)').run()}
const now=()=>Math.floor(Date.now()/1000);
const valid=id=>/^[1-9][0-9]{0,15}$/.test(String(id));
export function worldNews(world){
 const r=world?.resources||{},story=world?.story||{},active=story.active;
 const projects=Array.isArray(world?.projects)?world.projects:[];
 const pending=projects.find(p=>!p.active);
 const shortage=['power','water','food'].filter(k=>Number.isFinite(r[k])).sort((a,b)=>r[a]-r[b])[0];
 const headline=active?'⚠️ '+(story.last?.title||'В мире продолжается происшествие.'):
  world.crisis?'⚠️ В мире сохраняется нехватка '+({power:'энергии',water:'воды',food:'еды'}[shortage]||'ресурсов')+'.':
  pending?'🏗 '+(LABELS[pending.type]||'Новый объект')+': до завершения '+Math.max(0,Number(pending.remaining)||0)+' игр. дн.':
  '🌿 Твой мир ждёт следующего решения.';
 const text=[headline,'Злой джинн · День '+(Number(world.tick)||0)+' · Жителей: '+(Number(world.population)||0),
  '⚡ '+(r.power??'—')+'  💧 '+(r.water??'—')+'  🌾 '+(r.food??'—'),
  'Игровое время остановлено до твоего следующего хода.'].join('\n');
 return [...text].slice(0,900).join('');
}
async function telegram(token,method,payload,fetcher){
 const response=await fetcher('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});
 let result;try{result=await response.json()}catch{}
 return {ok:response.ok&&result?.ok===true,status:result?.error_code||response.status,retry:Number(result?.parameters?.retry_after)||0};
}
const keyboard={inline_keyboard:[[{text:'▶ Играть · META GAMES',web_app:{url:PLAY}}],[{text:'Продолжить Злого джинна',callback_data:'worldnews:resume'},{text:'Отключить новости',callback_data:'worldnews:off'}]]};
export async function newsCommand(update,env,fetcher=fetch){
 const msg=update.message,cb=update.callback_query,chat=msg?.chat||cb?.message?.chat;
 const match=/^\/(news|news_on|news_off)(?:@\w+)?\s*$/i.exec(msg?.text||'');
 const cmd=match?match[1].toLowerCase():({'worldnews:on':'news_on','worldnews:off':'news_off','worldnews:settings':'news'}[cb?.data]);
 if(!cmd)return false;
 if(chat?.type!=='private'||!valid(chat.id))return true;
 const db=env.TELEGRAM_DB,token=env.TELEGRAM_BOT_TOKEN,id=String(chat.id),time=now();
 await setup(db);
 if(cmd==='news'){
  const pref=await db.prepare('SELECT enabled FROM telegram_world_news WHERE chat_id=?').bind(id).first();
  await telegram(token,'sendMessage',{chat_id:id,text:'Новости миров: '+(pref?.enabled?'включены':'выключены')+'. До одного сообщения в сутки с состоянием твоего мира.',reply_markup:{inline_keyboard:[[{text:pref?.enabled?'Выключить':'Включить новости',callback_data:pref?.enabled?'worldnews:off':'worldnews:on'}]]}},fetcher);
 }else{
  const enabled=cmd==='news_on'?1:0;
  const saved=await db.prepare('INSERT INTO telegram_world_news(chat_id,enabled,next_at,last_update_id) VALUES(?,?,?,?) ON CONFLICT(chat_id) DO UPDATE SET enabled=excluded.enabled,next_at=excluded.next_at,last_update_id=excluded.last_update_id WHERE telegram_world_news.last_update_id<excluded.last_update_id').bind(id,enabled,time+DAY,update.update_id).run();
  if(saved.meta?.changes===1){
   const row=enabled?await db.prepare('SELECT world FROM telegram_sessions WHERE chat_id=?').bind(id).first():null;
   let w;try{w=JSON.parse(row?.world||'null')}catch{}
   const message=enabled?(w?worldNews(w)+'\n\nНовости включены.':'Новости включены. Создай мир командой /start.'):'Новости миров отключены.';
   await telegram(token,'sendMessage',{chat_id:id,text:message,disable_notification:true,...(enabled?{reply_markup:keyboard}:{})},fetcher);
  }
 }
 if(cb?.id)await telegram(token,'answerCallbackQuery',{callback_query_id:cb.id},fetcher);
 return true;
}
export async function sendDueWorldNews(env,fetcher=fetch){
 const db=env.TELEGRAM_DB,token=env.TELEGRAM_BOT_TOKEN;if(!db||!token)return;
 await setup(db);const time=now();
 const {results=[]}=await db.prepare('SELECT n.chat_id,n.next_at,s.world FROM telegram_world_news n JOIN telegram_sessions s ON s.chat_id=n.chat_id WHERE n.enabled=1 AND n.next_at<=? ORDER BY n.next_at LIMIT ?').bind(time,LIMIT).all();
 for(const row of results){
  if(!valid(row.chat_id))continue;
  const claimed=await db.prepare('UPDATE telegram_world_news SET next_at=? WHERE chat_id=? AND enabled=1 AND next_at=?').bind(time+DAY,row.chat_id,row.next_at).run();
  if(claimed.meta?.changes!==1)continue;
  let world;try{world=JSON.parse(row.world)}catch{continue}if(!world?.resources)continue;
  try{
   const sent=await telegram(token,'sendMessage',{chat_id:row.chat_id,text:worldNews(world),disable_notification:true,reply_markup:keyboard},fetcher);
   if(sent.status===403)await db.prepare('UPDATE telegram_world_news SET enabled=0 WHERE chat_id=? AND next_at=?').bind(row.chat_id,time+DAY).run();
   if(sent.status===429){await db.prepare('UPDATE telegram_world_news SET next_at=? WHERE chat_id=? AND enabled=1 AND next_at=?').bind(time+Math.max(300,sent.retry),row.chat_id,time+DAY).run();break}
  }catch{/* ambiguous delivery: do not repeat immediately */}
 }
}