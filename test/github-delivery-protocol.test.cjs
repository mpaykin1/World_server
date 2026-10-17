'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createManifest, validateManifest, operationMarker, validateReceipt,
  reconcileDraftPullRequest } = require('../lib/github-delivery-protocol.cjs');

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const INPUT = Object.freeze({ repo: 'mpaykin1/World_server', base: 'master',
  head: 'ai/codex/delivery-test', sha: SHA, title: 'Draft: delivery proof', body: 'Offline evidence.' });
const manifest = () => createManifest({ ...INPUT });
const errorCode = code => error => error.code === code;

function fakeAdapter(options = {}) {
  const state = { sha: SHA, pr: null, writes: 0, reads: 0, calls: [], ...options };
  const adapter = {
    async resolveHead(value) { state.calls.push(['resolveHead', value]); return state.sha; },
    async findPullRequest(value) {
      state.calls.push(['findPullRequest', value]); state.reads++;
      if (state.readError) throw new Error('sensitive upstream error');
      return state.pr;
    },
    async createDraftPullRequest(value) {
      state.calls.push(['createDraftPullRequest', value]); state.writes++;
      state.pr = { repo: value.repo, number: 71, url: `https://github.com/${value.repo}/pull/71`,
        head: value.head, base: value.base, sha: value.sha, body: value.body,
        draft: value.draft, state: 'open' };
      if (state.crashAfterWrite) throw new Error('uncertain write with secret');
      return state.pr;
    }
  };
  return { state, adapter };
}

test('manifest identity is deterministic, immutable, ordered and content-bound', () => {
  const first = manifest();
  const reversed = Object.fromEntries(Object.entries(INPUT).reverse());
  assert.deepEqual(createManifest(reversed), first);
  assert.match(first.id, /^[a-f0-9]{64}$/);
  assert(Object.isFrozen(first));
  assert.deepEqual(validateManifest(JSON.parse(JSON.stringify(first))), first);
  for (const patch of [{ title: 'Other' }, { body: 'Other' }, { sha: OTHER_SHA },
    { head: 'ai/codex/other' }]) assert.notEqual(createManifest({ ...INPUT, ...patch }).id, first.id);
  assert.equal(operationMarker(first), `<!-- graf-github-delivery:${first.id} -->`);
});

test('only two repository and base pairs are accepted', () => {
  assert.equal(createManifest({ ...INPUT, repo: 'mpaykin1/meta6', base: 'main' }).base, 'main');
  for (const patch of [{ repo: 'evil/repo' }, { repo: 'mpaykin1/meta6' },
    { repo: '__proto__' }, { base: 'main' }, { base: 'release' }]) {
    assert.throws(() => createManifest({ ...INPUT, ...patch }), errorCode('INVALID_TARGET'));
  }
});

test('repository identity rejects coercible values without calling their conversion hooks', () => {
  let coercions = 0;
  const forged = { toString() { coercions++; return INPUT.repo; } };
  for (const repo of [[INPUT.repo], new String(INPUT.repo), forged]) {
    assert.throws(() => createManifest({ ...INPUT, repo }), errorCode('INVALID_TARGET'));
  }
  assert.equal(coercions, 0);
});

test('strict immutable source rejects unsafe refs and malformed hashes', () => {
  const heads = ['master', 'ai/codex', 'ai//task', 'ai/codex/../task', 'ai/codex/task.lock',
    'ai/codex/task.', 'ai/codex/@{task}', 'ai/codex/a b', 'ai/codex/$()'];
  for (const head of heads) assert.throws(() => createManifest({ ...INPUT, head }), errorCode('INVALID_SOURCE'));
  for (const sha of ['abc', 'A'.repeat(40), '0'.repeat(40), SHA + '\n', 42]) {
    assert.throws(() => createManifest({ ...INPUT, sha }), errorCode('INVALID_SOURCE'));
  }
});

test('bounded plain text rejects control characters and operation marker injection', () => {
  for (const title of ['', ' title', 'title ', 'a'.repeat(201), 'bad\nheader', 'bad\u0000']) {
    assert.throws(() => createManifest({ ...INPUT, title }), errorCode('INVALID_TITLE'));
  }
  for (const body of ['a'.repeat(32001), '\u0000', '<!-- graf-github-delivery:forged -->']) {
    assert.throws(() => createManifest({ ...INPUT, body }), errorCode('INVALID_BODY'));
  }
  assert.equal(createManifest({ ...INPUT, body: 'Line one\n\tLine two' }).body, 'Line one\n\tLine two');
});

test('extra keys, accessors, symbols, invalid prototypes and tampered IDs are rejected', () => {
  for (const key of ['url', 'command', 'path', 'token', 'draft']) {
    assert.throws(() => createManifest({ ...INPUT, [key]: 'untrusted' }), errorCode('INVALID_MANIFEST'));
  }
  assert.throws(() => createManifest({ ...INPUT, [Symbol('x')]: 1 }), errorCode('INVALID_MANIFEST'));
  const accessor = { ...INPUT };
  Object.defineProperty(accessor, 'title', { enumerable: true, get() { throw new Error('must not execute'); } });
  assert.throws(() => createManifest(accessor), errorCode('INVALID_MANIFEST'));
  assert.throws(() => createManifest(Object.assign(Object.create({}), INPUT)), errorCode('INVALID_MANIFEST'));
  assert.throws(() => validateManifest({ ...manifest(), id: 'a'.repeat(64) }), errorCode('INVALID_ID'));
  assert.throws(() => validateManifest({ ...manifest(), operation: 'merge-pr' }), errorCode('INVALID_OPERATION'));
  assert.throws(() => validateManifest({ ...manifest(), schemaVersion: 2 }), errorCode('INVALID_OPERATION'));
});

test('new PR is always draft and verified with a separate read before returning a receipt', async () => {
  const item = manifest();
  const { state, adapter } = fakeAdapter();
  const receipt = await reconcileDraftPullRequest(item, adapter);
  assert.deepEqual(state.calls.map(call => call[0]),
    ['resolveHead', 'findPullRequest', 'createDraftPullRequest', 'findPullRequest']);
  assert.equal(state.writes, 1);
  assert.equal(state.pr.body, `${INPUT.body}\n\n${operationMarker(item)}`);
  assert.equal(state.pr.draft, true);
  assert.equal(receipt.status, 'created');
  assert.equal(receipt.operationId, item.id);
  assert.equal(receipt.sha, SHA);
  assert(Object.isFrozen(receipt));
  assert.deepEqual(validateReceipt(JSON.parse(JSON.stringify(receipt)), item), receipt);
});

test('duplicate replay reuses one existing PR without another write', async () => {
  const item = manifest();
  const { state, adapter } = fakeAdapter();
  const first = await reconcileDraftPullRequest(item, adapter);
  const second = await reconcileDraftPullRequest(item, adapter);
  assert.equal(second.status, 'reused');
  assert.equal(second.number, first.number);
  assert.equal(state.writes, 1);
});

test('crash after server write is recovered by lookup on next invocation', async () => {
  const { state, adapter } = fakeAdapter({ crashAfterWrite: true });
  await assert.rejects(reconcileDraftPullRequest(manifest(), adapter), errorCode('WRITE_UNCERTAIN'));
  assert.equal(state.writes, 1);
  const receipt = await reconcileDraftPullRequest(manifest(), adapter);
  assert.equal(receipt.status, 'reused');
  assert.equal(state.writes, 1);
});

test('read failures, invalid adapters and stale source never create a PR', async () => {
  const first = fakeAdapter({ readError: true });
  await assert.rejects(reconcileDraftPullRequest(manifest(), first.adapter), errorCode('READ_UNAVAILABLE'));
  assert.equal(first.state.writes, 0);
  const second = fakeAdapter({ sha: OTHER_SHA });
  await assert.rejects(reconcileDraftPullRequest(manifest(), second.adapter), errorCode('STALE_SOURCE'));
  assert.equal(second.state.writes, 0);
  assert.equal(second.state.reads, 0);
  second.adapter.resolveHead = async () => { throw new Error('auth secret'); };
  await assert.rejects(reconcileDraftPullRequest(manifest(), second.adapter), errorCode('READ_UNAVAILABLE'));
  assert.equal(second.state.writes, 0);
  await assert.rejects(reconcileDraftPullRequest(manifest(), {}), errorCode('INVALID_ADAPTER'));
});

test('existing PR conflicts are rejected without updates or second creation', async () => {
  for (const patch of [{ repo: 'evil/repo' }, { base: 'main' }, { head: 'ai/other/task' },
    { sha: OTHER_SHA }, { draft: false }, { state: 'closed' }, { body: INPUT.body },
    { url: 'https://evil.test/pull/71' }, { url: 'https://github.com/mpaykin1/World_server/pull/72' },
    { number: 0 }, { token: 'extra' }]) {
    const { state, adapter } = fakeAdapter();
    await reconcileDraftPullRequest(manifest(), adapter);
    Object.assign(state.pr, patch);
    await assert.rejects(reconcileDraftPullRequest(manifest(), adapter), errorCode('PR_CONFLICT'));
    assert.equal(state.writes, 1);
  }
});

test('ambiguous lookup never authorizes creation', async () => {
  for (const pr of [undefined, [], {}, false]) {
    const { state, adapter } = fakeAdapter({ pr });
    await assert.rejects(reconcileDraftPullRequest(manifest(), adapter), errorCode('PR_CONFLICT'));
    assert.equal(state.writes, 0);
  }
});

test('successful create without trustworthy read-back produces no receipt', async () => {
  for (const mode of ['missing', 'changedSha', 'otherNumber', 'readError']) {
    const { state, adapter } = fakeAdapter();
    const originalFind = adapter.findPullRequest;
    adapter.findPullRequest = async value => {
      if (!state.writes) return originalFind(value);
      if (mode === 'missing') return null;
      if (mode === 'readError') throw new Error('secret');
      return { ...state.pr, ...(mode === 'changedSha' ? { sha: OTHER_SHA }
        : { number: 72, url: 'https://github.com/mpaykin1/World_server/pull/72' }) };
    };
    await assert.rejects(reconcileDraftPullRequest(manifest(), adapter),
      errorCode(mode === 'readError' ? 'READ_UNAVAILABLE' : 'PR_CONFLICT'));
    assert.equal(state.writes, 1);
  }
});

test('branch movement after source resolution is detected after a write without issuing a receipt', async () => {
  const { state, adapter } = fakeAdapter();
  const originalCreate = adapter.createDraftPullRequest;
  adapter.createDraftPullRequest = async value => {
    state.sha = OTHER_SHA;
    const created = await originalCreate(value);
    created.sha = OTHER_SHA;
    return created;
  };
  await assert.rejects(reconcileDraftPullRequest(manifest(), adapter), errorCode('PR_CONFLICT'));
  assert.equal(state.writes, 1);
  assert.equal(state.reads, 1);
  assert.equal(state.pr.sha, OTHER_SHA);
});

test('untrusted creation response is rejected before any URL can be followed', async () => {
  const { state, adapter } = fakeAdapter();
  const original = adapter.createDraftPullRequest;
  adapter.createDraftPullRequest = async value => ({ ...await original(value), url: 'http://localhost/secret' });
  await assert.rejects(reconcileDraftPullRequest(manifest(), adapter), errorCode('PR_CONFLICT'));
  assert.equal(state.reads, 1);
});

test('read-back cannot mutate the original creation response to rewrite PR identity', async () => {
  const { state, adapter } = fakeAdapter();
  const originalFind = adapter.findPullRequest;
  adapter.findPullRequest = async value => {
    if (state.writes) Object.assign(state.pr,
      { number: 72, url: 'https://github.com/mpaykin1/World_server/pull/72' });
    return originalFind(value);
  };
  await assert.rejects(reconcileDraftPullRequest(manifest(), adapter), errorCode('PR_CONFLICT'));
  assert.equal(state.writes, 1);
});

test('receipts reject unexpected payload, wrong SHA and forged canonical URL', async () => {
  const { adapter } = fakeAdapter();
  const item = manifest();
  const receipt = await reconcileDraftPullRequest(item, adapter);
  for (const patch of [{ secret: 'x' }, { sha: OTHER_SHA }, { operationId: 'b'.repeat(64) },
    { url: receipt.url + '?token=x' }, { status: 'merged' }, { number: -1 }, { repo: 'evil/repo' }]) {
    assert.throws(() => validateReceipt({ ...receipt, ...patch }, item), errorCode('INVALID_RECEIPT'));
  }
});

test('transport error details and possible secrets do not escape protocol errors', async () => {
  const { adapter } = fakeAdapter();
  adapter.resolveHead = async () => { throw new Error('Authorization: Bearer private-token'); };
  await assert.rejects(reconcileDraftPullRequest(manifest(), adapter), error => {
    assert.equal(error.code, 'READ_UNAVAILABLE');
    assert(!JSON.stringify(error).includes('private-token'));
    assert(!error.stack.includes('private-token'));
    assert.equal(error.cause, undefined);
    return true;
  });
});
