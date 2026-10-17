'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { DatabaseSync } = require('node:sqlite');
const { createManifest, validateManifest, reconcileDraftPullRequest } =
  require('../lib/github-delivery-protocol.cjs');

const queueScript = path.resolve(__dirname, '../scripts/durable-job-queue.cjs');
const exec = promisify(execFile);

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'graf-delivery-proof-'));
  const dbFile = path.join(root, 'queue.sqlite');
  const env = { ...process.env, WORLD_SERVER_QUEUE_DB: dbFile };
  fs.mkdirSync(path.join(root, 'empty-hooks'));
  function git(cwd, ...args) {
    const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c',
      `core.hooksPath=${path.join(root, 'empty-hooks')}`, ...args], {
      cwd, encoding: 'utf8', timeout: 10000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  }
  function queue(...args) {
    const r = spawnSync(process.execPath, [queueScript, ...args.map(String)], {
      cwd: root, env, encoding: 'utf8', timeout: 10000
    });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  }
  function writeCommit(cwd, file, value, message) {
    fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    fs.writeFileSync(path.join(cwd, file), value);
    git(cwd, 'add', '--', file);
    git(cwd, '-c', 'user.name=Offline proof', '-c',
      'user.email=offline@example.invalid', 'commit', '-qm', message);
    return git(cwd, 'rev-parse', 'HEAD');
  }
  return { root, dbFile, env, git, queue, writeCommit,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('offline Git request -> durable queue -> uncertain API recovery -> Git receipt', async () => {
  const f = fixture();
  try {
    const remote = path.join(f.root, 'origin.git');
    const producer = path.join(f.root, 'producer');
    const consumer = path.join(f.root, 'consumer');
    f.git(f.root, 'init', '--bare', '-q', remote);
    f.git(f.root, 'clone', '-q', remote, producer);
    const head = 'ai/codex/offline-source';
    f.git(producer, 'checkout', '-qb', head);
    const sha = f.writeCommit(producer, 'source.txt', 'saved code\n', 'Save code');
    f.git(producer, 'push', '-q', 'origin', head);
    const manifest = createManifest({ repo: 'mpaykin1/World_server', base: 'master',
      head, sha, title: 'Offline delivery proof', body: 'Local fixture only.' });
    const outboxBranch = 'ai/codex/github-outbox-proof';
    const requestPath = `.ai/github-outbox/${manifest.id}.json`;
    f.git(producer, 'checkout', '-qb', outboxBranch);
    f.writeCommit(producer, requestPath, JSON.stringify(manifest), 'Save PR request');
    f.git(producer, 'push', '-q', 'origin', outboxBranch);

    // All transport here is local Git. No HTTP, GitHub, hooks or requested code runs.
    f.git(f.root, 'clone', '-q', remote, consumer);
    const imported = validateManifest(JSON.parse(f.git(consumer, 'show',
      `refs/remotes/origin/${outboxBranch}:${requestPath}`)));
    const queued = f.queue('enqueue', 'github-create-draft-pr',
      JSON.stringify(imported), 0, 3, imported.id);
    const duplicate = f.queue('enqueue', 'github-create-draft-pr',
      JSON.stringify(imported), 0, 3, imported.id);
    assert.equal(duplicate.id, queued.id);
    let savedPr = null;
    let creates = 0;
    const adapter = {
      resolveHead: async () => f.git(consumer, 'rev-parse',
        `refs/remotes/origin/${head}`),
      findPullRequest: async () => savedPr,
      createDraftPullRequest: async request => {
        creates++;
        savedPr = { repo: request.repo, number: 7,
          url: 'https://github.com/mpaykin1/World_server/pull/7',
          base: request.base, head: request.head, sha: request.sha,
          body: request.body, draft: true, state: 'open' };
        throw new Error('simulated response lost after server write');
      }
    };
    const first = f.queue('claim', 'executor-1', 30000);
    assert.equal(first.id, queued.id);
    await assert.rejects(reconcileDraftPullRequest(first.payload, adapter));
    // Separate process persists the retry; a fresh queue process resumes it.
    f.queue('fail', first.id, 'executor-1', 'uncertain-response', 0);
    const second = f.queue('claim', 'executor-2', 30000);
    assert.equal(second.attempts, 2);
    const receipt = await reconcileDraftPullRequest(second.payload, adapter);
    assert.equal(receipt.status, 'reused');
    assert.equal(creates, 1);
    assert.equal(receipt.sha, sha);
    f.queue('ack', second.id, 'executor-2', JSON.stringify(receipt));
    assert.deepEqual(f.queue('health').counts, { done: 1 });

    const receiptBranch = 'ai/bridge/github-receipts-proof';
    const receiptPath = `.ai/github-receipts/${manifest.id}.json`;
    f.git(consumer, 'checkout', '-qb', receiptBranch,
      `refs/remotes/origin/${outboxBranch}`);
    f.writeCommit(consumer, receiptPath, JSON.stringify(receipt), 'Save receipt');
    f.git(consumer, 'push', '-q', 'origin', receiptBranch);
    f.git(producer, 'fetch', '-q', 'origin', receiptBranch);
    const returned = JSON.parse(f.git(producer, 'show', `FETCH_HEAD:${receiptPath}`));
    assert.equal(returned.operationId, manifest.id);
    assert.equal(returned.sha, sha);
    assert.equal(f.git(producer, 'show', `origin/${head}:source.txt`), 'saved code');
  } finally { f.cleanup(); }
});

test('existing queue serializes competing processes and rejects a superseded owner', async () => {
  const f = fixture();
  try {
    const job = f.queue('enqueue', 'github-create-draft-pr', '{}', 0, 3, 'lease-proof');
    const outputs = await Promise.all(['worker-a', 'worker-b'].map(worker =>
      exec(process.execPath, [queueScript, 'claim', worker, '30000'], {
        cwd: f.root, env: f.env, timeout: 10000
      })));
    const claims = outputs.map(r => JSON.parse(r.stdout)).filter(Boolean);
    assert.equal(claims.length, 1);
    const db = new DatabaseSync(f.dbFile);
    try {
      db.prepare('UPDATE jobs SET lease_until=? WHERE id=?').run(Date.now() - 1000, job.id);
    } finally { db.close(); }
    assert.equal(f.queue('resume-stale').recovered, 1);
    const replacement = f.queue('claim', 'replacement-unique-run-id', 30000);
    assert.equal(replacement.id, job.id);
    const staleAck = spawnSync(process.execPath, [queueScript, 'ack', job.id,
      claims[0].lease_owner, '{}'], { cwd: f.root, env: f.env, encoding: 'utf8', timeout: 10000 });
    assert.equal(staleAck.status, 2);
    assert.match(staleAck.stderr, /lease owner mismatch/);
    f.queue('ack', job.id, replacement.lease_owner, '{}');
    assert.deepEqual(f.queue('health').counts, { done: 1 });
  } finally { f.cleanup(); }
});
