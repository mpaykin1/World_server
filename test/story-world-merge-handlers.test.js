'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeSupabase } = require('./helpers/fake-supabase');
const { _private: story } = require('../lib/api-handlers/story');
const { _private: world } = require('../lib/api-handlers/world');
const { _private: merge } = require('../lib/api-handlers/merge');

const guestA = { kind: 'guest', userId: null, guestId: '11111111-1111-1111-1111-111111111111' };
const guestB = { kind: 'guest', userId: null, guestId: '22222222-2222-2222-2222-222222222222' };

test('story.save creates a new story owned by the caller guestId', async () => {
  const admin = createFakeSupabase();
  const result = await story.handleSave(admin, guestA, { answers: { story: 'hi' } });
  assert.ok(result.id);
  const row = admin._tables.get('stories')[0];
  assert.equal(row.owner_guest_id, guestA.guestId);
  assert.equal(row.owner_user_id, null);
});

test('story.save with finish:true computes and persists a blueprint', async () => {
  const admin = createFakeSupabase();
  const result = await story.handleSave(admin, guestA, { answers: { story: 'hi', format: 'game' }, finish: true });
  assert.ok(result.blueprint);
  assert.equal(result.blueprint.mode, 'Игра');
  assert.deepEqual(admin._tables.get('stories')[0].blueprint, result.blueprint);
});

test('story.save increments version on every successful update', async () => {
  const admin = createFakeSupabase();
  const created = await story.handleSave(admin, guestA, { answers: { story: 'v1' } });
  assert.equal(created.version, 1);
  const updated = await story.handleSave(admin, guestA, { storyId: created.id, answers: { story: 'v2' }, expectedVersion: 1 });
  assert.equal(updated.version, 2);
  assert.equal(admin._tables.get('stories')[0].answers.story, 'v2');
});

test('story.save detects a version conflict instead of silently overwriting a newer server write', async () => {
  // Simulates the realistic case: a queued offline write (still holding the
  // version it saw before going offline) tries to land after a more recent
  // online write from the same browser already moved the story forward.
  const admin = createFakeSupabase();
  const created = await story.handleSave(admin, guestA, { answers: { story: 'v1' } });
  await story.handleSave(admin, guestA, { storyId: created.id, answers: { story: 'v2 (written online)' }, expectedVersion: 1 });

  const staleWrite = await story.handleSave(admin, guestA, { storyId: created.id, answers: { story: 'v2 (queued while offline)' }, expectedVersion: 1 });
  assert.equal(staleWrite.conflict, true);
  assert.equal(staleWrite.server.version, 2);
  assert.equal(staleWrite.server.answers.story, 'v2 (written online)');
  // The server's real state must never have been clobbered by the stale write.
  assert.equal(admin._tables.get('stories')[0].answers.story, 'v2 (written online)');
});

test('story.save rejects updating a story owned by a different guestId', async () => {
  const admin = createFakeSupabase({ stories: [{ id: 's1', owner_guest_id: guestA.guestId, owner_user_id: null, answers: {} }] });
  await assert.rejects(
    () => story.handleSave(admin, guestB, { storyId: 's1', answers: { story: 'hacked' } }),
    (err) => err.status === 404
  );
});

test('world.generate requires the story to have a blueprint (be finished) first', async () => {
  const admin = createFakeSupabase({ stories: [{ id: 's1', owner_guest_id: guestA.guestId, owner_user_id: null, answers: {}, blueprint: null }] });
  await assert.rejects(
    () => world.handleGenerate(admin, guestA, { storyId: 's1' }),
    (err) => err.status === 400
  );
});

test('world.generate creates a published world from a finished story, owned by the caller', async () => {
  const admin = createFakeSupabase({
    stories: [{ id: 's1', owner_guest_id: guestA.guestId, owner_user_id: null, answers: { chars: [{ name: 'Hero' }] }, blueprint: { title: 'A', mode: '', scene: 'x' } }]
  });
  const result = await world.handleGenerate(admin, guestA, { storyId: 's1' });
  assert.equal(result.status, 'published');
  assert.ok(result.id.startsWith('w-'));
  assert.equal(result.spec.characters[0].name, 'Hero');
});

test('world.get hides a draft world from anyone but its owner', async () => {
  const admin = createFakeSupabase({ worlds: [{ id: 'w1', status: 'draft', owner_guest_id: guestA.guestId, owner_user_id: null, spec: {} }] });
  await assert.rejects(() => world.handleGet(admin, guestB, { worldId: 'w1' }), (err) => err.status === 404);
  const ok = await world.handleGet(admin, guestA, { worldId: 'w1' });
  assert.equal(ok.id, 'w1');
});

test('world.get allows anyone to read a published world', async () => {
  const admin = createFakeSupabase({ worlds: [{ id: 'w1', status: 'published', owner_guest_id: guestA.guestId, owner_user_id: null, spec: {} }] });
  const result = await world.handleGet(admin, guestB, { worldId: 'w1' });
  assert.equal(result.id, 'w1');
});

test('merge.create rejects fewer than two source worlds', async () => {
  const admin = createFakeSupabase();
  await assert.rejects(() => merge.handleCreate(admin, guestA, { sourceWorldIds: ['w1'] }), (err) => err.status === 400);
});

test('merge.create rejects a draft (unpublished) source world', async () => {
  const admin = createFakeSupabase({
    worlds: [
      { id: 'wa', status: 'published', spec: { characters: [], worlds: [], provenance: {} }, source_story_ids: [] },
      { id: 'wb', status: 'draft', spec: {}, source_story_ids: [] }
    ]
  });
  await assert.rejects(() => merge.handleCreate(admin, guestA, { sourceWorldIds: ['wa', 'wb'] }), (err) => err.status === 400);
});

test('merge.create composes A+B into a new published world with provenance, and is idempotent', async () => {
  const admin = createFakeSupabase({
    worlds: [
      { id: 'wa', status: 'published', spec: { title: 'A', scene: 'sa', characters: [{ name: 'Hero' }], worlds: [], provenance: { sourceStoryIds: ['sa'] } }, source_story_ids: ['sa'] },
      { id: 'wb', status: 'published', spec: { title: 'B', scene: 'sb', characters: [{ name: 'Villain' }], worlds: [], provenance: { sourceStoryIds: ['sb'] } }, source_story_ids: ['sb'] }
    ]
  });
  const first = await merge.handleCreate(admin, guestA, { sourceWorldIds: ['wa', 'wb'] });
  assert.equal(first.reused, false);
  assert.equal(admin._tables.get('worlds').length, 3);
  assert.equal(admin._tables.get('merges').length, 1);

  const second = await merge.handleCreate(admin, guestB, { sourceWorldIds: ['wb', 'wa'] }); // reversed order
  assert.equal(second.reused, true);
  assert.equal(second.resultWorldId, first.resultWorldId);
  // No new rows were created on the idempotent re-merge.
  assert.equal(admin._tables.get('worlds').length, 3);
  assert.equal(admin._tables.get('merges').length, 1);
});

test('merge.create folds three worlds A+B+C into one result with all three in provenance', async () => {
  const admin = createFakeSupabase({
    worlds: [
      { id: 'wa', status: 'published', spec: { title: 'A', scene: 'sa', characters: [], worlds: [], provenance: { sourceStoryIds: ['sa'] } }, source_story_ids: ['sa'] },
      { id: 'wb', status: 'published', spec: { title: 'B', scene: 'sb', characters: [], worlds: [], provenance: { sourceStoryIds: ['sb'] } }, source_story_ids: ['sb'] },
      { id: 'wc', status: 'published', spec: { title: 'C', scene: 'sc', characters: [], worlds: [], provenance: { sourceStoryIds: ['sc'] } }, source_story_ids: ['sc'] }
    ]
  });
  const result = await merge.handleCreate(admin, guestA, { sourceWorldIds: ['wa', 'wb', 'wc'] });
  assert.deepEqual(result.spec.provenance.sourceStoryIds, ['sa', 'sb', 'sc']);
});
