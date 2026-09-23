'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {dispatch}=require('../lib/world-genie-api');
const {handle}=require('../api/voxel')._private;
const engine=require('../lib/world-consequence-engine');
function mockDb(seed='volcano'){
 const record={id:'world-test',seed,settings:{worldDNA:{}},updated_at:'2026-09-23T00:00:00.000Z'};
 let writes=0,deny=false,conflict=false;
 const admin={from(table){
  if(table==='voxel_player_states')return {select(){return this},eq(){return this},async maybeSingle(){return {data:deny?null:{id:'member'},error:null}}};
  if(table==='voxel_worlds')return {select(){return this},eq(){return this},is(){return this},update(payload){this.payload=payload;return this},async maybeSingle(){
   if(this.payload){if(conflict)return {data:null,error:null};Object.assign(record,this.payload);writes++;return {data:{id:record.id},error:null}};
   return {data:structuredClone(record),error:null};
  }};
  throw Error('Unexpected table '+table);
 }};
 return {admin,record,get writes(){return writes},deny(){deny=true},conflict(){conflict=true}};
}
test('voxel router exposes Genie actions only to authenticated users',async()=>{
 const db=mockDb();
 await assert.rejects(()=>handle(db.admin,{userId:null},'history',{action:'history',worldId:'world-test'}),{status:401});
 const result=await handle(db.admin,{userId:'user'},'history',{action:'history',worldId:'world-test'});
 assert.equal(result.worldId,'world-test');
 assert.equal(db.writes,0);
});

test('intent and preview are read-only, with no free power',async()=>{
 const db=mockDb();
 const args={action:'preview',worldId:'world-test',structure:'solar',comment:'поэтапно'};
 const result=await dispatch(db.admin,'user',args);
 assert.equal(result.intent.goal,'solar');assert.equal(result.plan.buildTicks,3);
 assert.equal(db.writes,0);
});
test('commit and ticks persist through canonical worldDNA with monotonic revisions',async()=>{
 const db=mockDb();
 const base=await dispatch(db.admin,'user',{action:'history',worldId:'world-test'});
 const commit=await dispatch(db.admin,'user',{action:'commit',worldId:'world-test',structure:'solar',comment:'',expectedRevision:base.revision});
 assert.equal(commit.revision,base.revision+1);
 assert.equal(db.record.settings.worldDNA.consequenceWorld.projects.length,1);
 assert.equal(db.record.settings.worldDNA.consequenceWorld.projects[0].active,false);
 await assert.rejects(()=>dispatch(db.admin,'user',{action:'tick',worldId:'world-test',expectedRevision:base.revision}),{status:409});
 const next=await dispatch(db.admin,'user',{action:'tick',worldId:'world-test',expectedRevision:commit.revision});
 assert.equal(next.tick,1);assert.equal(db.writes,2);
 const history=await dispatch(db.admin,'user',{action:'history',worldId:'world-test'});
 assert.equal(history.history[0].kind,'project_started');
 assert.equal(history.revision,next.revision);
});
test('membership, CAS conflict, and request validation fail closed',async()=>{
 const db=mockDb();
 db.deny();
 await assert.rejects(()=>dispatch(db.admin,'user',{action:'history',worldId:'world-test'}),{status:403});
 const db2=mockDb();db2.conflict();
 await assert.rejects(()=>dispatch(db2.admin,'user',{action:'tick',worldId:'world-test',expectedRevision:0}),{status:409});
 await assert.rejects(()=>dispatch(db2.admin,'user',{action:'commit',worldId:'world-test',structure:'unknown',comment:'',expectedRevision:0}),{status:400});
 await assert.rejects(()=>dispatch(db2.admin,'user',{action:'history',worldId:'world-test',limit:10000}),{status:400});
});
test('same seed and commands yield identical canonical state',()=>{
 const w=engine.createWorld('repeatable');
 const a=engine.interpretIntent('solar','solar');
 assert.deepEqual(engine.tick(engine.commit(w,a,0)),engine.tick(engine.commit(engine.createWorld('repeatable'),a,0)));
});
