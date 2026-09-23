// Dedicated durable Voxel actions, sharing the already-deployed Supabase Edge runtime.
// The caller validates the guest UUID or authenticated JWT before dispatch.
type Identity = {kind:string;id:string};
type Runtime = {
  readWorld:(admin:any,id:string)=>Promise<any>;
  safeWorldId:(id:unknown)=>string;
  json:(body:unknown,status?:number)=>Response;
};
function bad(status:number, message:string):never {
  throw Object.assign(new Error(message), {status});
}
function db(error:any) {
  if(error) bad(error.code==='23505'?409:500,'Voxel database operation failed');
}
function pos(value:any) {
  const p={x:Number(value?.x),y:Number(value?.y),z:Number(value?.z)};
  if(!Object.values(p).every(Number.isFinite)||Math.abs(p.x)>1000000||
     Math.abs(p.z)>1000000||p.y< -64||p.y>400) bad(400,'Invalid player position');
  return p;
}
function coord(value:unknown,axis:'x'|'y'|'z') {
  const n=Number(value);
  if(!Number.isInteger(n)||(axis==='y'?(n< -64||n>320):Math.abs(n)>1000000))
    bad(400,'Invalid block coordinate '+axis);
  return n;
}
function block(value:unknown) {
  const n=Number(value);
  if(!Number.isInteger(n)||n<0||n>13)bad(400,'Invalid block type');
  return n;
}
async function player(admin:any, who:Identity, worldId:string) {
  const col=who.kind==='user'?'user_id':'guest_id';
  let query=admin.from('voxel_player_states').select('*').eq(col,who.id);
  const {data:existing,error:lookupError}=await query.maybeSingle();
  db(lookupError);
  if(existing) {
    if(existing.world_id===worldId)return existing;
    const patch={world_id:worldId,position:{x:0,y:42,z:0},updated_at:new Date().toISOString()};
    const {data,error}=await admin.from('voxel_player_states')
      .update(patch).eq('id',existing.id).select('*').single();
    db(error);return data;
  }
  const payload={
    user_id:who.kind==='user'?who.id:null,
    guest_id:who.kind==='guest'?who.id:null,
    display_name:'Guest',world_id:worldId,position:{x:0,y:42,z:0}
  };
  const {data,error}=await admin.from('voxel_player_states')
    .insert(payload).select('*').single();
  if(!error)return data;
  if(error.code!=='23505')db(error);
  const raced=await admin.from('voxel_player_states').select('*').eq(col,who.id).single();
  db(raced.error);return raced.data;
}
function viewPlayer(row:any,who:Identity) {
  return{id:who.id,name:row.display_name||'Guest',position:row.position,
    yaw:Number(row.yaw)||0,pitch:Number(row.pitch)||0,
    inventory:row.inventory||{},selectedBlock:Number(row.selected_block)||1};
}
async function init(admin:any,who:Identity,b:any,r:Runtime) {
  const worldId=r.safeWorldId(b.worldId);
  const world=await r.readWorld(admin,worldId);
  const current=await player(admin,who,worldId);
  return r.json({selfId:who.id,world:{id:world.id,seed:world.seed,settings:world.settings},
    player:viewPlayer(current,who),scienceGameplay:[],runtime:'supabase-edge-voxel'});
}
async function chunks(admin:any,b:any,r:Runtime) {
  const worldId=r.safeWorldId(b.worldId);
  const wanted=new Map<string,{cx:number;cz:number}>();
  for(const item of (Array.isArray(b.chunks)?b.chunks:[]).slice(0,32)) {
    const cx=Math.trunc(Number(item?.x)),cz=Math.trunc(Number(item?.z));
    if(!Number.isFinite(cx)||!Number.isFinite(cz)||Math.abs(cx)>62500||Math.abs(cz)>62500)continue;
    wanted.set(cx+','+cz,{cx,cz});
  }
  if(!wanted.size)return r.json({blocks:[]});
  const groups=[...wanted.values()];
  const {data,error}=await admin.from('voxel_block_overrides')
    .select('cx,cz,x,y,z,block_type,updated_at').eq('world_id',worldId)
    .in('cx',[...new Set(groups.map(c=>c.cx))])
    .in('cz',[...new Set(groups.map(c=>c.cz))]).limit(10000);
  db(error);
  return r.json({blocks:(data||[]).filter((item:any)=>wanted.has(item.cx+','+item.cz))});
}
async function save(admin:any,who:Identity,b:any,r:Runtime) {
  const worldId=r.safeWorldId(b.worldId),position=pos(b.position);
  const current=await player(admin,who,worldId),now=new Date().toISOString();
  const yaw=Number(b.yaw),pitch=Number(b.pitch),selected=Number(b.selectedBlock);
  if(![yaw,pitch,selected].every(Number.isFinite))bad(400,'Invalid player rotation');
  const {error}=await admin.from('voxel_player_states').update({
    position,yaw:Math.max(-100000,Math.min(100000,yaw)),
    pitch:Math.max(-1.55,Math.min(1.55,pitch)),
    selected_block:Math.max(0,Math.min(13,Math.trunc(selected))),
    last_save_at:now,updated_at:now
  }).eq('id',current.id);
  db(error);return r.json({ok:true,runtime:'supabase-edge-voxel'});
}
async function setBlock(admin:any,who:Identity,b:any,r:Runtime) {
  const worldId=r.safeWorldId(b.worldId);
  const x=coord(b.x,'x'),y=coord(b.y,'y'),z=coord(b.z,'z');
  const blockType=block(b.blockType),position=pos(b.playerPosition);
  if(Math.hypot(position.x-x-.5,position.y-y-.5,position.z-z-.5)>8.2)
    bad(400,'Block is too far from player');
  const current=await player(admin,who,worldId);
  if(current.last_block_at&&Date.now()-Date.parse(current.last_block_at)<45)
    bad(429,'Block updates are rate limited');
  const now=new Date().toISOString();
  const {error:pError}=await admin.from('voxel_player_states')
    .update({position,last_block_at:now,updated_at:now}).eq('id',current.id);
  db(pError);
  const row={world_id:worldId,cx:Math.floor(x/16),cz:Math.floor(z/16),
    x,y,z,block_type:blockType,
    updated_by_user:who.kind==='user'?who.id:null,
    updated_by_guest:who.kind==='guest'?who.id:null,updated_at:now};
  const {data,error}=await admin.from('voxel_block_overrides')
    .upsert(row,{onConflict:'world_id,x,y,z'})
    .select('cx,cz,x,y,z,block_type,updated_at').single();
  db(error);
  return r.json({block:data,science:null,scienceEvents:[],runtime:'supabase-edge-voxel'});
}
export async function handleVoxelAction(admin:any,who:Identity,b:any,r:Runtime) {
  const action=String(b.action||'');
  if(action==='init')return init(admin,who,b,r);
  if(action==='chunks')return chunks(admin,b,r);
  if(action==='player_save')return save(admin,who,b,r);
  if(action==='set_block')return setBlock(admin,who,b,r);
  bad(400,'Unknown Voxel action');
}
