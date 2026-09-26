import test from 'node:test';
import assert from 'node:assert/strict';
import {createChunkUploadQueue} from '../shared/chunk-upload-budget.mjs';

test('visible uploads first within a strict per-frame cost budget', () => {
  const q = createChunkUploadQueue();
  const order = [];
  q.enqueue({id:'hidden',revision:1,costMs:2,upload:()=>order.push('hidden')});
  q.enqueue({id:'visible',revision:1,costMs:2,upload:()=>order.push('visible')});
  assert.deepEqual(q.drain({budgetMs:2,isVisible:id=>id==='visible'}),
    {spentMs:2,uploaded:1,stale:0,remaining:1});
  assert.deepEqual(order,['visible']);
  q.drain({budgetMs:2});
  assert.deepEqual(order,['visible','hidden']);
});

test('newer revisions replace pending geometry and stale revisions never upload', () => {
  const q = createChunkUploadQueue();
  const order = [];
  q.enqueue({id:'a',revision:1,costMs:1,upload:()=>order.push(1)});
  assert.equal(q.enqueue({id:'a',revision:1,costMs:1,upload:()=>order.push(1)}),false);
  assert.equal(q.enqueue({id:'a',revision:2,costMs:1,upload:()=>order.push(2)}),true);
  q.enqueue({id:'b',revision:1,costMs:1,upload:()=>order.push('b')});
  assert.deepEqual(q.drain({budgetMs:2,isCurrent:id=>id!=='b'}),
    {spentMs:1,uploaded:1,stale:1,remaining:0});
  assert.deepEqual(order,[2]);
});

test('capacity, invalidation, validation and failed uploads', () => {
  const q = createChunkUploadQueue({maxPending:1});
  assert.throws(()=>q.enqueue({id:'x',revision:1,costMs:0,upload(){}}),TypeError);
  q.enqueue({id:'x',revision:1,costMs:1,upload(){throw Error('GPU busy')}});
  assert.equal(q.enqueue({id:'y',revision:1,costMs:1,upload(){}}),false);
  assert.throws(()=>q.drain({budgetMs:1}),/GPU busy/);
  assert.equal(q.size,1);
  assert.equal(q.invalidate('x',0),false);
  assert.equal(q.invalidate('x',1),true);
  assert.equal(q.size,0);
});
