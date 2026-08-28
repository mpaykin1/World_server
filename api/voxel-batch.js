'use strict';
const { createAdminClient } = require('../lib/env');
const { optionalIdentity } = require('../lib/auth');
const { sendJson, methodNotAllowed, readJsonBody, withErrors, httpError } = require('../lib/http');
const { safeWorldId:ruleSafeWorldId,safePosition:ruleSafePosition,safeBlockCoordinate:ruleSafeBlockCoordinate,safeBlockType:ruleSafeBlockType,chunkCoord,distance } = require('../lib/voxel-rules');
function adapt(fn){return(...a)=>{try{return fn(...a)}catch(e){throw httpError(e.status||400,e.message||'Некорректные данные Voxel World.')}}}
const safeWorldId=adapt(ruleSafeWorldId),safePosition=adapt(ruleSafePosition),safeBlockCoordinate=adapt(ruleSafeBlockCoordinate),safeBlockType=adapt(ruleSafeBlockType);
function dbFailure(error,msg='Ошибка базы данных Voxel World.'){if(error)throw httpError(error.code==='23505'?409:500,error.code==='23505'?error.message:msg)}
function normalizeBlocks(input,playerPosition){
  if(!Array.isArray(input)||!input.length)throw httpError(400,'Нет блоков для создания.');
  if(input.length>512)throw httpError(413,'Один пакет может содержать не больше 512 блоков.');
  const out=new Map();
  for(const q of input){const x=safeBlockCoordinate(q?.x,'x'),y=safeBlockCoordinate(q?.y,'y'),z=safeBlockCoordinate(q?.z,'z'),blockType=safeBlockType(q?.blockType);if(distance(playerPosition,{x:x+.5,y:y+.5,z:z+.5})>52)throw httpError(400,'Создаваемый объект слишком далеко от игрока.');out.set(`${x},${y},${z}`,{x,y,z,blockType})}
  return [...out.values()];
}
module.exports=withErrors(async(req,res)=>{
  if(req.method!=='POST')return methodNotAllowed(res,['POST']);
  const body=await readJsonBody(req),action=String(body.action||'apply');if(action!=='apply')throw httpError(400,'Неизвестное batch-действие.');
  const worldId=safeWorldId(body.worldId),playerPosition=safePosition(body.playerPosition),admin=createAdminClient(),identity=await optionalIdentity(admin,req,body),blocks=normalizeBlocks(body.blocks,playerPosition),now=new Date().toISOString();
  const rows=blocks.map(q=>({world_id:worldId,cx:chunkCoord(q.x),cz:chunkCoord(q.z),x:q.x,y:q.y,z:q.z,block_type:q.blockType,updated_by_user:identity.userId,updated_by_guest:identity.guestId,updated_at:now}));
  const {data,error}=await admin.from('voxel_block_overrides').upsert(rows,{onConflict:'world_id,x,y,z'}).select('cx,cz,x,y,z,block_type,updated_at');dbFailure(error);
  sendJson(res,200,{ok:true,count:data?.length||rows.length,blocks:data||rows});
});
module.exports._private={normalizeBlocks};
