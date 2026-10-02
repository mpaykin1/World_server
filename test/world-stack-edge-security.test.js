'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'world-stack', 'index.ts'), 'utf8');

test('Supabase world-stack requires an authenticated user for all mutations', () => {
  assert.match(source, /async function requireUser\(/);
  assert.match(source, /async function worldFactory[\s\S]*?if \(req\.method !== "POST"\)[\s\S]*?await requireUser\(admin, req\);/);
  assert.match(source, /async function canonRecord[\s\S]*?await requireUser\(admin, req\);/);
});

test('canon authorship is participant-bound, pseudonymous and same-world causal on Edge', () => {
  assert.match(source, /from\("voxel_player_states"\)[\s\S]*?eq\("world_id", worldId\)[\s\S]*?eq\("user_id", actor\.id\)/);
  assert.match(source, /actor-\$\{\(await sha256Hex\(`world-canon-actor-v1/);
  assert.match(source, /parent\.world_id !== worldId[\s\S]*?PARENT_EVENT_NOT_IN_WORLD/);
  assert.match(source, /parent_event_key: parentEventKey/);
  assert.match(source, /source_platform: sourcePlatform/);
  assert.match(source, /visibility_scope: "public"/);
  assert.doesNotMatch(source, /actor_ref:\s*actor\.id/);
});

test('read paths remain public while write lane keeps JWT defense in depth', () => {
  assert.match(source, /if \(req\.method === "GET"\)/);
  const worker = fs.readFileSync(path.join(__dirname, '..', 'cloudflare-worker.js'), 'utf8');
  assert.match(worker, /if \(write && !request\.headers\.get\('authorization'\)\).*401/);
});
