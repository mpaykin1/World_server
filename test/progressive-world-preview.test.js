'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createFakeSupabase } = require('./helpers/fake-supabase');
const progressive = require('../lib/progressive-world');
const { _private: world } = require('../lib/api-handlers/world');

const guestA = { kind:'guest', userId:null, guestId:'11111111-1111-1111-1111-111111111111' };
const guestB = { kind:'guest', userId:null, guestId:'22222222-2222-2222-2222-222222222222' };

test('preview id is stable per identity/journey and isolated across users', () => {
  const a1 = progressive.previewWorldId(guestA, 'create');
  const a2 = progressive.previewWorldId(guestA, 'create');
  const b = progressive.previewWorldId(guestB, 'create');
  const join = progressive.previewWorldId(guestA, 'join');
  assert.equal(a1, a2);
  assert.notEqual(a1, b);
  assert.notEqual(a1, join);
  assert.match(a1, /^p-[0-9a-f]{20}$/);
});

test('partial answers already shape the progressive world spec', () => {
  const spec = progressive.buildProgressiveSpec({ answers:{ story:'Я иду по снежному лесу, вокруг мороз и лёд' }, step:3, totalSteps:31 });
  assert.match(spec.scene, /снежному лесу/);
  const row = progressive.deriveProgressiveVoxelWorld(spec, 'p-test', { step:3, totalSteps:31 });
  assert.equal(row.settings.theme, 'snow');
  assert.equal(row.settings.detailStage, 4);
  assert.ok(row.settings.detailProgress > 0 && row.settings.detailProgress < 1);
});

test('later steps reveal more world while remaining bounded', () => {
  const spec = progressive.buildProgressiveSpec({ answers:{ story:'Лес' }, step:0, totalSteps:31 });
  const early = progressive.deriveProgressiveVoxelWorld(spec, 'p-test', { step:0, totalSteps:31 });
  const late = progressive.deriveProgressiveVoxelWorld(spec, 'p-test', { step:30, totalSteps:31 });
  assert.ok(late.settings.treeDensity >= early.settings.treeDensity);
  assert.ok(late.settings.fogFar >= early.settings.fogFar);
  assert.ok(late.settings.treeDensity <= 1.6);
  assert.ok(late.settings.heightScale <= 1.5);
});

test('world.preview upserts one stable playable voxel world rather than creating a project per answer', async () => {
  const admin = createFakeSupabase();
  const first = await world.handlePreview(admin, guestA, { action:'preview', answers:{story:'Темнота'}, step:0, totalSteps:31, journey:'create' });
  const second = await world.handlePreview(admin, guestA, { action:'preview', answers:{story:'Темнота и снежный лес'}, step:5, totalSteps:31, journey:'create' });
  assert.equal(first.id, second.id);
  assert.equal(admin._tables.get('voxel_worlds').length, 1);
  assert.equal(second.detailStage, 6);
  assert.match(second.playUrl, /\/apps\/voxel-world\/\?world=p-[0-9a-f]{20}$/);
  assert.equal(admin._tables.get('voxel_worlds')[0].settings.theme, 'snow');
});

test('navigator shell is additive and never removes the 31/28 questionnaire contract', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'apps', 'improve-world-home', 'public', 'navigator-world-loop.js'), 'utf8');
  assert.match(source, /action:\s*'preview'/);
  assert.match(source, /iw_navigator_step/);
  assert.match(source, /iw_world_preview_ready/);
  assert.doesNotMatch(source, /CREATE\s*=|JOIN\s*=/);
});

test('voxel runtime has bounded progressive landmarks and detail settings', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'apps', 'voxel-world', 'client.js'), 'utf8');
  assert.match(source, /let worldDetailStage=31;/);
  assert.match(source, /function addProgressiveLandmark\(/);
  assert.match(source, /Math\.min\(8,3\+Math\.floor\(worldDetailStage\/5\)\)/);
  assert.match(source, /addProgressiveLandmark\(c,bx,bz\);/);
});
