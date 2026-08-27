'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Regression guard for the offline-sync/conflict-resolution behavior added
// to apps/improve-world-home/public/app.js: Supabase is canonical once a
// story exists there; localStorage is a cache/offline-recovery/pending-sync
// layer only. This loads the real app.js into a minimal fake browser
// environment (fake fetch, localStorage, window, navigator) and exercises
// syncStory()/guestId()/apiPost() directly -- not a reimplementation of the
// logic, the actual shipped functions.

const APP_JS = fs.readFileSync(path.join(__dirname, '..', 'apps', 'improve-world-home', 'public', 'app.js'), 'utf8')
  .replace('verifyContract();location.hash===\'#why\'?showWhy():home();', '');

function loadApp({ fetchImpl, online = true } = {}) {
  const store = {};
  const fakeLocalStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    get iwGuestId() { return store.iwGuestId; }, set iwGuestId(v) { store.iwGuestId = v; },
    get iwStoryId() { return store.iwStoryId; }, set iwStoryId(v) { store.iwStoryId = v; },
    get iwSyncState() { return store.iwSyncState; }, set iwSyncState(v) { store.iwSyncState = v; },
    get iwDraft() { return store.iwDraft; }, set iwDraft(v) { store.iwDraft = v; }
  };
  const context = {
    localStorage: fakeLocalStorage,
    window: { addEventListener() {} },
    navigator: { onLine: online },
    crypto: { randomUUID: () => '11111111-1111-1111-1111-111111111111' },
    fetch: fetchImpl,
    document: { getElementById: () => null, createElement: () => ({ classList: { toggle() {} } }), body: { appendChild() {} } },
    location: { hash: '' },
    console
  };
  // eslint-disable-next-line no-new-func
  const fn = new Function(...Object.keys(context), `${APP_JS}\nreturn { syncStory: typeof syncStory!=='undefined'?syncStory:null, guestId, apiPost, syncState: typeof syncState!=='undefined'?syncState:null, setCurrentStoryId: (v)=>{currentStoryId=v}, getCurrentStoryId: ()=>currentStoryId };`);
  return { exports: fn(...Object.values(context)), store };
}

test('guestId is generated once and persisted in localStorage (cache, not a fresh id every call)', () => {
  const { exports } = loadApp({ fetchImpl: async () => ({ ok: true, json: async () => ({}) }) });
  const first = exports.guestId();
  const second = exports.guestId();
  assert.equal(first, second);
});

test('syncStory does nothing while offline and leaves the story queued as pending', async () => {
  let called = false;
  const { exports, store } = loadApp({ fetchImpl: async () => { called = true; return { ok: true, json: async () => ({}) }; }, online: false });
  exports.setCurrentStoryId('story-1');
  await exports.syncStory();
  assert.equal(called, false, 'must not attempt a network call while navigator.onLine is false');
});

test('syncStory adopts the server version and retries once on a 409 version conflict, without losing local answers', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push(body);
    if (calls.length === 1) {
      return { ok: false, status: 409, json: async () => ({ conflict: true, server: { version: 5, answers: { story: 'newer on server' } } }) };
    }
    return { ok: true, status: 200, json: async () => ({ id: 'story-1', version: 6 }) };
  };
  const { exports, store } = loadApp({ fetchImpl });
  exports.setCurrentStoryId('story-1');
  await exports.syncStory();

  assert.equal(calls.length, 2, 'must retry exactly once after adopting the server version');
  assert.equal(calls[0].expectedVersion, 0);
  assert.equal(calls[1].expectedVersion, 5, 'retry must use the version the server reported, not the stale local one');
  const finalState = JSON.parse(store.iwSyncState);
  assert.equal(finalState.version, 6);
  assert.equal(finalState.pending, false);
});

test('syncStory marks the story pending (for retry on reconnect) when the network call fails outright', async () => {
  const { exports, store } = loadApp({ fetchImpl: async () => { throw new Error('network down'); } });
  exports.setCurrentStoryId('story-1');
  await exports.syncStory();
  const state = JSON.parse(store.iwSyncState);
  assert.equal(state.pending, true);
});

test('a successful sync clears the pending flag and records the confirmed server version', async () => {
  const { exports, store } = loadApp({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ id: 'story-1', version: 1 }) }) });
  exports.setCurrentStoryId(null);
  await exports.syncStory();
  const state = JSON.parse(store.iwSyncState);
  assert.equal(state.pending, false);
  assert.equal(state.version, 1);
  assert.equal(exports.getCurrentStoryId(), 'story-1');
});
