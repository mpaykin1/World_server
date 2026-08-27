'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Regression guard for supabase/migrations/20260827100000_story_world_merge.sql
// (the Session/Story/World/Merge backend for the improve-world-home
// questionnaire -> world creation -> merge pipeline). Applied and verified
// against a real Supabase project (world-server-preview) via get_advisors
// before being committed -- these are structural assertions on the tracked
// SQL file so a later edit can't silently drop RLS or the ownership model.

const MIGRATION_PATH = path.join(__dirname, '..', 'supabase', 'migrations', '20260827100000_story_world_merge.sql');

function sql() {
  return fs.readFileSync(MIGRATION_PATH, 'utf8');
}

test('migration file exists', () => {
  assert.ok(fs.existsSync(MIGRATION_PATH));
});

for (const table of ['stories', 'worlds', 'merges']) {
  test(`${table} has row level security enabled`, () => {
    assert.match(sql(), new RegExp(`alter table public\\.${table} enable row level security`));
  });
}

test('stories and merges are server-only (no anon/authenticated grants)', () => {
  const s = sql();
  assert.match(s, /revoke all on public\.stories from anon, authenticated/);
  assert.match(s, /revoke all on public\.merges from anon, authenticated/);
});

test('worlds grants read-only access to published rows, nothing else, to anon/authenticated', () => {
  const s = sql();
  assert.match(s, /create policy "published worlds are publicly readable" on public\.worlds/);
  assert.match(s, /for select to anon, authenticated/);
  assert.match(s, /using \(status = 'published'\)/);
  assert.match(s, /revoke insert, update, delete on public\.worlds from anon, authenticated/);
});

test('stories and worlds enforce the dual owner_user_id/owner_guest_id ownership model', () => {
  const s = sql();
  assert.match(s, /constraint stories_owner_identity check \(owner_user_id is not null or owner_guest_id is not null\)/);
  assert.match(s, /constraint worlds_owner_identity check \(owner_user_id is not null or owner_guest_id is not null\)/);
});

test('worlds status is constrained to draft or published', () => {
  assert.match(sql(), /check \(status in \('draft', 'published'\)\)/);
});

test('merges requires at least two source worlds', () => {
  assert.match(sql(), /constraint merges_min_sources check \(array_length\(source_world_ids, 1\) >= 2\)/);
});

test('owner and FK columns reference public.profiles(id), matching the existing game_* tables convention', () => {
  const s = sql();
  assert.match(s, /owner_user_id uuid references public\.profiles\(id\)/g);
  const matches = s.match(/owner_user_id uuid references public\.profiles\(id\)/g) || [];
  assert.equal(matches.length, 2, 'both stories and worlds should reference profiles(id), not auth.users(id) directly');
});
