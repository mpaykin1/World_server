import "../_shared/world-consequence-engine.js";

type Runtime = { json:(body:unknown,status?:number)=>Response };
const engine=(globalThis as any).WorldConsequenceEngine;
const ACTIONS=new Set(["interpret-intent","preview-plan","commit-plan","tick","history"]);
const WORLD=/^[a-zA-Z0-9_-]{1,80}$/;
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
function db(error:any) {
  if(error)fail(500,"Chain Reaction persistence failed");
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
  const grants=actor.app_metadata?.chain_reaction_worlds;
  const trusted=Array.isArray(grants)&&grants.includes(body.worldId);
  if(!trusted&&!['owner','player'].includes(membership.data?.role))fail(403,"World access denied");
  const settings=row.settings&&typeof row.settings==="object"?structuredClone(row.settings):{};
  const stored=settings.chainReaction;
  if(stored&&(stored.schema!==1||!Number.isSafeInteger(stored.revision)))fail(409,"Unsupported scenario version");
  const world=stored||engine.createWorld(String(row.seed));
  const base={worldId:row.id,scenarioVersion:1,revision:world.revision,runtime:"supabase-edge-chain-reaction"};
  if(body.action==="history") {
    const offset=body.offset===undefined?0:body.offset,limit=body.limit===undefined?50:body.limit;
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)fail(400,"Invalid history page");
    const history=world.history.slice(offset,offset+limit);
    return runtime.json({...base,history,nextOffset:offset+history.length,total:world.history.length});
  }
  const intent=body.action==="tick"?null:intentFrom(body);
  if(body.action==="interpret-intent")return runtime.json({...base,intent});
  if(body.action==="preview-plan")return runtime.json({...base,plan:engine.preview(world,intent),world});
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
  const saved=await admin.from("voxel_worlds")
    .update({settings:{...settings,chainReaction:next},updated_at:updatedAt})
    .eq("id",row.id).eq("updated_at",row.updated_at).select("id").maybeSingle();
  db(saved.error);if(!saved.data)fail(409,"STALE_REVISION");
  return runtime.json({...base,revision:next.revision,world:next});
}
