'use strict';
// Authoritative Genie API. Reuses the canonical deterministic consequence engine and voxel_worlds CAS.
const {httpError}=require('./http');
const engine=require('./world-consequence-engine');
const {safeWorldId}=require('./voxel-rules');
const ACTIONS=new Set(['intent','preview','commit','tick','history']);
function expectedRevision(value){
 if(!Number.isSafeInteger(value)||value<0)throw httpError(400,'expectedRevision must be a nonnegative integer');
 return value;
}
function validateIntent(body){
 if(typeof body.comment!=='string'||body.comment.length>600)throw httpError(400,'Comment must be a string of at most 600 characters');
 if(typeof body.structure!=='string'||!Object.hasOwn(engine.PROJECTS,body.structure))throw httpError(400,'Unknown structure');
 return engine.interpretIntent(body.comment,body.structure);
}
async function readWorld(admin,worldId,userId){
 // A signed-in player must have an existing world membership. Never create it implicitly here.
 const {data:member,error:memberError}=await admin.from('voxel_player_states').select('id').eq('user_id',userId).eq('world_id',worldId).maybeSingle();
 if(memberError)throw httpError(500,'Membership lookup failed');
 if(!member)throw httpError(403,'No access to this world');
 const {data:world,error}=await admin.from('voxel_worlds').select('id,seed,settings,updated_at').eq('id',worldId).maybeSingle();
 if(error)throw httpError(500,'World lookup failed');
 if(!world)throw httpError(404,'World not found');
 const settings=world.settings&&typeof world.settings==='object'?structuredClone(world.settings):{};
 const state=settings.worldDNA?.consequenceWorld || engine.createWorld(String(world.seed ?? worldId));
 return {world,settings,state};
}
async function persist(admin,current,next){
 const settings=current.settings;
 settings.worldDNA={...(settings.worldDNA||{}),consequenceWorld:next};
 const previous=current.world.updated_at;
 const now=new Date(Math.max(Date.now(),Date.parse(previous||'')+1||0)).toISOString();
 let query=admin.from('voxel_worlds').update({settings,updated_at:now}).eq('id',current.world.id);
 query=previous==null?query.is('updated_at',null):query.eq('updated_at',previous);
 const {data,error}=await query.select('id').maybeSingle();
 if(error)throw httpError(500,'World save failed');
 if(!data)throw httpError(409,'Concurrent world update; reload and retry');
 return next;
}
async function dispatch(admin,userId,body){
 if(!body||typeof body!=='object'||!ACTIONS.has(body.action))throw httpError(400,'Unknown Genie action');
 const worldId=safeWorldId(body.worldId);
 const current=await readWorld(admin,worldId,userId);
 const {state}=current;
 if(body.action==='history'){
  const limit=body.limit===undefined?50:body.limit;
  if(!Number.isInteger(limit)||limit<1||limit>100)throw httpError(400,'Invalid history limit');
  return {worldId,revision:state.revision,tick:state.tick,resources:state.resources,history:state.history.slice(-limit),projects:state.projects,crisis:state.crisis};
 }
 if(body.action==='intent'||body.action==='preview'){
  const intent=validateIntent(body);
  return {worldId,revision:state.revision,intent,...(body.action==='preview'?{plan:engine.preview(state,intent)}:{})};
 }
 const revision=expectedRevision(body.expectedRevision);
 if(revision!==state.revision)throw httpError(409,'Stale world revision');
 let next;
 if(body.action==='commit'){
  const intent=validateIntent(body);
  try{next=engine.commit(state,intent,revision)}catch(error){
   if(error.message==='INSUFFICIENT_RESOURCES')throw httpError(422,error.message);
   if(error.message==='STALE_REVISION')throw httpError(409,error.message);
   throw error;
  }
 }else next=engine.tick(state);
 await persist(admin,current,next);
 return {worldId,revision:next.revision,tick:next.tick,resources:next.resources,projects:next.projects,crisis:next.crisis,events:next.history.slice(state.history.length)};
}
module.exports={ACTIONS,dispatch,readWorld,persist,validateIntent,expectedRevision};
