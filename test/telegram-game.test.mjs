import test from 'node:test';
import assert from 'node:assert/strict';
import {engine,initialWorld,options,applyPlan,loadSession,saveSession,view} from '../telegram-state.mjs';
import {handleTelegramWebhook,webhookSecret,registerTelegramWebhook,telegramStatus} from '../telegram-game.mjs';
const TOKEN='123456:FAKE_EXAMPLE_ONLY_ABCDEFGHIJKLMNOP';
const URL='https://world-server.mmmpaykin.workers.dev/api/telegram/webhook';

class MockD1{
  constructor(){this.rows=new Map();this.health=null;}
  prepare(sql){
    return {
      first:async()=>{
        if(sql.startsWith('SELECT 1'))return {ok:1};
        if(sql.startsWith('SELECT bot_username'))return this.health;
        throw Error('Unexpected unbound query');
      },
      bind:(...args)=>({
        first:async()=>{
          if(sql.startsWith('SELECT 1'))return {ok:1};
          if(sql.startsWith('SELECT *'))return this.rows.get(args[0])||null;
          throw Error('Unexpected query '+sql);
        },
        run:async()=>{
          if(sql.startsWith('INSERT OR IGNORE')){
            const [id,world,revision]=args;
            if(!this.rows.has(id))this.rows.set(id,{chat_id:id,world,revision,
              restart:0,pending_revision:null,last_update_id:-1});
            return{meta:{changes:1}};
          }
          if(sql.startsWith('INSERT INTO telegram_bot_health')){
            this.health={bot_username:args[0],webhook_url:args[1],
              last_ok_at:new Date().toISOString().slice(0,19).replace('T',' ')};
            return{meta:{changes:1}};
          }
          if(sql.startsWith('UPDATE telegram_sessions')){
            const [world,revision,restart,pending,updateId,id,expectedRev,maxUpdate]=args;
            const old=this.rows.get(id);
            if(!old||old.revision!==expectedRev||old.last_update_id>=maxUpdate)
              return{meta:{changes:0}};
            this.rows.set(id,{...old,world,revision,restart,pending_revision:pending,
              last_update_id:updateId});
            return{meta:{changes:1}};
          }
          throw Error('Unexpected write '+sql);
        }
      })
    };
  }
}
function mockApi({animationOk=true,webhookUrl=URL}={}){
  const calls=[];
  const fetcher=async(url,init)=>{
    const method=url.split('/').at(-1);
    const payload=init.body instanceof FormData
      ?Object.fromEntries([...init.body].map(([k,v])=>[k,k==='reply_markup'?JSON.parse(v):v]))
      :JSON.parse(init.body);
    calls.push({method,payload});
    if(method==='sendAnimation'&&!animationOk)return new Response(JSON.stringify({ok:false}),{status:404});
    let result=true;
    if(method==='getMe')result={username:'World_serverbot'};
    if(method==='getWebhookInfo')result={url:webhookUrl,pending_update_count:0};
    return new Response(JSON.stringify({ok:true,result}),{status:200,
      headers:{'content-type':'application/json'}});
  };
  return{calls,fetcher};
}
async function post(env,api,update,secret=null){
  const request=new Request(URL,{
    method:'POST',headers:{
      'x-telegram-bot-api-secret-token':secret??await webhookSecret(TOKEN),
      'content-type':'application/json'
    },body:JSON.stringify(update)
  });
  return handleTelegramWebhook(request,env,api.fetcher);
}
const chat={id:42,type:'private'};
function start(id=1,text='/start'){return{update_id:id,message:{chat,text}};}
function callback(id,data){return{update_id:id,callback_query:{
  id:'query-'+id,data,message:{chat}
}};}
function text(id,message){return{update_id:id,message:{chat,text:message}};}
function env(){return{TELEGRAM_BOT_TOKEN:TOKEN,TELEGRAM_DB:new MockD1()};}

test('canonical world uses repeatable seed and feasible choices',()=>{
  assert.deepEqual(initialWorld(42),initialWorld(42));
  const world=initialWorld(42);
  const offered=options(world);
  assert.equal(offered.length,4);
  assert(offered.every(x=>x.plan.feasible));
  const built=applyPlan(world,offered[0].type);
  assert.equal(built.accepted,true);
  assert(built.world.revision>world.revision);
  assert.equal(built.world.tick,0);
  assert.equal(built.world.projects[0].active,false);
});
test('D1 session initializes and compare-and-set prevents duplicates',async()=>{
  const db=new MockD1();
  const session=await loadSession(db,42);
  assert.equal(session.revision,0);
  assert.equal(await saveSession(db,session,{updateId:15,pending:0}),true);
  assert.equal(await saveSession(db,session,{updateId:15,pending:0}),false);
  const saved=await loadSession(db,42);
  assert.equal(saved.pending,0);
  assert.equal(saved.lastUpdate,15);
});
test('webhook requires production secret and D1',async()=>{
  const e=env(),a=mockApi();
  assert.equal((await post(e,a,start(),'invalid')).status,403);
  assert.equal(a.calls.length,0);
  assert.equal((await post({...e,TELEGRAM_DB:null},a,start())).status,503);
});
test('start sends world-specific animation and seven controls, without AI calls',async()=>{
  const e=env(),a=mockApi();
  assert.equal((await post(e,a,start(10))).status,200);
  assert.deepEqual(a.calls.map(x=>x.method),['sendAnimation']);
  assert.equal(a.calls[0].payload.reply_markup.inline_keyboard.length,7);
  assert.equal(a.calls[0].payload.animation.type,'image/gif');
  assert(a.calls[0].payload.animation.size>1000);
  assert.equal((await loadSession(e.TELEGRAM_DB,42)).lastUpdate,10);
  await post(e,a,start(10));
  assert.equal(a.calls.length,1,'Telegram retry must not double-send');
});
test('failed animation falls back to a playable text message',async()=>{
  const e=env(),a=mockApi({animationOk:false});
  assert.equal((await post(e,a,start(10))).status,200);
  assert.deepEqual(a.calls.map(x=>x.method),['sendAnimation','sendMessage']);
  assert.equal(a.calls[1].payload.reply_markup.inline_keyboard.length,7);
});
test('choice updates D1 once and stale buttons cannot replay mutations',async()=>{
  const e=env(),a=mockApi({animationOk:false});
  await post(e,a,start(1));
  const choice=a.calls.find(x=>x.method==='sendMessage').payload.reply_markup.inline_keyboard[0][0];
  assert.match(choice.callback_data,/^tg2:0:/);
  assert.equal((await post(e,a,callback(2,choice.callback_data))).status,200);
  const stored=await loadSession(e.TELEGRAM_DB,42);
  assert.equal(stored.world.tick,0);
  assert.equal(stored.world.projects.length,1);
  assert(stored.revision>0);
  await post(e,a,callback(2,choice.callback_data));
  assert.deepEqual((await loadSession(e.TELEGRAM_DB,42)).world,stored.world);
  await post(e,a,callback(3,choice.callback_data));
  assert.deepEqual((await loadSession(e.TELEGRAM_DB,42)).world,stored.world);
  const next='tg2:'+stored.world.revision+':next';
  await post(e,a,callback(4,next));
  assert.equal((await loadSession(e.TELEGRAM_DB,42)).world.tick,1);
  assert(a.calls.every(x=>!x.method.includes('openai')));
});
test('free-text idea is compiled by canonical engine, saved and resumed',async()=>{
  const e=env(),a=mockApi();
  await post(e,a,start(1));
  const free='tg2:0:free';
  await post(e,a,callback(2,free));
  assert.equal((await loadSession(e.TELEGRAM_DB,42)).pending,0);
  await post(e,a,text(3,'Построить солнечные панели, чтобы пережить кризис'));
  const stored=await loadSession(e.TELEGRAM_DB,42);
  assert.equal(stored.pending,null);
  assert(stored.world.projects.some(p=>p.type==='solar'));
  const tick=stored.world.tick;
  await post(e,a,start(4));
  assert.equal((await loadSession(e.TELEGRAM_DB,42)).world.tick,tick);
});
test('new game resets the world while advancing restart counter',async()=>{
  const e=env(),a=mockApi();
  await post(e,a,start(1));
  await post(e,a,callback(2,'tg2:0:reset'));
  const world=await loadSession(e.TELEGRAM_DB,42);
  assert.equal(world.restart,1);
  assert.equal(world.world.tick,0);
  assert.notEqual(world.world.seed,initialWorld(42).seed);
});
test('no affordable projects triggers next-day recovery path',async()=>{
  const e=env(),a=mockApi();
  const session=await loadSession(e.TELEGRAM_DB,42);
  session.world.resources.budget=0;
  e.TELEGRAM_DB.rows.get('42').world=JSON.stringify(session.world);
  assert.equal(options(session.world).length,0);
  const next=view(session.world).reply_markup.inline_keyboard[0][0].callback_data;
  assert.match(next,/next$/);
  await post(e,a,callback(1,next));
  assert.equal((await loadSession(e.TELEGRAM_DB,42)).world.tick,1);
});
test('health is a cached D1 read; Cron verifies the actual Telegram webhook',async()=>{
  const e=env(),a=mockApi();
  assert.equal((await telegramStatus(e)).status,503);
  assert.equal(await registerTelegramWebhook(e,a.fetcher),true);
  assert.deepEqual(a.calls.map(x=>x.method),['getWebhookInfo','getMe']);
  const res=await telegramStatus(e);
  assert.equal(res.status,200);
  assert.equal((await res.json()).botUsername,'World_serverbot');
  // Public health can be called repeatedly without causing external API traffic.
  await telegramStatus(e);await telegramStatus(e);
  assert.equal(a.calls.length,2);
  const missing=mockApi({webhookUrl:''});
  assert.equal(await registerTelegramWebhook(e,missing.fetcher),false,
    'A rejected registration must not mark health ready');
  assert.deepEqual(missing.calls.map(x=>x.method),['getWebhookInfo','setWebhook','getWebhookInfo']);
});
