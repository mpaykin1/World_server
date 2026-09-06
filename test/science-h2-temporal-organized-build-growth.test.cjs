'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {run,grow,randomControl}=require('../scripts/science-h2-temporal-organized-build-growth.cjs');

test('RUN_062 uses production-valid supported construction',()=>{
  const snapshots=grow(62062,64),last=snapshots.at(-1);
  assert.ok(last.buildings.length>last.foundations.length);
  for(const b of last.buildings) if(['wall','doorway','door'].includes(b.piece)) assert.ok(b.supportId);
});

test('RUN_062 control preserves count box density and piece composition',()=>{
  const s=grow(104729,32).at(-1),c=randomControl(s,123);
  assert.equal(c.n,s.n);assert.deepEqual(c.bounds,s.bounds);assert.equal(c.cells,s.cells);assert.equal(c.density,s.density);assert.deepEqual(c.pieceCounts,s.pieceCounts);
});

test('RUN_062 temporal organized-growth preregistration passes',()=>{
  const r=run();assert.equal(r.pass,true,JSON.stringify({successes:r.successes,bySeed:r.bySeed},null,2));
});

test('RUN_062 structured final state is connected for every seed',()=>{
  const r=run();for(const x of r.bySeed) assert.ok(x.finalLcc>=.98);
});

test('RUN_062 matched random control is separated on multiple organization metrics',()=>{
  const r=run();assert.ok(r.successes.controlSeparated>=5);assert.ok(r.successes.miSeparated>=5);assert.ok(r.successes.scoreSeparated>=5);
});

const fs=require('node:fs');
test('science harness stays UTF-8 without BOM so Node can parse shebang',()=>{const b=fs.readFileSync(require.resolve('../scripts/science-h2-temporal-organized-build-growth.cjs'));assert.notDeepEqual([...b.subarray(0,3)],[0xef,0xbb,0xbf]);});
