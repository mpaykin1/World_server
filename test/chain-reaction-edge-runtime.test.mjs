import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { handleChainReaction } from '../supabase/functions/world-emergence/chain-reaction.ts';
const require = createRequire(import.meta.url);
const { handle: handleNode } = require('../lib/chain-reaction-api.js');
const engine = require('../lib/world-consequence-engine.js');
const owner = '11111111-1111-4111-8111-111111111111';
const player = '22222222-2222-4222-8222-222222222222';
const copy = value => JSON.parse(JSON.stringify(value));
const body = (action, extra = {}) => ({action, worldId:'city', structure:'solar', text:'', ...extra});
function fixture({zeroBudget = false} = {}) {
  const world = engine.createWorld('edge-runtime-review');
  world.resources.budget = zeroBudget ? 0 : 500;
  Object.assign(world.residents[0], { comment:'LEGACY RESIDENT SECRET', actorId:owner, category:'hidden-class', role:'tampered',
    id:{actorId:owner}, name:{comment:'NESTED RESIDENT SECRET'} });
  world.history.push({kind:'legacy', tick:0, comment:'LEGACY HISTORY SECRET', actorId:owner});
  let row = {id:'city', seed:'edge-runtime-review', updated_at:'2026-09-23T00:00:00.000Z', settings:{chainReaction:world}};
  const members = new Map([[owner,'owner'], [player,'player']]);
  let writes = 0;
  const admin = {
    auth:{getUser:async token=>({data:{user:token==='valid'?{id:owner}:token==='player'?{id:player}:null},error:null})},
    from(table){ const filters={};return {
      select(){return this}, eq(k,v){filters[k]=v;return this},
      async maybeSingle(){
        if(table==='profiles')return {data:{username:'Reviewer'},error:null};
        if(table==='voxel_worlds')return {data:copy(row),error:null};
        if(table==='chain_reaction_world_members')return {data:members.get(filters.user_id)?{role:members.get(filters.user_id)}:null,error:null};
        throw Error('Unexpected table '+table);
      }
    };},
    async rpc(name,params){
      assert.equal(name,'commit_chain_reaction_action');
      if(row.updated_at!==params.p_expected_updated_at)return {data:false,error:null};
      assert.doesNotMatch(JSON.stringify(params.p_public_settings),/LEGACY RESIDENT SECRET|NESTED RESIDENT SECRET|LEGACY HISTORY SECRET|actorId|hidden-class|tampered/);
      row={...row,settings:copy(params.p_public_settings),updated_at:params.p_next_updated_at};
      writes++;return {data:true,error:null};
    }
  };
  return {admin,members,get writes(){return writes},get row(){return row}};
}
const runEdge=(f,b,token='valid')=>handleChainReaction(f.admin,new Request('https://example.org/api/voxel',{headers:{authorization:'Bearer '+token}}),b,{json:payload=>payload});
const runNode=(f,b,token='valid')=>handleNode(f.admin,{headers:{authorization:'Bearer '+token}},b);
test('actual Edge TS adapter matches Node same-revision bootstrap; legacy privacy; read only',async()=>{
  const f=fixture(),b=body('game-state');
  const edge=await runEdge(f,b),node=await runNode(f,b);
  assert.deepEqual({...edge,runtime:undefined},{...node,runtime:undefined});
  assert.equal(edge.revision,edge.world.revision);
  assert.doesNotMatch(JSON.stringify(edge),/LEGACY RESIDENT SECRET|NESTED RESIDENT SECRET|LEGACY HISTORY SECRET|actorId|hidden-class|tampered/);
  assert.deepEqual(Object.keys(edge.world.residents[0]).sort(),['building','fictional','flat','floor','id','name']);
  assert.equal(f.writes,0);
});
test('actual Edge historical privacy holds in preview, history, commit, tick',async()=>{
  const f=fixture();
  const responses=[await runEdge(f,body('preview-plan')),await runEdge(f,body('history'))];
  responses.push(await runEdge(f,body('commit-plan',{expectedRevision:0})));
  responses.push(await runEdge(f,body('tick',{expectedRevision:1})));
  for(const value of responses)assert.doesNotMatch(JSON.stringify(value),/LEGACY RESIDENT SECRET|NESTED RESIDENT SECRET|LEGACY HISTORY SECRET|actorId|hidden-class|tampered/);
  assert.equal(f.writes,2);
});
test('actual Edge uses current membership, strict revision fence and honest 0 offers',async()=>{
  const f=fixture({zeroBudget:true});
  const edge=await runEdge(f,body('game-state',{expectedRevision:0}));
  assert.equal(edge.cards.length,0); assert.equal(edge.degraded,true); assert.equal(edge.fifth.acceptsFreeText,true);
  f.members.delete(player);
  await assert.rejects(runEdge(f,body('game-state'),'player'),e=>e.status===403);
  for(const bad of [-1,1.5,'0',null])await assert.rejects(runEdge(f,body('game-state',{expectedRevision:bad})),e=>e.status===400);
  assert.equal(f.writes,0);
});
test('actual Edge CAS two writers, stale 409 then latest refresh',async()=>{
  const f=fixture(),b=body('commit-plan',{expectedRevision:0});
  const results=await Promise.allSettled([runEdge(f,b),runEdge(f,b)]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.find(x=>x.status==='rejected').reason.status,409);
  await assert.rejects(runEdge(f,body('game-state',{expectedRevision:0})),e=>e.status===409);
  assert.equal((await runEdge(f,body('game-state'))).revision,1);
  assert.equal(f.writes,1);
});

test('real Edge and Node discard injected services when houses missing, skip null history',async()=>{
 const f=fixture();const w=f.row.settings.chainReaction;
 delete w.houses;delete w.residents;
 w.cityServices={version:1,houses:[{id:'bad',secret:'EDGE_SECRET_SENTINEL'}]};
 w.history.push(null);
 await assert.rejects(runEdge(f,body('preview-plan')),e=>e.status===409);
 await assert.rejects(runNode(f,body('preview-plan')),e=>e.status===409);
 assert.equal(f.writes,0);
});

test('malformed historical null event does not crash Node or Edge game-state',async()=>{
 const f=fixture();f.row.settings.chainReaction.history.push(null);
 f.row.settings.chainReaction.cityServices={version:1,houses:[{id:'bad',secret:'EDGE_SECRET_SENTINEL'}]};
 const edge=await runEdge(f,body('game-state'));
 const node=await runNode(f,body('game-state'));
 assert.deepEqual({...edge,runtime:undefined},{...node,runtime:undefined});
 assert(edge.world.history.every(e=>e&&typeof e==='object'));
 assert.deepEqual(edge.world.cityServices,engine.cityServices(f.row.settings.chainReaction));
 assert.doesNotMatch(JSON.stringify(edge),/EDGE_SECRET_SENTINEL/);
});
