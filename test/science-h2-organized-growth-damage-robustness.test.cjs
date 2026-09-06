'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {run,damage,lcc}=require('../scripts/science-h2-organized-growth-damage-robustness.cjs');
const {grow}=require('../scripts/science-h2-temporal-organized-build-growth.cjs');
test('RUN_066 damage removes exact preregistered fraction deterministically',()=>{const s=grow(66066,256).at(-1),a=damage(s.foundations,.2,123),b=damage(s.foundations,.2,123);assert.equal(a.length,256-Math.floor(256*.2));assert.deepEqual(a.map(x=>x.id),b.map(x=>x.id))});
test('RUN_066 intact structured graph is connected',()=>{assert.ok(lcc(grow(65537,256).at(-1).foundations)>=.98)});
test('RUN_066 preregistered damage robustness is preserved as a refutation',()=>{const r=run();assert.equal(r.pass,false);assert.equal(r.byDamage[0].structuredPass,0)});
test('RUN_066 separation degrades with damage and is preserved as negative evidence',()=>{const x=run().byDamage;assert.equal(x[0].controlSeparated,5);assert.ok(x[1].controlSeparated<5);assert.ok(x[2].controlSeparated<5)});
test('RUN_066 harness has no UTF-8 BOM before shebang',()=>{const b=fs.readFileSync(require.resolve('../scripts/science-h2-organized-growth-damage-robustness.cjs'));assert.notDeepEqual([...b.subarray(0,3)],[0xef,0xbb,0xbf])});
