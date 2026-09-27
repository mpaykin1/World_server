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
  assert.equal(initial.placed.city,0,'No built cinematic city before player action');
  const city=await send('/action',{method:'POST',payload:{
    kind:'build',type:'city',revision:initial.revision}});
  assert.equal(city.status,200);
  assert.equal(city.placed.city,1);
  assert.equal(city.building.some(p=>p.type==='luxury_arcology'),true);
  assert.equal(city.state.budget,initial.state.budget-35);
  const cityReloaded=await send('/state');
  assert.equal(cityReloaded.revision,city.revision);
  assert.equal(cityReloaded.placed.city,1);
  const first=await send('/action',{method:'POST',payload:{
    kind:'idea',text:'Прилетел дракон',revision:city.revision}});
  assert.equal(first.status,200);
  assert.equal(first.story.last.kind,'dragon_arrival');
  assert.equal(first.placed.dragon,true);
  assert.equal(first.story.dragon.hp,100);
  const second=await send('/action',{method:'POST',payload:{
    kind:'idea',text:'Люди в него стреляют',revision:first.revision}});
  assert.equal(second.status,200);
  assert.equal(second.story.last.kind,'defense');
  assert.equal(second.story.dragon.hp,72);
  assert.equal(second.story.last.reaction,'dragon_counterattack');
  assert.equal(second.story.active.kind,'dragon_fire');
  assert.equal(second.placed.city,0,'city visibly damaged after the dragon response');
  assert.equal(second.story.ruins.some(r=>r.type==='luxury_arcology'),true);
  assert.equal(second.state.budget,first.state.budget-35);
  assert(second.state.water<first.state.water);
  assert(second.state.health<first.state.health);
  assert(second.state.population<first.state.population);
  const replay=await send('/action',{method:'POST',payload:{
    kind:'idea',text:'Люди в него стреляют',revision:first.revision}});
  assert.equal(replay.status,409,'A stale browser may not overwrite a Telegram turn');
  const resumed=await send('/state');
  assert.equal(resumed.revision,second.revision);
  assert.equal(resumed.story.dragon.hp,72);
  assert.equal(resumed.story.active.kind,'dragon_fire');
  assert.equal(resumed.story.ruins.length,1);
  const reset=await send('/action',{method:'POST',payload:{
    kind:'reset',revision:resumed.revision}});
  assert.equal(reset.status,200);
  assert.equal(reset.story.dragon,null);
  console.log('PASS: guest city -> dragon -> archery -> counterattack/fire and persisted ruins,');
  console.log('      revision conflict, reset and GitHub Pages CORS on exact-preview Worker.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
