import "../_shared/world-consequence-engine.js";

type Runtime = { json:(body:unknown,status?:number)=>Response };
const engine=(globalThis as any).WorldConsequenceEngine;
const ACTIONS=new Set(["game-state","interpret-intent","preview-plan","commit-plan","tick","history","genie-options","resident-at-address","invite-member","revoke-member"]);
const WORLD=/^[a-zA-Z0-9_-]{1,80}$/;
const USER_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_STATE_BYTES=1024*1024;

function fail(status:number,message:string):never {
  throw Object.assign(new Error(message),{status});
}
function bearer(req:Request) {
  const match=(req.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i);
  return match?match[1].trim():"";
}
function bodySize(value:unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
function intentFrom(body:any) {
  if(typeof body.structure!=="string"||!Object.hasOwn(engine.PROJECTS,body.structure))fail(400,"Invalid structure");
  if(body.text!==undefined&&(typeof body.text!=="string"||body.text.length>600))fail(400,"Invalid text");
  return {...engine.interpretIntent(body.text||"",body.structure),schemaVersion:1};
}
function residentAddress(body:any) {
  if(typeof body.building!=="string"||!WORLD.test(body.building))fail(400,"Invalid building");
  if(!Number.isInteger(body.floor)||body.floor<1||body.floor>100)fail(400,"Invalid floor");
  if(!Number.isInteger(body.flat)||body.flat<1||body.flat>1000)fail(400,"Invalid flat");
  return {building:body.building,floor:body.floor,flat:body.flat};
}
function publicResident(resident:any) {
  if(!resident||typeof resident.id!=="string"||typeof resident.name!=="string"||
    typeof resident.building!=="string"||resident.fictional!==true||
    !Number.isInteger(resident.floor)||!Number.isInteger(resident.flat))fail(409,"Invalid resident data");
  return {id:resident.id,name:resident.name,fictional:resident.fictional===true,building:resident.building,floor:resident.floor,flat:resident.flat};
}
function publicResidents(world:any) {
  if(typeof world.seed!=="string"||!Array.isArray(world.houses))fail(409,"Invalid resident directory");
  const houses=world.houses.map((house:any)=>{
    if(!house||typeof house.id!=="string"||!WORLD.test(house.id)||
      !Number.isInteger(house.floors)||house.floors<1||house.floors>100)fail(409,"Invalid resident directory");
    return {id:house.id,floors:house.floors};
  });
  return engine.residentDirectory(world.seed,houses).map(publicResident);
}
function db(error:any) {
  if(error)fail(500,"Chain Reaction persistence failed");
}
function publicState(value:any) {
  const safe=structuredClone(value);
  for(const project of safe.projects||[])if(project.intent)delete project.intent.comment;
  for(const event of safe.history||[]){delete event.comment;delete event.actorId;}
  // Rebuild canonical values: key allowlisting alone would permit nested secrets
  // inside an allowed field such as id or name.
  if(Array.isArray(safe.residents)){
    safe.residents=publicResidents(safe);
  }
  return safe;
}
export function isChainReactionAction(value:unknown) {
  return ACTIONS.has(String(value||""));
}
export async function handleChainReaction(admin:any,req:Request,body:any,runtime:Runtime) {
  if(!body||typeof body!=="object"||Array.isArray(body))fail(400,"Invalid body");
  if(bodySize(body)>8192)fail(413,"Request too large");
  if(!isChainReactionAction(body.action))fail(400,"Unknown Chain Reaction action");
  if(typeof body.worldId!=="string"||!WORLD.test(body.worldId))fail(400,"Invalid worldId");
  const token=bearer(req);
  if(!token)fail(401,"Требуется вход в аккаунт.");
  const auth=await admin.auth.getUser(token);
  if(auth.error||!auth.data?.user)fail(401,"Сессия истекла. Войдите снова.");
  const actor=auth.data.user;
  const {data:row,error}=await admin.from("voxel_worlds")
    .select("id,seed,settings,updated_at").eq("id",body.worldId).maybeSingle();
  db(error);if(!row)fail(404,"World not found");
  const membership=await admin.from("chain_reaction_world_members")
    .select("role").eq("world_id",body.worldId).eq("user_id",actor.id).maybeSingle();
  db(membership.error);
  const role=membership.data?.role;
  if(!['owner','player'].includes(role))fail(403,"World access denied");
  if(body.action==="invite-member"||body.action==="revoke-member") {
    if(role!=="owner")fail(403,"Only the world owner can manage members");
    if(typeof body.targetUserId!=="string"||!USER_ID.test(body.targetUserId))fail(400,"Invalid targetUserId");
    if(body.targetUserId===actor.id)fail(409,"Owner membership cannot be changed");
    const current=await admin.from("chain_reaction_world_members")
      .select("role").eq("world_id",body.worldId).eq("user_id",body.targetUserId).maybeSingle();
    db(current.error);if(current.data?.role==="owner")fail(409,"Owner membership cannot be changed");
    if(body.action==="invite-member") {
      if(current.data?.role==="player")return runtime.json({worldId:body.worldId,member:{userId:body.targetUserId,role:"player"},granted:true});
      const granted=await admin.from("chain_reaction_world_members")
        .insert({world_id:body.worldId,user_id:body.targetUserId,role:"player"})
        .select("role").maybeSingle();
      if(granted.error?.code==="23503")fail(400,"Invited account does not exist");
      if(granted.error?.code==="23505") {
        const raced=await admin.from("chain_reaction_world_members")
          .select("role").eq("world_id",body.worldId).eq("user_id",body.targetUserId).maybeSingle();
        db(raced.error);if(raced.data?.role!=="player")fail(409,"Owner membership cannot be changed");
        return runtime.json({worldId:body.worldId,member:{userId:body.targetUserId,role:"player"},granted:true});
      }
      db(granted.error);
      return runtime.json({worldId:body.worldId,member:{userId:body.targetUserId,role:"player"},granted:true});
    }
    const revoked=await admin.from("chain_reaction_world_members").delete()
      .eq("world_id",body.worldId).eq("user_id",body.targetUserId).eq("role","player").select("role").maybeSingle();
    db(revoked.error);
    return runtime.json({worldId:body.worldId,member:{userId:body.targetUserId,role:"player"},revoked:true});
  }
  const settings=row.settings&&typeof row.settings==="object"?structuredClone(row.settings):{};
  const stored=settings.chainReaction;
  if(stored&&(stored.schema!==1||!Number.isSafeInteger(stored.revision)))fail(409,"Unsupported scenario version");
  const world=stored||engine.createWorld(String(row.seed));
  const base={worldId:row.id,scenarioVersion:1,revision:world.revision,runtime:"supabase-edge-chain-reaction"};
  if(body.action==="history") {
    const offset=body.offset===undefined?0:body.offset,limit=body.limit===undefined?50:body.limit;
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)fail(400,"Invalid history page");
    const history=publicState({history:world.history.slice(offset,offset+limit)}).history;
    return runtime.json({...base,history,nextOffset:offset+history.length,total:world.history.length});
  }
  if(body.action==="resident-at-address") {
    const requested=residentAddress(body);
    const resident=engine.address(world,requested.building,requested.floor,requested.flat);
    if(!resident)fail(404,"Resident address not found");
    return runtime.json({...base,resident:publicResident(resident)});
  }
  if(body.action==="game-state"){
    // Optional read fence; omit it for a deliberate latest-state refresh after a 409.
    if(body.expectedRevision!==undefined){
      if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)fail(400,"Invalid expectedRevision");
      if(world.revision!==body.expectedRevision)fail(409,"STALE_REVISION");
    }
    return runtime.json({...base,world:publicState(world),...engine.genieOptions(world)});
  }
  if(body.action==="genie-options")return runtime.json({...base,...engine.genieOptions(world)});
  const intent=body.action==="tick"?null:intentFrom(body);
  if(body.action==="interpret-intent")return runtime.json({...base,intent});
  if(body.action==="preview-plan")return runtime.json({...base,plan:engine.preview(world,intent),world:publicState(world)});
  if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)fail(400,"expectedRevision required");
  if(world.revision!==body.expectedRevision)fail(409,"STALE_REVISION");
  let next:any;
  if(body.action==="commit-plan") {
    if(world.projects.length>=256)fail(409,"Project capacity reached");
    if(!engine.preview(world,intent).feasible)fail(409,"INSUFFICIENT_RESOURCES");
    next=engine.commit(world,intent,body.expectedRevision);
  } else {
    const count=body.count===undefined?1:body.count;
    if(!Number.isInteger(count)||count<1||count>24)fail(400,"Invalid tick count");
    next=engine.simulateTicks(world,count);
  }
  next.history.push({kind:"api_action",action:body.action,actorId:actor.id,
    fromRevision:world.revision,revision:next.revision,tick:next.tick,scenarioVersion:1});
  if(bodySize(next)>MAX_STATE_BYTES)fail(409,"Scenario storage capacity reached");
  const previous=Date.parse(row.updated_at||"");
  if(!Number.isFinite(previous))fail(409,"Missing concurrency token");
  const updatedAt=new Date(Math.max(Date.now(),previous+1)).toISOString();
  const saved=await admin.rpc("commit_chain_reaction_action",{
    p_world_id:row.id,p_expected_updated_at:row.updated_at,p_next_updated_at:updatedAt,
    p_public_settings:{...settings,chainReaction:publicState(next)},p_actor_id:actor.id,
    p_action:body.action,p_revision:next.revision,p_comment:body.action==="commit-plan"?(body.text||""):null
  });
  db(saved.error);if(saved.data!==true)fail(409,"STALE_REVISION");
  return runtime.json({...base,revision:next.revision,world:publicState(next)});
}
