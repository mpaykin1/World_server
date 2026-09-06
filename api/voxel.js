'use strict';

const { createAdminClient } = require('../lib/env');
const { optionalIdentity } = require('../lib/auth');
const { sendJson, methodNotAllowed, readJsonBody, withErrors, httpError } = require('../lib/http');

const {
  CHUNK, WORLD_ID, finite, safeWorldId: ruleSafeWorldId, safePosition: ruleSafePosition,
  safeBlockCoordinate: ruleSafeBlockCoordinate, safeBlockType: ruleSafeBlockType, chunkCoord, distance
} = require('../lib/voxel-rules');
const scienceGameplay = require('../lib/science-gameplay-adapter');

function dbFailure(error, fallback = 'Ошибка базы данных Voxel World.') {
  if (!error) return;
  const status = error.code === '23505' ? 409 : 500;
  throw httpError(status, status >= 500 ? fallback : error.message);
}
function adaptRule(fn) {
  return (...args) => {
    try { return fn(...args); }
    catch (error) { throw httpError(error.status || 400, error.message || 'Некорректные данные Voxel World.'); }
  };
}
const safeWorldId = adaptRule(ruleSafeWorldId);
const safePosition = adaptRule(ruleSafePosition);
const safeBlockCoordinate = adaptRule(ruleSafeBlockCoordinate);
const safeBlockType = adaptRule(ruleSafeBlockType);

async function ensurePlayer(admin, identity, worldId) {
  let query = admin.from('voxel_player_states').select('*');
  query = identity.userId ? query.eq('user_id', identity.userId) : query.eq('guest_id', identity.guestId);
  const { data: existing, error: selectError } = await query.maybeSingle();
  dbFailure(selectError);
  if (existing) {
    const patch = {};
    if (existing.display_name !== identity.name) patch.display_name = identity.name;
    if (existing.world_id !== worldId) patch.world_id = worldId;
    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString();
      const { error } = await admin.from('voxel_player_states').update(patch).eq('id', existing.id);
      dbFailure(error);
      Object.assign(existing, patch);
    }
    return existing;
  }
  const payload = {
    user_id: identity.userId,
    guest_id: identity.guestId,
    display_name: identity.name,
    world_id: worldId,
    position: { x: 0, y: 42, z: 0 }
  };
  const { data, error } = await admin.from('voxel_player_states').insert(payload).select('*').single();
  if (!error) return data;
  if (error.code !== '23505') dbFailure(error);
  let retry = admin.from('voxel_player_states').select('*');
  retry = identity.userId ? retry.eq('user_id', identity.userId) : retry.eq('guest_id', identity.guestId);
  const { data: raced, error: retryError } = await retry.single();
  dbFailure(retryError);
  return raced;
}

function clientPlayer(row, identity) {
  return {
    id: identity.userId || identity.guestId,
    name: identity.name,
    position: row.position,
    yaw: Number(row.yaw) || 0,
    pitch: Number(row.pitch) || 0,
    inventory: row.inventory || {},
    selectedBlock: Number(row.selected_block) || 1
  };
}

async function actionInit(admin, identity, body) {
  const worldId = safeWorldId(body.worldId);
  const [{ data: world, error: worldError }, player] = await Promise.all([
    admin.from('voxel_worlds').select('id, seed, settings').eq('id', worldId).single(),
    ensurePlayer(admin, identity, worldId)
  ]);
  dbFailure(worldError, 'Мир Voxel World не найден.');
  return { selfId: identity.userId || identity.guestId, world, player: clientPlayer(player, identity), scienceGameplay: scienceGameplay.listPublicRuns() };
}

async function actionChunks(admin, body) {
  const worldId = safeWorldId(body.worldId);
  const input = Array.isArray(body.chunks) ? body.chunks.slice(0, 32) : [];
  const unique = new Map();
  for (const c of input) {
    const cx = Math.trunc(finite(c?.x, NaN)), cz = Math.trunc(finite(c?.z, NaN));
    if (!Number.isFinite(cx) || !Number.isFinite(cz) || Math.abs(cx) > 62500 || Math.abs(cz) > 62500) continue;
    unique.set(`${cx},${cz}`, { cx, cz });
  }
  if (!unique.size) return { blocks: [] };
  const chunks = [...unique.values()];
  const cxs = [...new Set(chunks.map(c => c.cx))], czs = [...new Set(chunks.map(c => c.cz))];
  const requested = new Set(chunks.map(c => `${c.cx},${c.cz}`));
  const { data, error } = await admin
    .from('voxel_block_overrides')
    .select('cx,cz,x,y,z,block_type,updated_at')
    .eq('world_id', worldId)
    .in('cx', cxs)
    .in('cz', czs)
    .limit(10000);
  dbFailure(error);
  return { blocks: (data || []).filter(row => requested.has(`${row.cx},${row.cz}`)) };
}

async function actionSetBlock(admin, identity, body) {
  const worldId = safeWorldId(body.worldId);
  const player = await ensurePlayer(admin, identity, worldId);
  const x = safeBlockCoordinate(body.x, 'x');
  const y = safeBlockCoordinate(body.y, 'y');
  const z = safeBlockCoordinate(body.z, 'z');
  const blockType = safeBlockType(body.blockType);
  const position = safePosition(body.playerPosition);
  if (distance(position, { x: x + 0.5, y: y + 0.5, z: z + 0.5 }) > 8.2) throw httpError(400, 'Блок слишком далеко от игрока.');
  if (player.last_block_at && Date.now() - new Date(player.last_block_at).getTime() < 45) throw httpError(429, 'Слишком частое изменение блоков.');

  const scienceContexts = [];
  if (blockType === 0) {
    const contracts = scienceGameplay.getActiveContractsForEvent('player_break');
    if (contracts.length) {
      const { data: previous, error: previousError } = await admin.from('voxel_block_overrides')
        .select('block_type').eq('world_id', worldId).eq('x', x).eq('y', y).eq('z', z).maybeSingle();
      dbFailure(previousError);
      const previousBlockType = Number(previous?.block_type);
      const relevant = contracts.filter(contract => (contract.mechanic.eligibleBlockTypes || []).includes(previousBlockType));
      if (relevant.length) {
        const radius = Math.max(...relevant.map(contract => Math.max(1, Math.min(12, Number(contract.mechanic.radius) || 8))));
        const verticalRadius = Math.max(...relevant.map(contract => Math.max(0, Math.min(2, Number(contract.mechanic.verticalRadius) || 1))));
        const { data: nearby, error: nearbyError } = await admin.from('voxel_block_overrides')
          .select('x,y,z,block_type').eq('world_id', worldId)
          .gte('x', x - radius).lte('x', x + radius)
          .gte('y', y - verticalRadius).lte('y', y + verticalRadius)
          .gte('z', z - radius).lte('z', z + radius).limit(512);
        dbFailure(nearbyError);
        for (const contract of relevant) scienceContexts.push({ contract, nearby: nearby || [], previousBlockType });
      }
    }
  }

  const now = new Date().toISOString();
  const { error: playerError } = await admin.from('voxel_player_states').update({
    position, last_block_at: now, updated_at: now
  }).eq('id', player.id);
  dbFailure(playerError);
  const row = {
    world_id: worldId, cx: chunkCoord(x), cz: chunkCoord(z), x, y, z,
    block_type: blockType,
    updated_by_user: identity.userId,
    updated_by_guest: identity.guestId,
    updated_at: now
  };
  const { data, error } = await admin.from('voxel_block_overrides')
    .upsert(row, { onConflict: 'world_id,x,y,z' })
    .select('cx,cz,x,y,z,block_type,updated_at').single();
  dbFailure(error);

  const scienceEvents = [];
  const claimedScienceCells = new Set();
  for (const scienceContext of scienceContexts) {
    const proposal = scienceGameplay.handleEvent(scienceContext.contract.runId, {
      event: 'player_break', previousBlockType: scienceContext.previousBlockType,
      removed: { x, y, z }, playerPosition: position,
      nodes: scienceContext.nearby.filter(n => Number(n.block_type) !== 0 && !(n.x === x && n.y === y && n.z === z)),
      emptyCells: scienceContext.nearby.filter(n => Number(n.block_type) === 0 && !(n.x === x && n.y === y && n.z === z))
    });
    const effects = (proposal?.effects || []).filter(effect => {
      const cell = `${effect.x},${effect.y},${effect.z}`;
      if (claimedScienceCells.has(cell)) return false;
      claimedScienceCells.add(cell); return true;
    });
    if (!effects.length) continue;
    const growthRows = effects.map(effect => ({
      world_id: worldId, cx: chunkCoord(effect.x), cz: chunkCoord(effect.z),
      x: effect.x, y: effect.y, z: effect.z, block_type: effect.blockType,
      updated_by_user: identity.userId, updated_by_guest: identity.guestId, updated_at: now
    }));
    const { data: grown, error: growthError } = await admin.from('voxel_block_overrides')
      .upsert(growthRows, { onConflict: 'world_id,x,y,z' })
      .select('cx,cz,x,y,z,block_type,updated_at');
    if (growthError) {
      console.warn(`[science-gameplay] ${scienceContext.contract.runId} growth skipped`, growthError.code || 'database_error');
      continue;
    }
    const persisted = (grown?.length ? grown : effects).map(block => ({
      type: 'set_block', x: block.x, y: block.y, z: block.z,
      blockType: Number(block.block_type ?? block.blockType), reason: 'cycle_closure'
    }));
    scienceEvents.push({ ...proposal, effects: persisted });
  }
  return { block: data, science: scienceEvents[0] || null, scienceEvents };
}


async function actionSavePlayer(admin, identity, body) {
  const worldId = safeWorldId(body.worldId);
  const player = await ensurePlayer(admin, identity, worldId);
  const position = safePosition(body.position);
  const yaw = Math.max(-100000, Math.min(100000, finite(body.yaw)));
  const pitch = Math.max(-1.55, Math.min(1.55, finite(body.pitch)));
  const selectedBlock = Math.max(0, Math.min(255, Math.trunc(finite(body.selectedBlock, 1))));
  const now = new Date().toISOString();
  const { error } = await admin.from('voxel_player_states').update({ position, yaw, pitch, selected_block: selectedBlock, last_save_at: now, updated_at: now }).eq('id', player.id);
  dbFailure(error);
  return { ok: true };
}

async function handle(admin, identity, action, body) {
  if (action === 'init') return actionInit(admin, identity, body);
  if (action === 'chunks') return actionChunks(admin, body);
  if (action === 'set_block') return actionSetBlock(admin, identity, body);
  if (action === 'player_save') return actionSavePlayer(admin, identity, body);
  throw httpError(400, 'Неизвестное действие Voxel World.');
}

module.exports = withErrors(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const body = await readJsonBody(req);
  const action = String(body.action || '');
  if (!action) throw httpError(400, 'Не указано действие Voxel World.');
  const admin = createAdminClient();
  const identity = await optionalIdentity(admin, req, body);
  const result = await handle(admin, identity, action, body);
  sendJson(res, 200, result);
});

module.exports._private = { safeWorldId, safePosition, safeBlockCoordinate, safeBlockType, chunkCoord, clientPlayer };
