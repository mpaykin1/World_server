import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {newBrowserToken,telegramUserId,issueLinkCode} from '../chain-session.mjs';
import {browserSnapshot,handleUnifiedGame} from '../chain-unified-api.mjs';
import {initialWorld,loadSession,applyPlan} from '../telegram-state.mjs';
import {applyStoryText} from '../telegram-story.mjs';
globalThis.crypto??=webcrypto;
const TOKEN='123456:FAKE_EXAMPLE_ONLY_ABCDEFGHIJKLMNOP';
const BASE='https://world-server.mmmpaykin.workers.dev/api/chain';
const ORIGIN='https://mpaykin1.github.io';
class MockD1{
  sessions=new Map();tokens=new Map();codes=new Map();
  async batch(statements){const result=[];for(const statement of statements)result.push(await statement.run());return result;}
  prepare(sql){
    return{bind:(...a)=>({
      first:async()=>{
        if(sql.startsWith('SELECT chat_id FROM chain_link_codes')){
          const record=this.codes.get(a[0]);
          return record&&record.expires>Date.now()?{chat_id:record.chatId}:null;
        }
        if(sql.startsWith('SELECT * FROM telegram_sessions'))
          return this.sessions.get(a[0])||null;
        if(sql.startsWith('SELECT chat_id FROM chain_browser_tokens'))
          return this.tokens.has(a[0])?{chat_id:this.tokens.get(a[0])}:null;
        if(sql.startsWith('DELETE FROM chain_link_codes WHERE code=')){
          const record=this.codes.get(a[0]);
          if(!record||record.expires<Date.now()||(a.length>1&&record.chatId!==a[1]))return null;
          this.codes.delete(a[0]);return{chat_id:record.chatId};
        }
        throw Error('Unsupported FIRST: '+sql);
      },
      run:async()=>{
        if(sql.startsWith('INSERT OR IGNORE INTO telegram_sessions')){
          const [id,world,revision]=a;
          if(!this.sessions.has(id))this.sessions.set(id,{chat_id:id,world,revision,
            restart:0,pending_revision:null,last_update_id:-1});
          return{meta:{changes:1}};
        }
        if(sql.startsWith('INSERT INTO chain_browser_tokens')){
          this.tokens.set(a[0],a[1]);return{meta:{changes:1}};
        }
        if(sql.startsWith('INSERT INTO chain_link_codes')){
          this.codes.set(a[0],{chatId:a[1],expires:Date.now()+600000});
          return{meta:{changes:1}};
        }
        if(sql.startsWith('UPDATE chain_browser_tokens')){
          if(!this.tokens.has(a[1])||(a.length>=3&&this.tokens.get(a[1])!==a[2]))
            return{meta:{changes:0}};
          if(sql.includes('EXISTS (SELECT 1 FROM telegram_sessions')){
            const target=this.sessions.get(a[3]);
            if(!target||target.revision!==a[4]||target.world!==a[5])
              return{meta:{changes:0}};
          }
          this.tokens.set(a[1],a[0]);return{meta:{changes:1}};
        }
        if(sql.startsWith('UPDATE telegram_sessions')){
          const [world,revision,restart,pendingOrId,idOrRev,expectedRev]=a;
          const id=a.length===5?a[3]:a[5];
          const expected=a.length===5?a[4]:a[6];
          const old=this.sessions.get(id);
          if(!old||old.revision!==expected)return{meta:{changes:0}};
          this.sessions.set(id,{...old,world,revision,restart,
            pending_revision:null});return{meta:{changes:1}};
        }
        if(sql.startsWith('DELETE FROM chain_link_codes WHERE expires_at'))
          return{meta:{changes:0}};
        throw Error('Unsupported RUN: '+sql);
      }
    }),
    run:async()=>{
      if(sql.startsWith('DELETE FROM chain_link_codes WHERE expires_at'))
        return{meta:{changes:0}};
      if(sql.startsWith('CREATE TABLE')||sql.startsWith('CREATE INDEX'))return{meta:{changes:0}};
      throw Error('Unsupported bare RUN: '+sql);
    }};
  }
}
function request(path,method='GET',body,token='',origin=ORIGIN){
  return new Request(BASE+path,{method,headers:{
    origin,...(token?{authorization:'Bearer '+token}:{}),
    ...(body===undefined?{}:{'content-type':'application/json'})
  },...(body===undefined?{}:{body:JSON.stringify(body)})});
}
async function call(env,path,method,body,token,origin){
  const result=await handleUnifiedGame(request(path,method,body,token,origin),env);
  return{status:result.status,data:await result.json(),response:result};
}
test('anonymous browser token is cryptographically random and non-identifying',()=>{
  const a=newBrowserToken(),b=newBrowserToken();
  assert.match(a,/^[a-zA-Z0-9_-]{43}$/);
  assert.notEqual(a,b);
});
test('Telegram WebApp signature is verified, tamper-proof and expires',async()=>{
  const ts=1700000000,user=JSON.stringify({id:42,first_name:'Test'});
  const data=[['auth_date',String(ts)],['user',user]];
  const text=data.map(([k,v])=>k+'='+v).join('\n');
  const hmac=async(key,value)=>new Uint8Array(await crypto.subtle.sign(
    'HMAC',await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']),
    new TextEncoder().encode(value)));
  const key=await hmac(new TextEncoder().encode('WebAppData'),TOKEN);
  const hash=[...await hmac(key,text)].map(n=>n.toString(16).padStart(2,'0')).join('');
  const signed=new URLSearchParams([...data,['hash',hash]]).toString();
  assert.equal(await telegramUserId(signed,TOKEN,ts*1000),'42');
  assert.equal(await telegramUserId(signed.replace('Test','Evil'),TOKEN,ts*1000),null);
  assert.equal(await telegramUserId(signed,TOKEN,ts*1000+86400001),null);
});
test('pronoun follow-up shooting updates the SAME persisted dragon',()=>{
  const before=initialWorld(42),arrived=applyStoryText(before,'Прилетел дракон').world;
  assert.equal(arrived.story.last.kind,'dragon_arrival');
  assert.equal(arrived.story.dragon.hp,100);
  const after=applyStoryText(arrived,'Люди в него стреляют').world;
  assert.equal(after.story.last.kind,'defense');
  assert.equal(after.story.dragon.hp,72);
  assert.equal(browserSnapshot(after).placed.dragon,true);
  assert.equal(after.resources.budget,arrived.resources.budget-5);
});
test('Telegram and browser share D1 state, revisions and one-time pairing',async()=>{
  const env={TELEGRAM_DB:new MockD1(),TELEGRAM_BOT_TOKEN:TOKEN};
  const created=await call(env,'/session','POST',{});
  assert.equal(created.status,201);
  const browserToken=created.data.token;
  const guest=await call(env,'/state','GET',undefined,browserToken);
  assert.equal(guest.status,200);
  assert.equal(guest.data.linked,false);
  const city=await call(env,'/action','POST',{kind:'build',type:'city',
    revision:guest.data.revision},browserToken);
  assert.equal(city.status,200);
  assert.ok(city.data.placed.city>0);
  const dragon=await call(env,'/action','POST',{kind:'idea',text:'Прилетел дракон',
    revision:city.data.revision},browserToken);
  assert.equal(dragon.status,200);
  assert.equal(dragon.data.story.dragon.hp,100);
  const shot=await call(env,'/action','POST',{kind:'idea',text:'Люди в него стреляют',
    revision:dragon.data.revision},browserToken);
  assert.equal(shot.status,200);
  assert.equal(shot.data.story.dragon.hp,72);
  const stale=await call(env,'/action','POST',{kind:'next',revision:dragon.data.revision},
    browserToken);
  assert.equal(stale.status,409);
  const guestChatId=[...env.TELEGRAM_DB.sessions.keys()].find(id=>id.startsWith('guest:'));
  const guestSeed=JSON.parse(env.TELEGRAM_DB.sessions.get(guestChatId).world).seed;
  const tg=await loadSession(env.TELEGRAM_DB,42);
  const code=await issueLinkCode(env.TELEGRAM_DB,42);
  assert.equal((await call(env,'/link','POST',{code},browserToken)).status,200);
  assert.equal((await call(env,'/link','POST',{code},browserToken)).status,400,
    'pairing code must be redeemed only once');
  const linked=await call(env,'/state','GET',undefined,browserToken);
  assert.equal(linked.data.linked,true);
  assert.equal(linked.data.revision,shot.data.revision);
  assert.equal(linked.data.story.dragon.hp,72);
  assert.ok(linked.data.placed.city>0,'browser city survived pairing');
  // Simulate a Telegram message modifying that exact adopted row.
  const adopted=await loadSession(env.TELEGRAM_DB,42);
  assert.equal(adopted.world.seed,guestSeed);
  const changed=applyStoryText(adopted.world,'Люди в него стреляют из луков').world;
  const updated=await env.TELEGRAM_DB.prepare(
    'UPDATE telegram_sessions SET world=?,revision=?,restart=?,pending_revision=NULL,updated_at=CURRENT_TIMESTAMP WHERE chat_id=? AND revision=?'
  ).bind(JSON.stringify(changed),changed.revision,adopted.restart,adopted.chatId,adopted.revision).run();
  assert.equal(updated.meta.changes,1);
  const browser=await call(env,'/state','GET',undefined,browserToken);
  assert.equal(browser.data.story.dragon.hp,changed.story.dragon.hp);
  assert.ok(browser.data.story.dragon.hp<72,'Telegram attack changed the same dragon');
  assert.ok(browser.data.placed.city>0);
  assert.equal((await loadSession(env.TELEGRAM_DB,42)).world.story.dragon.hp,browser.data.story.dragon.hp);
});

test('a nonempty Telegram world never overwrites a progressed browser world on pairing',async()=>{
  const env={TELEGRAM_DB:new MockD1(),TELEGRAM_BOT_TOKEN:TOKEN};
  const created=await call(env,'/session','POST',{});
  const token=created.data.token;
  const initial=(await call(env,'/state','GET',undefined,token)).data;
  const city=await call(env,'/action','POST',{
    kind:'build',type:'city',revision:initial.revision},token);
  assert.equal(city.status,200);
  const telegram=await loadSession(env.TELEGRAM_DB,77);
  const dragon=applyStoryText(telegram.world,'Прилетел дракон').world;
  const persisted=await env.TELEGRAM_DB.prepare(
    'UPDATE telegram_sessions SET world=?,revision=?,restart=?,pending_revision=NULL,updated_at=CURRENT_TIMESTAMP WHERE chat_id=? AND revision=?'
  ).bind(JSON.stringify(dragon),dragon.revision,telegram.restart,telegram.chatId,telegram.revision).run();
  assert.equal(persisted.meta.changes,1);
  const code=await issueLinkCode(env.TELEGRAM_DB,77);
  const attempt=await call(env,'/link','POST',{code},token);
  assert.equal(attempt.status,409);
  assert.equal(env.TELEGRAM_DB.codes.has(code),true,'rejected link code is not consumed');
  const browser=(await call(env,'/state','GET',undefined,token)).data;
  assert.equal(browser.linked,false);
  assert.equal(browser.revision,city.data.revision);
  assert.ok(browser.placed.city>0);
  const telegramAfter=await loadSession(env.TELEGRAM_DB,77);
  assert.equal(telegramAfter.world.story.dragon.hp,100);
});
test('API blocks foreign origins and missing bearer tokens',async()=>{
  const env={TELEGRAM_DB:new MockD1(),TELEGRAM_BOT_TOKEN:TOKEN};
  assert.equal((await call(env,'/session','POST',{},'', 'https://evil.example')).status,403);
  assert.equal((await call(env,'/state','GET')).status,401);
});
