// Stateless HTTP transport; game state is persisted in Cloudflare D1.
// Canonical project math is imported, never duplicated or replaced by an LLM.
import {
  engine, MAX_INTENT, LABELS, initialWorld, options, applyPlan,
  loadSession, saveSession, view, describeChange
} from './telegram-state.mjs';

const WEBHOOK_URL='https://world-server.mmmpaykin.workers.dev/api/telegram/webhook';
const INTRO_IMAGE='https://world-server.mmmpaykin.workers.dev/apps/ai3d-reference-test/assets/renders/front_textured.png';
const EVENT_IMAGE='https://world-server.mmmpaykin.workers.dev/apps/ai3d-reference-test/assets/renders/left15_textured.png';
const TOKEN_PATTERN=/^\d+:[A-Za-z0-9_-]{20,}$/;
const responseJson=(value,status=200)=>new Response(JSON.stringify(value),{
  status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
});
export async function webhookSecret(token){
  const digest=await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode('world-server-telegram-webhook-v1:'+token));
  return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
async function botApi(token,method,payload,fetcher=fetch){
  // Never put the bot token into an error or public response.
  const request={method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify(payload)};
  const response=await fetcher('https://api.telegram.org/bot'+token+'/'+method,request);
  if(!response.ok)throw Error('Telegram '+method+' HTTP '+response.status);
  const result=await response.json();
  if(result.ok!==true)throw Error('Telegram '+method+' rejected');
  return result.result;
}
async function sendGame(token,chatId,game,fetcher,{image=null}={}){
  if(image){
    try{
      await botApi(token,'sendPhoto',{chat_id:chatId,photo:image,caption:game.text,
        reply_markup:game.reply_markup},fetcher);
      return;
    }catch{ /* Photo isn't essential to playing. */ }
  }
  await botApi(token,'sendMessage',{chat_id:chatId,...game},fetcher);
}
async function onCommand(message,updateId,env,fetcher){
  if(message.chat?.type!=='private')return;
  const db=env.TELEGRAM_DB,chatId=message.chat.id;
  const session=await loadSession(db,chatId);
  if(updateId<=session.lastUpdate)return;
  const reset=/^\/new(?:@\w+)?(?:\s|$)/i.test(message.text||'');
  const world=reset?initialWorld(chatId,session.restart+1):session.world;
  const updated=await saveSession(db,session,{
    world,restart:reset?session.restart+1:session.restart,
    pending:null,updateId
  });
  if(!updated)return;
  await sendGame(env.TELEGRAM_BOT_TOKEN,chatId,
    view(world,reset?'🌱 Новый мир создан.':'Добро пожаловать!'),fetcher,{image:INTRO_IMAGE});
}
function parseCallback(data){
  const match=/^tg2:(\d{1,10}):([a-z_]{1,35})$/.exec(data||'');
  if(!match)return null;
  return{revision:Number(match[1]),action:match[2]};
}
async function onCallback(callback,updateId,env,fetcher){
  const chat=callback.message?.chat,token=env.TELEGRAM_BOT_TOKEN;
  if(!chat||chat.type!=='private'){
    await botApi(token,'answerCallbackQuery',{callback_query_id:callback.id,
      text:'Открой бота в личном чате.'},fetcher);
    return;
  }
  const session=await loadSession(env.TELEGRAM_DB,chat.id);
  const data=parseCallback(callback.data);
  if(!data||data.revision!==session.revision||updateId<=session.lastUpdate){
    await botApi(token,'answerCallbackQuery',{callback_query_id:callback.id,
      text:'Эта кнопка устарела. Продолжим текущую игру.'},fetcher);
    if(updateId>session.lastUpdate)await sendGame(token,chat.id,view(session.world),fetcher);
    return;
  }
  let world=session.world,restart=session.restart,pending=null,notice='',image=null;
  if(data.action==='reset'){
    restart++;
    world=initialWorld(chat.id,restart);
    notice='🌱 Новый мир создан.';
    image=INTRO_IMAGE;
  }else if(data.action==='free'){
    pending=session.revision;
    notice='✍️ Пришли сообщением свой проект (до 600 символов).\n'+
      'Например: Построить солнечные панели, чтобы пережить кризис.';
  }else if(data.action==='next'){
    world=engine.tick(world);
    notice=describeChange(session.world,world,'Город прожил ещё один день');
  }else{
    const candidate=options(world).find(x=>x.type===data.action);
    if(!candidate){
      await botApi(token,'answerCallbackQuery',{callback_query_id:callback.id,
        text:'Этот проект больше недоступен.'},fetcher);
      await sendGame(token,chat.id,view(world),fetcher);
      return;
    }
    const outcome=applyPlan(world,candidate.type);
    if(outcome.accepted){
      world=outcome.world;
      notice=describeChange(session.world,world,candidate.label);
      image=EVENT_IMAGE;
    }else notice='Недостаточно ресурсов для этого проекта.';
  }
  const saved=await saveSession(env.TELEGRAM_DB,session,{world,restart,pending,updateId});
  await botApi(token,'answerCallbackQuery',{callback_query_id:callback.id,
    text:saved?'Решение принято.':'Ход уже изменился.'},fetcher);
  if(!saved)return;
  if(pending!==null){
    await botApi(token,'sendMessage',{chat_id:chat.id,text:notice},fetcher);
  }else await sendGame(token,chat.id,view(world,notice),fetcher,{image});
}
async function onText(message,updateId,env,fetcher){
  if(message.chat?.type!=='private')return;
  const session=await loadSession(env.TELEGRAM_DB,message.chat.id);
  if(updateId<=session.lastUpdate)return;
  const token=env.TELEGRAM_BOT_TOKEN;
  if(session.pending!==session.revision){
    await botApi(token,'sendMessage',{chat_id:message.chat.id,
      text:'Чтобы продолжить игру, отправь /start.'},fetcher);
    return;
  }
  const text=String(message.text||'').trim();
  if(!text||text.length>MAX_INTENT){
    await botApi(token,'sendMessage',{chat_id:message.chat.id,
      text:'Напиши идею длиной от 1 до 600 символов.'},fetcher);
    return;
  }
  const outcome=applyPlan(session.world,'workshop',text);
  const notice=outcome.accepted
    ?describeChange(session.world,outcome.world,LABELS[outcome.plan.intent.goal]||outcome.plan.intent.goal)
    :'⛔ Сейчас этот проект невозможно осуществить: '+outcome.plan.missing
      .map(x=>x.resource+' '+x.available+'/'+x.required).join(', ')+'.';
  const saved=await saveSession(env.TELEGRAM_DB,session,{
    world:outcome.world,pending:null,updateId
  });
  if(saved)await sendGame(token,message.chat.id,view(outcome.world,notice),fetcher,{
    image:outcome.accepted?EVENT_IMAGE:null
  });
}
export async function handleTelegramWebhook(request,env,fetcher=fetch){
  if(request.method!=='POST')return new Response('Method Not Allowed',{status:405});
  const token=String(env.TELEGRAM_BOT_TOKEN||'').trim();
  if(!TOKEN_PATTERN.test(token)||!env.TELEGRAM_DB)
    return new Response('Not configured',{status:503});
  if(request.headers.get('x-telegram-bot-api-secret-token')!==await webhookSecret(token))
    return new Response('Forbidden',{status:403});
  if(Number(request.headers.get('content-length')||0)>16384)
    return new Response('Too large',{status:413});
  const body=await request.text();
  if(new TextEncoder().encode(body).length>16384)
    return new Response('Too large',{status:413});
  let update;
  try{update=JSON.parse(body);}catch{return new Response('Invalid JSON',{status:400});}
  const id=update?.update_id;
  if(!Number.isSafeInteger(id)||id<0)return new Response('Invalid update',{status:400});
  if(update.message?.text){
    if(/^\/(start|help|new)(?:@\w+)?(?:\s|$)/i.test(update.message.text))
      await onCommand(update.message,id,env,fetcher);
    else await onText(update.message,id,env,fetcher);
  }else if(update.callback_query)await onCallback(update.callback_query,id,env,fetcher);
  return new Response('OK',{status:200,headers:{'cache-control':'no-store'}});
}
export async function registerTelegramWebhook(env,fetcher=fetch){
  const token=String(env.TELEGRAM_BOT_TOKEN||'').trim();
  if(!TOKEN_PATTERN.test(token)||!env.TELEGRAM_DB)return false;
  const info=await botApi(token,'getWebhookInfo',{},fetcher);
  if(info.url===WEBHOOK_URL)return true;
  await botApi(token,'setWebhook',{
    url:WEBHOOK_URL,secret_token:await webhookSecret(token),
    allowed_updates:['message','callback_query'],drop_pending_updates:false
  },fetcher);
  return true;
}
function adminAllowed(request,env){
  const key=String(env.TELEGRAM_HEALTH_KEY||'');
  return key.length>=32&&request.headers.get('x-world-server-admin-token')===key;
}
export async function activateTelegramWebhook(request,env,fetcher=fetch){
  if(!adminAllowed(request,env))return new Response('Forbidden',{status:403});
  try{
    const activated=await registerTelegramWebhook(env,fetcher);
    return responseJson({activated},activated?200:503);
  }catch{return responseJson({activated:false,error:'Registration failed'},503);}
}
export async function telegramStatus(request,env,fetcher=fetch){
  if(!adminAllowed(request,env))return new Response('Forbidden',{status:403});
  const token=String(env.TELEGRAM_BOT_TOKEN||'').trim();
  const configured=TOKEN_PATTERN.test(token)&&!!env.TELEGRAM_DB;
  if(!configured)return responseJson({ready:false,configured:false},503);
  try{
    const [me,hook,db]=await Promise.all([
      botApi(token,'getMe',{},fetcher),
      botApi(token,'getWebhookInfo',{},fetcher),
      env.TELEGRAM_DB.prepare('SELECT 1 AS ok').first()
    ]);
    const webhookMatches=hook.url===WEBHOOK_URL,dbReady=db?.ok===1;
    return responseJson({ready:webhookMatches&&dbReady,
      configured:true,botUsername:me.username,dbReady,webhookMatches,
      pendingUpdates:hook.pending_update_count||0
    },webhookMatches&&dbReady?200:503);
  }catch{return responseJson({ready:false,configured:true,error:'Dependency unavailable'},503);}
}
