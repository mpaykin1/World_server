'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {run,repair}=require('../scripts/science-h2-local-self-repair-after-damage.cjs');
const {grow}=require('../scripts/science-h2-temporal-organized-build-growth.cjs');
const {damage,lcc}=require('../scripts/science-h2-organized-growth-damage-robustness.cjs');
test('RUN_067 repair is deterministic and budget bounded',()=>{const s=grow(67067,256).at(-1),d=damage(s.foundations,.2,1),a=repair(d,51,7),b=repair(d,51,7);assert.ok(a.added<=51);assert.equal(a.added,b.added);assert.deepEqual(a.foundations.map(x=>[x.position.x,x.position.z]),b.foundations.map(x=>[x.position.x,x.position.z]))});
test('RUN_067 repair never reduces LCC',()=>{const s=grow(99991,256).at(-1),d=damage(s.foundations,.2,2),r=repair(d,51,8);assert.ok(lcc(r.foundations)>=lcc(d))});
test('RUN_067 preregistered local self-repair is preserved as a refutation',()=>{const r=run();assert.equal(r.pass,false);assert.equal(r.successes.recovered,0);assert.equal(r.rows.length,6)});
test('RUN_067 harness has no UTF-8 BOM',()=>{const b=fs.readFileSync(require.resolve('../scripts/science-h2-local-self-repair-after-damage.cjs'));assert.notDeepEqual([...b.subarray(0,3)],[0xef,0xbb,0xbf])});
