'use strict';

const crypto = require('crypto');

const WORLD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EVENT_TYPE = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/;
const EVENT_KEY = /^[0-9a-f]{64}$/;
const ACTOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_PLATFORMS = new Set(['browser', 'telegram', 'world_server']);

function cleanWorldId(value) {
  const id = String(value || '').trim();
  if (!WORLD_ID.test(id)) throw Object.assign(new Error('Invalid canon world id.'), { status: 400 });
  return id;
}

function cleanEventType(value) {
  const type = String(value || '').trim().toLowerCase().slice(0, 64);
  if (!EVENT_TYPE.test(type)) throw Object.assign(new Error('Invalid canon event type.'), { status: 400 });
  return type;
}

function cleanSummary(value) {
  const summary = String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!summary) throw Object.assign(new Error('Canon event summary is required.'), { status: 400 });
  return summary;
}

function safePayload(value) {
  const payload = value && typeof value === 'object' && !Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : {};
  const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (bytes > 7000) throw Object.assign(new Error('Canon payload is too large.'), { status: 413 });
  return payload;
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function actorRefFor(actorId) {
  const id = String(actorId || '').trim();
  if (!ACTOR_ID.test(id)) throw Object.assign(new Error('Invalid canon actor.'), { status: 401 });
  return `actor-${hash(`world-canon-actor-v1\n${id}`).slice(0, 24)}`;
}

function cleanActorRef(value) {
  const actorRef = String(value || '').trim().toLowerCase();
  if (actorRef !== 'legacy' && !/^actor-[0-9a-f]{24}$/.test(actorRef)) {
    throw Object.assign(new Error('Invalid canon actor reference.'), { status: 400 });
  }
  return actorRef;
}

function cleanParentEventKey(value) {
  if (value === undefined || value === null || value === '') return null;
  const key = String(value).trim().toLowerCase();
  if (!EVENT_KEY.test(key)) throw Object.assign(new Error('Invalid canon parent event.'), { status: 400 });
  return key;
}

function cleanEventKey(value) {
  const key = String(value || '').trim().toLowerCase();
  if (!EVENT_KEY.test(key)) throw Object.assign(new Error('Invalid canon event key.'), { status: 400 });
  return key;
}

function cleanSourcePlatform(value) {
  const platform = String(value || 'browser').trim().toLowerCase();
  if (!SOURCE_PLATFORMS.has(platform)) throw Object.assign(new Error('Invalid canon source platform.'), { status: 400 });
  return platform;
}

function eventFocus(payload) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const focus = {};
  const region = String(source.region || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (region) focus.region = region;
  for (const axis of ['x', 'y', 'z']) {
    const value = Number(source[axis]);
    if (Number.isFinite(value) && Math.abs(value) <= 1000000) focus[axis] = Number(value.toFixed(3));
  }
  return focus;
}

function projectEventEntry(event, latestRevision) {
  const eventRevision = Number(event?.revision);
  const currentRevision = Number(latestRevision);
  if (!Number.isSafeInteger(eventRevision) || eventRevision < 1 || !Number.isSafeInteger(currentRevision) || currentRevision < eventRevision) {
    throw new Error('Invalid canon revision projection.');
  }
  return {
    event,
    focus: eventFocus(event.payload),
    eventRevision,
    currentRevision,
    state: currentRevision === eventRevision ? 'current' : 'historical',
    canContinue: true
  };
}

function effectForConsequence({ eventKey, sourceWorldId, targetWorldId } = {}) {
  const key = hash(String(eventKey || '') + '\n' + String(sourceWorldId || '') + '\n' + String(targetWorldId || ''));
  const unit = (offset) => parseInt(key.slice(offset, offset + 8), 16) / 0xffffffff;
  return {
    schemaVersion: 1,
    kind: 'canon_beacon',
    effectId: 'canon-' + key.slice(0, 16),
    hue: Math.round(unit(0) * 359),
    radius: Number((4 + unit(8) * 5).toFixed(2)),
    intensity: Number((0.7 + unit(16) * 0.55).toFixed(2)),
    lifetimeMs: 86400000
  };
}

function eventKeyFor({ worldId, eventType, idempotencyKey }) {
  const id = cleanWorldId(worldId);
  const type = cleanEventType(eventType);
  const key = String(idempotencyKey || '').trim().slice(0, 180);
  if (!key) throw Object.assign(new Error('Canon idempotency key is required.'), { status: 400 });
  return hash(`${id}\n${type}\n${key}`);
}

function authoredLoreFor(worldId, worldSettings, loreBible) {
  if (worldSettings?.lore && typeof worldSettings.lore === 'object') return worldSettings.lore;
  if (worldSettings?.worldDNA?.lore && typeof worldSettings.worldDNA.lore === 'object') return worldSettings.worldDNA.lore;
  const alias = worldId === 'main' ? 'voxel-world' : worldId;
  return loreBible?.worlds?.[alias] || null;
}

function planCanonMutation({ worldId, eventType, summary, payload, idempotencyKey, worldSettings, loreBible, actorRef = 'legacy', parentEventKey = null, sourcePlatform = 'browser' } = {}) {
  const id = cleanWorldId(worldId);
  const type = cleanEventType(eventType);
  const text = cleanSummary(summary);
  const body = safePayload(payload);
  const eventKey = eventKeyFor({ worldId: id, eventType: type, idempotencyKey });
  const parentKey = cleanParentEventKey(parentEventKey);
  const publicActorRef = cleanActorRef(actorRef);
  const platform = cleanSourcePlatform(sourcePlatform);
  const source = {
    event_key: eventKey,
    world_id: id,
    event_type: type,
    summary: text,
    payload: body,
    cause_event_key: parentKey,
    parent_event_key: parentKey,
    actor_ref: publicActorRef,
    source_platform: platform,
    visibility_scope: 'public',
    source_world_id: id,
    target_world_id: id
  };
  const lore = authoredLoreFor(id, worldSettings, loreBible);
  const seen = new Set();
  const consequences = [];
  for (const connection of Array.isArray(lore?.connections) ? lore.connections : []) {
    const targetId = String(connection?.targetId || '').trim();
    if (!WORLD_ID.test(targetId) || targetId === id || seen.has(targetId)) continue;
    seen.add(targetId);
    const story = cleanSummary(connection.story || `Событие в ${id} отозвалось в ${targetId}.`);
    consequences.push({
      event_key: hash(`${eventKey}\n${targetId}`),
      world_id: targetId,
      event_type: 'cross_world_consequence',
      summary: `Последствие из «${id}»: ${story}`.slice(0, 500),
      payload: {
        causeWorldId: id,
        causeEventType: type,
        story,
        effect: effectForConsequence({ eventKey, sourceWorldId: id, targetWorldId: targetId })
      },
      cause_event_key: eventKey,
      parent_event_key: eventKey,
      actor_ref: publicActorRef,
      source_platform: platform,
      visibility_scope: 'public',
      source_world_id: id,
      target_world_id: targetId
    });
    if (consequences.length >= 4) break;
  }
  return { source, consequences, all: [source, ...consequences] };
}

async function persistCanonMutation(admin, plan) {
  const rows = Array.isArray(plan?.all) ? plan.all : [];
  if (!rows.length) throw new Error('Canon plan is empty.');
  const fields = 'event_key,world_id,revision,event_type,summary,payload,cause_event_key,parent_event_key,actor_ref,source_platform,visibility_scope,source_world_id,target_world_id,created_at';
  const { error } = await admin.from('world_canon_events')
    .upsert(rows, { onConflict: 'event_key', ignoreDuplicates: true });
  if (error) throw error;
  const keys = rows.map(row => row.event_key);
  const { data, error: readError } = await admin.from('world_canon_events').select(fields).in('event_key', keys);
  if (readError) throw readError;
  const byKey = new Map((data || []).map(row => [row.event_key, row]));
  if (keys.some(key => !byKey.has(key))) throw new Error('Canon persistence reread is incomplete.');
  const persisted = keys.map(key => byKey.get(key));
  return { event: persisted[0], consequences: persisted.slice(1), persisted };
}

async function recentCanon(admin, { worldId, limit = 20 } = {}) {
  const id = cleanWorldId(worldId);
  const bounded = Math.max(1, Math.min(50, Number(limit) || 20));
  const { data, error } = await admin.from('world_canon_events')
    .select('event_key,world_id,revision,event_type,summary,payload,cause_event_key,parent_event_key,actor_ref,source_platform,visibility_scope,source_world_id,target_world_id,created_at')
    .eq('world_id', id).eq('visibility_scope', 'public').order('created_at', { ascending: false }).limit(bounded);
  if (error) throw error;
  return data || [];
}

async function canonEventEntry(admin, { worldId, eventKey } = {}) {
  const id = cleanWorldId(worldId);
  const key = cleanEventKey(eventKey);
  const fields = 'event_key,world_id,revision,event_type,summary,payload,cause_event_key,parent_event_key,actor_ref,source_platform,visibility_scope,source_world_id,target_world_id,created_at';
  const { data: event, error: eventError } = await admin.from('world_canon_events').select(fields)
    .eq('world_id', id).eq('event_key', key).eq('visibility_scope', 'public').maybeSingle();
  if (eventError) throw eventError;
  if (!event) throw Object.assign(new Error('CANON_EVENT_NOT_FOUND'), { status: 404 });
  const { data: latest, error: latestError } = await admin.from('world_canon_events').select('revision')
    .eq('world_id', id).eq('visibility_scope', 'public').order('revision', { ascending: false }).limit(1).maybeSingle();
  if (latestError) throw latestError;
  return projectEventEntry(event, latest?.revision || event.revision);
}

module.exports = { cleanWorldId, cleanEventType, cleanSummary, safePayload, hash, actorRefFor, cleanActorRef, cleanParentEventKey, cleanEventKey, cleanSourcePlatform, eventFocus, projectEventEntry, effectForConsequence, eventKeyFor, authoredLoreFor, planCanonMutation, persistCanonMutation, recentCanon, canonEventEntry };
