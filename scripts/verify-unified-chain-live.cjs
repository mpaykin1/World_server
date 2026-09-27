// Exact-preview, no-secret E2E: the same worker + durable D1 powers every turn.
const assert=require('node:assert/strict');
const origin=String(process.argv[2]||'').replace(/\/+$/,'');
if(!/^https:\/\/[a-z0-9.-]+\.workers\.dev$/.test(origin))
  throw Error('Supply the exact preview Worker URL (https only)');
const api=origin+'/api/chain',cors='https://mpaykin1.github.io';
let token='';
async function send(path,{method='GET',payload,revision}={}){
  const response=await fetch(api+path,{method,headers:{
    origin:cors,...(token?{authorization:'Bearer '+token}:{}),
    ...(payload?{'content-type':'application/json'}:{})
  },...(payload?{body:JSON.stringify(payload)}:{})});
  const value=await response.json();
  assert.equal(response.headers.get('access-control-allow-origin'),cors,
    'Production GitHub Pages origin must be CORS-approved');
  return{status:response.status,...value};
}
(async()=>{
  const pre=await fetch(api+'/session',{method:'OPTIONS',headers:{
    origin:cors,'access-control-request-method':'POST',
    'access-control-request-headers':'authorization,content-type'}});
  assert.equal(pre.status,204);
  const created=await send('/session',{method:'POST',payload:{}});
  assert.equal(created.status,201,'Guest session creation requires applied D1 migration');
  assert.match(created.token,/^[A-Za-z0-9_-]{43}$/);
  token=created.token;
  const initial=await send('/state');
  assert.equal(initial.status,200);
  assert.equal(initial.linked,false);
  assert.equal(initial.revision,0);
  const first=await send('/action',{method:'POST',payload:{
    kind:'idea',text:'Прилетел дракон',revision:initial.revision}});
  assert.equal(first.status,200);
  assert.equal(first.story.last.kind,'dragon_arrival');
  assert.equal(first.placed.dragon,true);
  assert.equal(first.story.dragon.hp,100);
  const second=await send('/action',{method:'POST',payload:{
    kind:'idea',text:'Люди в него стреляют',revision:first.revision}});
  assert.equal(second.status,200);
  assert.equal(second.story.last.kind,'defense');
  assert.equal(second.story.dragon.hp,72);
  assert.equal(second.state.budget,first.state.budget-5);
  const replay=await send('/action',{method:'POST',payload:{
    kind:'next',revision:first.revision}});
  assert.equal(replay.status,409,'A stale browser may not overwrite a Telegram turn');
  const resumed=await send('/state');
  assert.equal(resumed.revision,second.revision);
  assert.equal(resumed.story.dragon.hp,72);
  const reset=await send('/action',{method:'POST',payload:{
    kind:'reset',revision:resumed.revision}});
  assert.equal(reset.status,200);
  assert.equal(reset.story.dragon,null);
  console.log('PASS: anonymous guest, D1 persistence, dragon arrival, pronoun combat,');
  console.log('      revision conflict, reset and GitHub Pages CORS on exact-preview Worker.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
