import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { RecipeJournal } from '../shared/dark-void-infinite-runtime.mjs';

const memory = () => {
  const m = new Map();
  return {
    getItem: k => m.has(k) ? m.get(k) : null,
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    clear: () => m.clear()
  };
};

test('RecipeJournal exposes verified crash-recovery status without replacing persistence', async () => {
  const previousIndexedDB = globalThis.indexedDB;
  globalThis.localStorage = memory();
  globalThis.indexedDB = undefined;
  try {
    const first = new RecipeJournal();
    first.append({ id: 'recovery-1', intent: { type: 'tower', seed: 7 }, origin: { x: 1, y: 2, z: 3 }, blocks: [{}, {}] });
    await first.ready;
    const restored = new RecipeJournal();
    await restored.ready;
    const status = restored.recoveryStatus();
    assert.equal(status.restored, 1);
    assert.equal(status.verified, true);
    assert.equal(status.source, 'localStorage');
    assert.equal(status.persistence, 'localStorage');
    assert.equal(status.indexedDBUnavailable, true);
  } finally {
    globalThis.indexedDB = previousIndexedDB;
  }
});
test('Dark Void surfaces verified recovery in the existing Navigator status', async () => {
  const src = await fs.readFile(new URL('../apps/dark-void-scene/client.js', import.meta.url), 'utf8');
  assert.match(src, /journal\.ready\.then/);
  assert.match(src, /recoveryStatus\(\)/);
  assert.match(src, /Recovered \$\{r\.restored\} verified world action/);
  assert.match(src, /navigator\.setStatus/);
});
test('Dark Void runtime exposes recovery diagnostics for live observability', async () => {
  const src = await fs.readFile(new URL('../apps/dark-void-scene/client.js', import.meta.url), 'utf8');
  assert.match(src, /recovery:journey\.journal\.recoveryStatus\(\)/);
  assert.match(src, /corrupt snapshot ignored/);
});
