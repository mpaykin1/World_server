'use strict';

const crypto = require('crypto');

const WORLD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EVENT_TYPE = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/;

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

function planCanonMutation({ worldId, eventType, summary, payload, idempotencyKey, worldSettings, loreBible } = {}) {
  const id = cleanWorldId(worldId);
  const type = cleanEventType(eventType);
  const text = cleanSummary(summary);
  const body = safePayload(payload);
  const eventKey = eventKeyFor({ worldId: id, eventType: type, idempotencyKey });
  const source = {
    event_key: eventKey,
    world_id: id,
    event_type: type,
    summary: text,
    payload: body,
    cause_event_key: null,
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
      payload: { causeWorldId: id, causeEventType: type, story },
      cause_event_key: eventKey,
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
  const { data, error } = await admin.from('world_canon_events')
    .upsert(rows, { onConflict: 'event_key' })
    .select('event_key,world_id,event_type,summary,payload,cause_event_key,source_world_id,target_world_id,created_at');
  if (error) throw error;
  return { event: plan.source, consequences: plan.consequences, persisted: data || [] };
}

async function recentCanon(admin, { worldId, limit = 20 } = {}) {
  const id = cleanWorldId(worldId);
  const bounded = Math.max(1, Math.min(50, Number(limit) || 20));
  const { data, error } = await admin.from('world_canon_events')
    .select('event_key,world_id,event_type,summary,payload,cause_event_key,source_world_id,target_world_id,created_at')
    .eq('world_id', id).order('created_at', { ascending: false }).limit(bounded);
  if (error) throw error;
  return data || [];
}

module.exports = { cleanWorldId, cleanEventType, cleanSummary, safePayload, hash, eventKeyFor, authoredLoreFor, planCanonMutation, persistCanonMutation, recentCanon };
