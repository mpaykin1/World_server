'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'cas-merkle-store.cjs');

function mkFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cas-gc-fixture-'));
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'a.txt'), 'hello world');
  fs.writeFileSync(path.join(dir, 'b.txt'), 'second file');
  return dir;
}

function run(cmd, args, cwd, env) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, cmd, ...args], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env }
    });
    return { ok: true, code: 0, stdout };
  } catch (e) {
    return { ok: false, code: e.status, stdout: String(e.stdout || ''), stderr: String(e.stderr || '') };
  }
}

function casObjectCount(dir) {
  const casRoot = path.join(dir, '.world-server-state', 'cas', 'sha256');
  if (!fs.existsSync(casRoot)) return 0;
  let n = 0;
  for (const prefix of fs.readdirSync(casRoot)) {
    const p = path.join(casRoot, prefix);
    if (fs.statSync(p).isDirectory()) n += fs.readdirSync(p).length;
  }
  return n;
}
function snapshotIds(dir) {
  const snapRoot = path.join(dir, '.world-server-state', 'snapshots');
  if (!fs.existsSync(snapRoot)) return [];
  return fs.readdirSync(snapRoot).filter(x => x.endsWith('.json')).sort();
}

test('gc never removes objects referenced by a retained snapshot', () => {
  const dir = mkFixture();
  const s1 = run('snapshot', ['keep-me'], dir, { CAS_GC_ENABLED: 'false' });
  assert.equal(s1.ok, true, s1.stderr);
  const before = casObjectCount(dir);
  assert.ok(before >= 2);
  const g = run('gc', ['20'], dir, {});
  assert.equal(g.ok, true, g.stderr);
  const after = casObjectCount(dir);
  assert.equal(after, before, 'gc must not delete objects the only retained snapshot still references');
  const v = run('verify', [], dir, {});
  assert.equal(v.ok, true, v.stderr);
});

test('gc deletes orphan objects that no retained snapshot references', () => {
  const dir = mkFixture();
  run('snapshot', ['first'], dir, { CAS_GC_ENABLED: 'false' });
  // simulate an old, now-unreferenced object sitting in CAS (e.g. a file that
  // existed in an earlier, since-superseded snapshot generation)
  const orphanHash = 'f'.repeat(64);
  const orphanDir = path.join(dir, '.world-server-state', 'cas', 'sha256', orphanHash.slice(0, 2));
  fs.mkdirSync(orphanDir, { recursive: true });
  fs.writeFileSync(path.join(orphanDir, orphanHash.slice(2)), 'orphan bytes');
  assert.ok(fs.existsSync(path.join(orphanDir, orphanHash.slice(2))));
  const g = run('gc', ['20'], dir, {});
  assert.equal(g.ok, true, g.stderr);
  assert.equal(fs.existsSync(path.join(orphanDir, orphanHash.slice(2))), false, 'orphan object should be reclaimed');
});

test('gc keeps only the most recent N snapshots', () => {
  const dir = mkFixture();
  for (let i = 0; i < 8; i++) {
    fs.writeFileSync(path.join(dir, `gen-${i}.txt`), `generation ${i} ${Math.random()}`);
    const r = run('snapshot', [`gen-${i}`], dir, { CAS_GC_ENABLED: 'false' });
    assert.equal(r.ok, true, r.stderr);
  }
  assert.equal(snapshotIds(dir).length, 8);
  const g = run('gc', ['3'], dir, {});
  assert.equal(g.ok, true, g.stderr);
  const remaining = snapshotIds(dir);
  assert.equal(remaining.length, 3, 'only 3 snapshots should remain');
  const remainingLabels = remaining.map(f => f.match(/gen-(\d)/)?.[1]).filter(Boolean).map(Number);
  assert.deepEqual(remainingLabels.sort((a, b) => a - b), [5, 6, 7], 'the 3 most recent snapshots must be the ones kept');
});

test('gc is idempotent', () => {
  const dir = mkFixture();
  for (let i = 0; i < 5; i++) {
    fs.writeFileSync(path.join(dir, `f-${i}.txt`), `content ${i}`);
    run('snapshot', [`s${i}`], dir, { CAS_GC_ENABLED: 'false' });
  }
  const g1 = run('gc', ['2'], dir, {});
  assert.equal(g1.ok, true, g1.stderr);
  const objectsAfterFirst = casObjectCount(dir);
  const snapsAfterFirst = snapshotIds(dir);
  const g2 = run('gc', ['2'], dir, {});
  assert.equal(g2.ok, true, g2.stderr);
  assert.equal(casObjectCount(dir), objectsAfterFirst, 'second gc run should not remove anything new');
  assert.deepEqual(snapshotIds(dir), snapsAfterFirst, 'second gc run should leave the same snapshots in place');
});

test('a corrupt retained snapshot manifest aborts gc instead of deleting objects (fail-safe)', () => {
  const dir = mkFixture();
  run('snapshot', ['ok-one'], dir, { CAS_GC_ENABLED: 'false' });
  const before = casObjectCount(dir);
  const snapDir = path.join(dir, '.world-server-state', 'snapshots');
  const [onlyManifest] = snapshotIds(dir);
  fs.writeFileSync(path.join(snapDir, onlyManifest), '{ this is not valid json');
  const g = run('gc', ['20'], dir, {});
  assert.equal(g.ok, false, 'gc must report failure/abort when a kept manifest is corrupt');
  assert.equal(casObjectCount(dir), before, 'no objects may be deleted when the reachable set could not be computed');
  const alarm = path.join(dir, 'CAS_GC_ALARM.json');
  assert.ok(fs.existsSync(alarm), 'an alarm file should explain the abort');
});

test('post-snapshot auto-gc keeps CAS bounded under repeated growth (watermark trigger)', () => {
  const dir = mkFixture();
  const env = {
    CAS_GC_ENABLED: 'true',
    CAS_GC_KEEP_SNAPSHOTS: '3',
    CAS_GC_WARN_BYTES: '200',
    CAS_GC_AUTO_BYTES: '400',
    CAS_GC_EMERGENCY_BYTES: '100000000'
  };
  let peakObjects = 0;
  // Mirrors the real incident: a report file at a STABLE path gets rewritten
  // with new content on every run (a timestamped status/report JSON in the
  // real project). Each rewrite mints a new CAS object; only auto-gc pruning
  // superseded snapshots keeps the old hashes of that same path from piling
  // up forever.
  for (let i = 0; i < 20; i++) {
    fs.writeFileSync(path.join(dir, 'churning-report.txt'), `unique payload ${i} ${'x'.repeat(50)}`);
    const r = run('snapshot', [`churn-${i}`], dir, env);
    assert.equal(r.ok, true, r.stderr);
    peakObjects = Math.max(peakObjects, casObjectCount(dir));
  }
  const finalObjects = casObjectCount(dir);
  const finalSnapshots = snapshotIds(dir).length;
  // Without auto-gc, all 20 distinct historical versions of churning-report.txt
  // would still be sitting in CAS (>=22 objects: 2 static fixture files + 20
  // historical versions). With the watermark-triggered auto-gc firing after
  // each snapshot and only 3 snapshots retained, growth must stay bounded
  // near the keep-window instead of accumulating every version ever written.
  assert.ok(finalObjects < 22, `expected auto-gc to bound CAS growth, got ${finalObjects} objects (peak ${peakObjects})`);
  assert.ok(finalSnapshots <= 3, `expected at most 3 retained snapshots, got ${finalSnapshots}`);
  const status = JSON.parse(fs.readFileSync(path.join(dir, 'CAS_GC_STATUS.json'), 'utf8'));
  assert.equal(status.lastGcOk, true);
  assert.ok(!fs.existsSync(path.join(dir, 'CAS_GC_ALARM.json')), 'no alarm should be raised for a healthy auto-gc run');
});

test('emergency watermark runs GC and blocks further snapshot/index growth if still oversized', () => {
  const dir = mkFixture();
  fs.writeFileSync(path.join(dir, 'big.txt'), 'z'.repeat(5000));
  const r1 = run('snapshot', ['big'], dir, {
    CAS_GC_ENABLED: 'true', CAS_GC_KEEP_SNAPSHOTS: '20',
    CAS_GC_WARN_BYTES: '1', CAS_GC_AUTO_BYTES: '1', CAS_GC_EMERGENCY_BYTES: '1',
    CAS_GC_BLOCK_ON_EMERGENCY: 'true'
  });
  // this single retained snapshot's own objects exceed the (deliberately tiny)
  // emergency threshold, so even emergency GC cannot get back under it
  assert.ok(fs.existsSync(path.join(dir, 'CAS_EMERGENCY_BLOCK.json')), 'emergency block flag should be written');
  const r2 = run('snapshot', ['should-be-blocked'], dir, {
    CAS_GC_ENABLED: 'true', CAS_GC_WARN_BYTES: '1', CAS_GC_AUTO_BYTES: '1', CAS_GC_EMERGENCY_BYTES: '1',
    CAS_GC_BLOCK_ON_EMERGENCY: 'true'
  });
  assert.equal(r2.ok, false, 'further growth must be refused while the emergency block is active');
  // raising the limit back up should clear the block on the next run
  const r3 = run('snapshot', ['unblocked'], dir, {
    CAS_GC_ENABLED: 'true', CAS_GC_WARN_BYTES: '1000000000', CAS_GC_AUTO_BYTES: '1000000000', CAS_GC_EMERGENCY_BYTES: '1000000000'
  });
  assert.equal(r3.ok, true, r3.stderr);
  assert.ok(!fs.existsSync(path.join(dir, 'CAS_EMERGENCY_BLOCK.json')), 'block flag should clear once back under the limit');
});

test('verify passes after gc on the retained latest snapshot', () => {
  const dir = mkFixture();
  for (let i = 0; i < 4; i++) {
    fs.writeFileSync(path.join(dir, `v-${i}.txt`), `v${i}`);
    run('snapshot', [`v${i}`], dir, { CAS_GC_ENABLED: 'false' });
  }
  const g = run('gc', ['1'], dir, {});
  assert.equal(g.ok, true, g.stderr);
  const v = run('verify', [], dir, {});
  assert.equal(v.ok, true, v.stderr);
});
