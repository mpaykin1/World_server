'use strict';

const { createAdminClient, hasPublicConfig, hasSecretConfig } = require('../lib/env');
const { optionalIdentity } = require('../lib/auth');
const { sendJson, methodNotAllowed, readJsonBody, withErrors, httpError } = require('../lib/http');
const {
  defaultInventory, generateChunk, snapBuilding, validateBuild, rowToBuilding,
  rowToSharabassObject, rowToChatMessage, finite
} = require('../lib/game-rules');

function handleOfflineAction(action, body) {
  const guestId = String(body.guestId || 'guest');
  const identity = { guestId, name: 'Guest', userId: null };
  if (action === 'chat_history') return { messages: [] };
  if (action === 'chat_send') {
    return {
      message: {
        id: 'msg_' + Date.now(),
        ts: Date.now(),
        app: String(body.app || 'global'),
        name: identity.name,
        account: false,
        text: String(body.text || '').slice(0, 220)
      }
    };
  }
  if (action === 'sharabass_init') {
    return { objects: [], weather: { rain: 0, lightning: 0, clouds: 0, wind: 0, snow: 0, smoke: 0 }, time: Date.now() };
  }
  if (action === 'sharabass_place') {
    const pos = body.position || { x: 0, y: -1.25, z: 0 };
    return {
      object: {
        id: 'obj_' + Date.now(),
        type: Math.trunc(finite(body.type)),
        position: { x: finite(pos.x), y: finite(pos.y, -1.25), z: finite(pos.z) },
        size: Math.max(0.2, Math.min(20, finite(body.size, 1))),
        owner: identity.guestId,
        ownerName: identity.name
      }
    };
  }
  if (action === 'sharabass_remove') return { id: String(body.id || '') };
  if (action === 'sharabass_weather') return { weather: body.weather || {} };
  if (action === 'survival_join') {
    return {
      selfId: identity.guestId,
      player: clientPlayer({ id: identity.guestId, display_name: identity.name, inventory: defaultInventory(), position: { x: 0, y: 0, z: 0 } }, identity),
      buildings: []
    };
  }
  if (action === 'chunks') {
    const chunks = Array.isArray(body.chunks) ? body.chunks.slice(0, 32) : [];
    return { chunks: chunks.map(c => generateChunk(c.x, c.z)) };
  }
  if (action === 'survival_position') {
    return { position: body.position || { x: 0, y: 0, z: 0 } };
  }
  throw httpError(503, 'Supabase не настроен в окружении сервера.');
}

function dbFailure(error, fallback = 'Ошибка базы данных.') {
  if (!error) return;
  const status = error.code === '23505' ? 409 : (/cooldown|не хватает|уже|переполнен|далеко|место|подожди/i.test(error.message || '') ? 400 : 500);
  throw httpError(status, status >= 500 ? fallback : error.message);
}

async function ensurePlayer(admin, identity) {
  let query = admin.from('game_player_states').select('*');
  query = identity.userId ? query.eq('user_id', identity.userId) : query.eq('guest_id', identity.guestId);
  const { data: current, error: selectError } = await query.maybeSingle();
  dbFailure(selectError);
  if (current) {
    if (current.display_name !== identity.name) {
      await admin.from('game_player_states').update({ display_name: identity.name }).eq('id', current.id);
      current.display_name = identity.name;
    }
    return current;
  }
  const payload = {
    user_id: identity.userId,
    guest_id: identity.guestId,
    display_name: identity.name,
    inventory: defaultInventory(),
    position: { x: Math.random() * 12 - 6, y: 0, z: Math.random() * 12 - 6 }
  };
  const { data, error } = await admin.from('game_player_states').insert(payload).select('*').single();
  if (!error) return data;
  if (error.code !== '23505') dbFailure(error);
  let retry = admin.from('game_player_states').select('*');
  retry = identity.userId ? retry.eq('user_id', identity.userId) : retry.eq('guest_id', identity.guestId);
  const { data: raced, error: retryError } = await retry.single();
  dbFailure(retryError);
  return raced;
}

function clientPlayer(player, identity) {
  return {
    id: identity.userId || identity.guestId,
    accountId: identity.userId,
    name: identity.name,
    position: player.position,
    rotationY: Number(player.rotation_y) || 0,
    running: false,
    action: 'idle',
    health: player.health,
    hunger: player.hunger,
    thirst: player.thirst,
    inventory: player.inventory,
    selectedHotbarSlot: player.selected_hotbar_slot || 0
  };
}

async function loadBuildings(admin) {
  const { data, error } = await admin.from('survival_buildings').select('*').order('created_at', { ascending: true }).limit(2000);
  dbFailure(error);
  return (data || []).map(rowToBuilding);
}

function parseResourceId(id) {
  const match = String(id || '').match(/^r:(-?\d+):(-?\d+):(\d+)$/);
  if (!match) throw httpError(400, 'Некорректный ресурс.');
  const cx = Number(match[1]), cz = Number(match[2]), index = Number(match[3]);
  if (Math.abs(cx) > 10000 || Math.abs(cz) > 10000 || index < 0 || index >= 13) throw httpError(400, 'Некорректный ресурс.');
  const resource = generateChunk(cx, cz).resources[index];
  if (resource.id !== id) throw httpError(400, 'Некорректный ресурс.');
  return resource;
}

function playerPosition(body) {
  const source = body.playerPosition || body.position || {};
  if (!Number.isFinite(Number(source.x)) || !Number.isFinite(Number(source.z))) throw httpError(400, 'Не указана позиция игрока.');
  const position = { x: finite(source.x), y: finite(source.y), z: finite(source.z) };
  if (Math.abs(position.x) > 10000 || Math.abs(position.z) > 10000) throw httpError(400, 'Координаты вне игрового мира.');
  return position;
}

function checkResourceDistance(resource, position) {
  const target = resource.position || resource;
  const dx = finite(target.x) - position.x;
  const dz = finite(target.z) - position.z;
  if (Math.hypot(dx, dz) > 9) throw httpError(400, 'Ресурс слишком далеко.');
}

async function updatePlayerPosition(admin, player, body) {
  return rpc(admin, 'game_survival_update_position', {
    p_player_id: player.id,
    p_position: playerPosition(body),
    p_rotation_y: finite(body.rotationY, null)
  });
}

async function rpc(admin, name, args) {
  const { data, error } = await admin.rpc(name, args);
  dbFailure(error);
  return data;
}

async function handleAction(admin, identity, action, body) {
  if (action === 'chat_history') {
    const { data, error } = await admin.from('chat_messages').select('*').order('created_at', { ascending: false }).limit(60);
    dbFailure(error);
    return { messages: (data || []).reverse().map(rowToChatMessage) };
  }
  if (action === 'chat_send') {
    const message = String(body.text || '').trim().slice(0, 220);
    if (!message) throw httpError(400, 'Пустое сообщение.');
    const app = String(body.app || 'global').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'global';
    const { data, error } = await admin.from('chat_messages').insert({
      user_id: identity.userId, guest_id: identity.guestId, author_name: identity.name, app, message
    }).select('*').single();
    dbFailure(error);
    return { message: rowToChatMessage(data) };
  }
  if (action === 'sharabass_init') {
    const [{ data: objects, error: objectsError }, { data: state, error: stateError }] = await Promise.all([
      admin.from('sharabass_objects').select('*').order('created_at', { ascending: true }).limit(50),
      admin.from('game_world_state').select('value').eq('key', 'sharabass_weather').maybeSingle()
    ]);
    dbFailure(objectsError); dbFailure(stateError);
    return {
      selfId: identity.userId || identity.guestId,
      objects: (objects || []).map(rowToSharabassObject),
      weather: state?.value || { rain: 0, lightning: 0, clouds: 0.2, wind: 0.1, snow: 0, smoke: 0.4 }
    };
  }
  if (action === 'sharabass_place') {
    const position = body.position || {};
    const result = await rpc(admin, 'game_sharabass_place', {
      p_user_id: identity.userId,
      p_guest_id: identity.guestId,
      p_owner_name: identity.name,
      p_object_type: Math.trunc(finite(body.type)),
      p_position: { x: finite(position.x), y: finite(position.y, -1.25), z: finite(position.z) },
      p_size: Math.max(0.2, Math.min(20, finite(body.size, 1)))
    });
    return { object: rowToSharabassObject(result) };
  }
  if (action === 'sharabass_remove') {
    await rpc(admin, 'game_sharabass_remove', {
      p_object_id: String(body.id || ''), p_user_id: identity.userId, p_guest_id: identity.guestId
    });
    return { id: String(body.id || '') };
  }
  if (action === 'sharabass_weather') {
    const source = body.weather || body;
    const weather = {};
    for (const key of ['rain', 'lightning', 'clouds', 'wind', 'snow', 'smoke']) weather[key] = Math.max(0, Math.min(1, finite(source[key])));
    const { error } = await admin.from('game_world_state').upsert({ key: 'sharabass_weather', value: weather }, { onConflict: 'key' });
    dbFailure(error);
    return { weather };
  }

  const player = await ensurePlayer(admin, identity);
  if (action === 'survival_join') {
    return { selfId: identity.userId || identity.guestId, player: clientPlayer(player, identity), buildings: await loadBuildings(admin) };
  }
  if (action === 'chunks') {
    const chunks = Array.isArray(body.chunks) ? body.chunks.slice(0, 32) : [];
    const generated = chunks.map(c => generateChunk(c.x, c.z));
    const ids = generated.flatMap(chunk => chunk.resources.map(resource => resource.id));
    const remaining = new Map();
    if (ids.length) {
      const { data, error } = await admin.from('survival_resource_states').select('resource_id, remaining').in('resource_id', ids);
      dbFailure(error);
      for (const row of data || []) remaining.set(row.resource_id, Number(row.remaining));
    }
    return { chunks: chunks.map(c => generateChunk(c.x, c.z, remaining)) };
  }
  if (action === 'survival_position') {
    return { position: await updatePlayerPosition(admin, player, body) };
  }
  if (action === 'resource_hit') {
    const resource = parseResourceId(String(body.id || ''));
    const position = await updatePlayerPosition(admin, player, body);
    checkResourceDistance(resource, position);
    const result = await rpc(admin, 'game_survival_hit_resource', {
      p_player_id: player.id,
      p_resource_id: resource.id,
      p_resource_type: resource.type,
      p_initial_remaining: resource.amount,
      p_tool: String(body.tool || '')
    });
    return result;
  }
  if (action === 'craft_item') {
    const inventory = await rpc(admin, 'game_survival_craft', { p_player_id: player.id, p_item: String(body.item || '') });
    return { inventory };
  }
  if (action === 'inventory_move') {
    const inventory = await rpc(admin, 'game_survival_move_inventory', {
      p_player_id: player.id, p_from: Math.trunc(finite(body.from, -1)), p_to: Math.trunc(finite(body.to, -1))
    });
    return { inventory };
  }
  if (action === 'build_place') {
    const buildings = await loadBuildings(admin);
    const raw = body.position || {};
    const piece = String(body.piece || 'foundation');
    const snapped = snapBuilding(piece, { x: finite(raw.x), z: finite(raw.z) }, finite(body.rotationY), buildings);
    const position = await updatePlayerPosition(admin, player, { position: body.playerPosition, rotationY: body.playerRotationY });
    validateBuild(piece, snapped, position);
    const result = await rpc(admin, 'game_survival_commit_building', {
      p_player_id: player.id,
      p_piece: piece,
      p_position: { x: snapped.x, y: 0, z: snapped.z },
      p_rotation_y: snapped.rotY,
      p_support_id: snapped.supportId,
      p_slot: snapped.slot
    });
    return { inventory: result.inventory, building: rowToBuilding(result.building) };
  }
  throw httpError(400, 'Неизвестное игровое действие.');
}

module.exports = withErrors(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const body = await readJsonBody(req);
  const action = String(body.action || '');
  if (!action) throw httpError(400, 'Не указано игровое действие.');
  if (!hasPublicConfig() || !hasSecretConfig()) {
    return sendJson(res, 200, handleOfflineAction(action, body));
  }
  const admin = createAdminClient();
  const identity = await optionalIdentity(admin, req, body);
  const result = await handleAction(admin, identity, action, body);
  sendJson(res, 200, result);
});

module.exports._private = { ensurePlayer, parseResourceId, playerPosition, checkResourceDistance, updatePlayerPosition, clientPlayer };
