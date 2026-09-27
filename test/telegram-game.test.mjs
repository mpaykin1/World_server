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
function mockApi({photoOk=true,animationOk=true,webhookUrl=URL}={}){
  const calls=[];
  const fetcher=async(url,init)=>{
    const method=url.split('/').at(-1),payload=JSON.parse(init.body);
    calls.push({method,payload});
    if((method==='sendPhoto'&&!photoOk)||(method==='sendAnimation'&&!animationOk))
      return new Response(JSON.stringify({ok:false}),{status:404});
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
test('start sends new-world animation and seven controls, without AI calls',async()=>{
  const e=env(),a=mockApi();
  assert.equal((await post(e,a,start(10))).status,200);
  assert.deepEqual(a.calls.map(x=>x.method),['sendAnimation']);
  assert.match(a.calls[0].payload.animation,/origin-\d\.mp4$/);
  assert.match(a.calls[0].payload.caption,/Новый мир создан/);
  assert.equal(a.calls[0].payload.reply_markup.inline_keyboard.length,7);
  assert.equal((await loadSession(e.TELEGRAM_DB,42)).lastUpdate,10);
  await post(e,a,start(10));
  assert.equal(a.calls.length,1,'Telegram retry must not double-send');
});
test('failed animation and image fall back to a playable text message',async()=>{
  const e=env(),a=mockApi({photoOk:false,animationOk:false});
  assert.equal((await post(e,a,start(10))).status,200);
  assert.deepEqual(a.calls.map(x=>x.method),['sendAnimation','sendPhoto','sendMessage']);
  assert.equal(a.calls[2].payload.reply_markup.inline_keyboard.length,7);
});
test('choice updates D1 once and stale buttons cannot replay mutations',async()=>{
  const e=env(),a=mockApi({photoOk:false,animationOk:false});
  await post(e,a,start(1));
  const choice=a.calls.find(x=>x.method==='sendMessage').payload.reply_markup.inline_keyboard[0][0];
  assert.match(choice.callback_data,/^tg2:0:/);
  assert.equal((await post(e,a,callback(2,choice.callback_data))).status,200);
  const stored=await loadSession(e.TELEGRAM_DB,42);
  assert.equal(stored.world.tick,0);
  assert.equal(stored.world.projects.length,1);
  assert(a.calls.some(x=>x.method==='sendMessage'&&/Строительство началось|Началось строительство/i.test(x.payload.text)));
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
test('animated media uses the same event still if Telegram rejects MP4',async()=>{
  const e=env(),a=mockApi({animationOk:false,photoOk:true});
  assert.equal((await post(e,a,start(11))).status,200);
  assert.deepEqual(a.calls.map(x=>x.method),['sendAnimation','sendPhoto']);
  const video=a.calls[0].payload.animation,photo=a.calls[1].payload.photo;
  assert.equal(video.replace('.mp4',''),photo.replace('.png',''));
  assert.match(a.calls[1].payload.caption,/Новый мир создан/);
});
test('every ordinary day is illustrated and offers fresh choices',async()=>{
  const e=env(),a=mockApi();
  await post(e,a,start(1));
  const data='tg2:0:next';
  await post(e,a,callback(2,data));
  assert.equal((await loadSession(e.TELEGRAM_DB,42)).world.tick,1);
  const illustrated=a.calls.filter(x=>x.method==='sendPhoto');
  assert(illustrated.length>=1);
  assert.match(illustrated.at(-1).payload.photo,/day-[0-2]\.png$/);
  assert.match(illustrated.at(-1).payload.caption,/За этот ход:.*⚡/s);
  assert(illustrated.at(-1).payload.reply_markup.inline_keyboard.length>=3);
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

test('dragon story sent through My Variant burns structures and shows rescue choices',async()=>{
  const e=env(),a=mockApi();
  await post(e,a,start(10));
  await post(e,a,callback(11,'tg2:0:free'));
  await post(e,a,text(12,'Прилетел дракон и сжег комплекс'));
  const saved=await loadSession(e.TELEGRAM_DB,42);
  assert.equal(saved.pending,null);
  assert.equal(saved.revision,1);
  assert.equal(saved.world.story.last.kind,'dragon_fire');
  assert.equal(saved.world.story.ruins.length,1);
  assert.equal(saved.world.projects.length,0,'No automatic workshop');
  assert(saved.world.resources.budget<150);
  const scene=a.calls.filter(x=>x.method==='sendAnimation').at(-1).payload;
  assert.match(scene.animation,/story_dragon_fire-\d\.mp4$/);
  assert.match(scene.caption,/дракон|Дракон/i);
  assert.match(scene.caption,/сжег комплекс/);
  const fireButton=scene.reply_markup.inline_keyboard.flat()
    .find(button=>button.callback_data.endsWith(':extinguish'));
  assert(fireButton,'Contextual firefighting button missing');
  await post(e,a,callback(13,fireButton.callback_data));
  const extinguished=await loadSession(e.TELEGRAM_DB,42);
  assert.equal(extinguished.world.story.active,null);
  assert(extinguished.world.resources.water<saved.world.resources.water);
  assert.match(a.calls.filter(x=>x.method==='sendAnimation').at(-1)
    .payload.animation,/story_extinguish-\d\.mp4$/);
});
test('D1 callback repairs malformed active incidents without spending resources',async()=>{
  for(const active of [{},'fire']){
    const e=env(),a=mockApi();
    const session=await loadSession(e.TELEGRAM_DB,42);
    session.world.story={active,ruins:[],last:null,evacuated:0};
    e.TELEGRAM_DB.rows.get('42').world=JSON.stringify(session.world);
    const before=structuredClone(session.world);
    assert.equal((await post(e,a,callback(1,'tg2:0:defend'))).status,200);
    const saved=await loadSession(e.TELEGRAM_DB,42);
    assert.equal(saved.world.story.active,null);
    assert.equal(saved.world.story.last.kind,'blocked');
    assert.deepEqual(saved.world.resources,before.resources);
    assert.equal(saved.world.population,before.population);
    assert(Object.values(saved.world.resources).every(Number.isFinite));
  }
});
test('D1 callback repairs malformed story envelopes without spending resources',async()=>{
  for(const story of ['fire',[],{active:null,ruins:'old-ruin',last:null,evacuated:0},
    {active:null,ruins:[null],last:null,evacuated:0},
    {active:null,ruins:['old-ruin'],last:null,evacuated:0},
    {active:null,ruins:[{id:'old-ruin',type:'invented',rebuilding:null}],last:null,evacuated:0}]){
    const e=env(),a=mockApi();
    const session=await loadSession(e.TELEGRAM_DB,42);
    session.world.story=story;
    e.TELEGRAM_DB.rows.get('42').world=JSON.stringify(session.world);
    const before=structuredClone(session.world);
    assert.equal((await post(e,a,callback(1,'tg2:0:defend'))).status,200);
    const saved=await loadSession(e.TELEGRAM_DB,42);
    assert.equal(saved.world.story.active,null);
    assert.deepEqual(saved.world.story.ruins,[]);
    assert.equal(saved.world.story.last.kind,'blocked');
    assert.deepEqual(saved.world.resources,before.resources);
    assert.equal(saved.world.population,before.population);
    assert(Object.values(saved.world.resources).every(Number.isFinite));
  }
});
test('D1 callback deduplicates canonical ruins before action eligibility',async()=>{
  const e=env(),a=mockApi();
  const session=await loadSession(e.TELEGRAM_DB,42);
  session.world.story={active:null,ruins:[
    {id:'same-ruin',type:'workshop',name:'Мастерская',source:'fire',rebuilding:null},
    {id:'same-ruin',type:'workshop',name:'Копия',source:'fire',rebuilding:null}
  ],last:null,evacuated:0};
  e.TELEGRAM_DB.rows.get('42').world=JSON.stringify(session.world);
  const before=structuredClone(session.world.resources);

  assert.equal((await post(e,a,callback(1,'tg2:0:defend'))).status,200);
  const saved=await loadSession(e.TELEGRAM_DB,42);
  assert.equal(saved.world.story.last.kind,'blocked');
  assert.equal(saved.world.story.ruins.length,1);
  assert.equal(saved.world.story.ruins[0].id,'same-ruin');
  assert.deepEqual(saved.world.resources,before);
});
test('Telegram view ignores malformed ruin elements',()=>{
  const world=initialWorld(42);
  world.story={active:null,ruins:[null,'old-ruin',{id:'old-ruin',type:'invented'},
    {id:'empty-marker',type:'workshop',rebuilding:''},
    {id:'object-marker',type:'workshop',rebuilding:{}}],
    last:null,evacuated:0};
  const rendered=view(world);
  assert(!rendered.reply_markup.inline_keyboard.flat()
    .some(button=>button.callback_data?.endsWith(':rebuild')));

  world.story.ruins=[{id:'canonical-ruin',type:'workshop',name:'Мастерская',
    source:'fire',rebuilding:null}];
  assert(view(world).reply_markup.inline_keyboard.flat()
    .some(button=>button.callback_data?.endsWith(':rebuild')),
  'a canonical unrepaired ruin must retain its rebuild control');
});
test('unsolicited free-form story, unrelated to menu state, is still executed',async()=>{
  const e=env(),a=mockApi();
  await post(e,a,start(1));
  await post(e,a,text(2,'Наводнение затопило город'));
  const saved=await loadSession(e.TELEGRAM_DB,42);
  assert.equal(saved.revision,1);
  assert.equal(saved.world.story.last.kind,'flood');
  assert.match(a.calls.filter(x=>x.method==='sendAnimation').at(-1)
    .payload.animation,/story_flood-[0-2]\.mp4$/);
  const count=a.calls.length;
  await post(e,a,text(2,'Наводнение затопило город'));
  assert.equal(a.calls.length,count,'Duplicate delivery must not create another story');
});

test('webhook chains dragon arrival, arrow follow-up and free AI fallback',async()=>{
  const e=env(),a=mockApi();
  let modelCalls=0;
  e.AI={run:async()=>{modelCalls++;
    return{response:JSON.stringify({kind:'flood',evidence:'Гигантская волна'})};
  }};
  await post(e,a,start(1));
  await post(e,a,text(2,'Прилетел дракон'));
  const arrival=(await loadSession(e.TELEGRAM_DB,42)).world;
  assert.equal(arrival.story.dragon.present,true);
  await post(e,a,text(3,'Люди стреляют в него из луков'));
  const shot=(await loadSession(e.TELEGRAM_DB,42)).world;
  assert.equal(modelCalls,0,'well-understood context must not spend AI quota');
  assert.equal(shot.story.last.kind,'defense');
  assert.equal(shot.story.dragon.health,2);
  assert.equal(shot.resources.budget,arrival.resources.budget-5);
  assert.match(a.calls.filter(x=>x.method==='sendAnimation').at(-1).payload.animation,
    /story_defense-\d\.mp4$/);
  const sent=a.calls.length;
  await post(e,a,text(3,'Люди стреляют в него из луков'));
  assert.deepEqual((await loadSession(e.TELEGRAM_DB,42)).world,shot,
    'Telegram retry must not reroll or double-charge the volley');
  assert.equal(a.calls.length,sent,'duplicate update must not render twice');
  await post(e,a,start(4));
  const resumed=(await loadSession(e.TELEGRAM_DB,42)).world;
  assert.equal(resumed.story.dragon.health,2);
  assert.equal(resumed.story.active.kind,'dragon_fire');
  await post(e,a,text(5,'Гигантская волна накрыла побережье'));
  const aiTurn=(await loadSession(e.TELEGRAM_DB,42)).world;
  assert.equal(modelCalls,1);
  assert.equal(aiTurn.story.last.kind,'flood');
  assert(aiTurn.resources.power<shot.resources.power);
});
test('D1 rejects reversed or conflicting archery without AI, charge or dragon mutation',async()=>{
  const e=env(),a=mockApi();
  let modelCalls=0;e.AI={run:async()=>{modelCalls++;return{response:'{}'}}};
  await post(e,a,start(1));
  await post(e,a,text(2,'Прилетел дракон'));
  const arrived=(await loadSession(e.TELEGRAM_DB,42)).world;
  for(const [id,message] of [[3,'Люди стреляют в волков из луков'],
    [4,'Дракон стреляет в людей из лука'],
    [5,'Люди отказались стрелять в него из луков'],
    [6,'Волк рядом. Люди стреляют по нему из луков'],
    [7,"People don't shoot him with bows"],
    [8,'Лучники неспособны стрелять в него из луков'],
    [9,'Citizens decline to shoot him with bows'],
    [10,'Люди отстрелялись по нему из луков'],
    [11,'Жители уже отстрелялись в дракона из луков'],
    [12,'Лучники завершили стрелять в него из луков'],
    [13,'Солдаты лишены возможности стрелять в него из луков'],
    [14,'Мы против того, чтобы стрелять в него из луков'],
    [15,'People finished shooting at him with bows'],
    [16,'Citizens have finished shooting at him with bows'],
    [17,'Archers completed shooting at him with bows'],
    [18,'We no longer shoot him with bows'],
    [19,'People lack the ability to shoot him with bows'],
    [20,'Citizens are against shooting at him with bows'],
    [21,'People shoot him with bows no longer'],
    [22,'People shoot him with bows, but not anymore'],
    [23,'Люди стреляют в него из луков, но передумали'],
    [24,'Рыцарь рядом. Люди стреляют по нему из луков'],
    [25,'Knight nearby. People shoot him with bows']]){
    await post(e,a,text(id,message));
    const stored=(await loadSession(e.TELEGRAM_DB,42)).world;
    assert.deepEqual(stored.resources,arrived.resources,message);
    assert.deepEqual(stored.story.dragon,arrived.story.dragon,message);
    assert.equal(stored.story.active,null,message);
    assert.match(stored.story.last.description,/кто стреляет и в кого/,message);
    assert(!stored.history.some(x=>x.kind==='telegram_story_dragon_arrows'));
  }
  assert.equal(modelCalls,0,'deterministic clarification must not spend AI quota');
});
