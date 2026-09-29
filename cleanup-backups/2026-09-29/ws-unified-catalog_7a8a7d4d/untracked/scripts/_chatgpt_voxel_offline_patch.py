from pathlib import Path
root=Path(r'C:\Users\user\Desktop\.tools\ws-unified-catalog')
def patch(rel,old,new):
 p=root/rel;s=p.read_text(encoding='utf-8-sig')
 if old not in s: raise SystemExit(f'missing {rel}: {old[:80]!r}')
 p.write_text(s.replace(old,new,1),encoding='utf-8');print('patched',rel)

patch('api/voxel.js',
"const { createAdminClient } = require('../lib/env');",
"const { createAdminClient, firstEnv, getOptionalPublicConfig } = require('../lib/env');")
insert="""
function databaseConfigured() {
  return getOptionalPublicConfig().configured && Boolean(firstEnv(['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY']));
}
function offlineIdentity(body) {
  const guestId = typeof body.guestId === 'string' && body.guestId.length <= 80 ? body.guestId : 'offline-guest';
  return { userId: null, guestId, name: `Guest_${guestId.replace(/[^a-z0-9]/gi, '').slice(0, 4) || 'local'}` };
}
function offlineHandle(action, body) {
  const identity = offlineIdentity(body);
  if (action === 'init') {
    const worldId = safeWorldId(body.worldId);
    return { offline: true, persisted: false, selfId: identity.guestId, world: { id: worldId, seed: 73194217, settings: { infinite: true, storage: 'local-session' } }, player: { id: identity.guestId, name: identity.name, position: { x: 0, y: 42, z: 0 }, yaw: 0, pitch: 0, inventory: {}, selectedBlock: 1 } };
  }
  if (action === 'chunks') { safeWorldId(body.worldId); return { offline: true, persisted: false, blocks: [] }; }
  if (action === 'set_block') {
    const worldId = safeWorldId(body.worldId), x = safeBlockCoordinate(body.x, 'x'), y = safeBlockCoordinate(body.y, 'y'), z = safeBlockCoordinate(body.z, 'z'), blockType = safeBlockType(body.blockType), position = safePosition(body.playerPosition);
    if (distance(position, { x:x+.5, y:y+.5, z:z+.5 }) > 8.2) throw httpError(400, 'Блок слишком далеко от игрока.');
    return { offline:true, persisted:false, block:{ world_id:worldId, cx:chunkCoord(x), cz:chunkCoord(z), x,y,z, block_type:blockType, updated_at:new Date().toISOString() } };
  }
  if (action === 'player_save') { safeWorldId(body.worldId); safePosition(body.position); return { ok:true, offline:true, persisted:false }; }
  throw httpError(400, 'Неизвестное действие Voxel World.');
}
"""
marker="function dbFailure(error, fallback = 'Ошибка базы данных Voxel World.') {"
p=root/'api/voxel.js';s=p.read_text(encoding='utf-8-sig')
if 'function databaseConfigured()' not in s:
 s=s.replace(marker,insert+'\n'+marker,1);p.write_text(s,encoding='utf-8');print('patched api/voxel.js offline helpers')
patch('api/voxel.js',
"  const admin = createAdminClient();\n  const identity = await optionalIdentity(admin, req, body);\n  const result = await handle(admin, identity, action, body);\n  sendJson(res, 200, result);",
"  if (!databaseConfigured()) return sendJson(res, 200, offlineHandle(action, body));\n  const admin = createAdminClient();\n  const identity = await optionalIdentity(admin, req, body);\n  const result = await handle(admin, identity, action, body);\n  sendJson(res, 200, result);")
patch('apps/voxel-world/client.js',
"let worldSeed=73194217;",
"let worldSeed=73194217; let backendPersistent=true;")
patch('apps/voxel-world/client.js',
"    statusEl.textContent='онлайн · мир сохраняется';statusEl.className='vwGood';",
"    statusEl.textContent=backendPersistent?'онлайн · мир сохраняется':'локально · без облачного сохранения';statusEl.className=backendPersistent?'vwGood':'vwWarn';")
patch('apps/voxel-world/client.js',
"  const init=await api('init',{worldId:'main'}); worldSeed=Number(init.world?.seed)||worldSeed;",
"  const init=await api('init',{worldId:'main'}); backendPersistent=init.persisted!==false; worldSeed=Number(init.world?.seed)||worldSeed;")
patch('apps/voxel-world/client.js',
"started=true; statusEl.textContent='онлайн · мир сохраняется';statusEl.className='vwGood';loading.classList.add('hidden');",
"started=true; statusEl.textContent=backendPersistent?'онлайн · мир сохраняется':'локально · без облачного сохранения';statusEl.className=backendPersistent?'vwGood':'vwWarn';loading.classList.add('hidden');")
print('VOXEL OFFLINE PATCH COMPLETE')