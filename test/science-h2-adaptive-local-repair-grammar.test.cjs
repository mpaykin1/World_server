'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {adaptiveRepair,localReward}=require('../scripts/science-h2-adaptive-local-repair-grammar.cjs');
const {grow}=require('../scripts/science-h2-temporal-organized-build-growth.cjs');
const {damage}=require('../scripts/science-h2-organized-growth-damage-robustness.cjs');
const RESULT=JSON.parse(fs.readFileSync(path.join(__dirname,'..','SCIENCE_RUN_069_H2.json'),'utf8'));

test('RUN_069 training and holdout are disjoint',()=>{for(const s of RESULT.preregistration.trainingSeeds)assert.equal(RESULT.preregistration.holdoutSeeds.includes(s),false)});
test('RUN_069 adaptive repair is deterministic and budget bounded on a small regression sample',()=>{const s=grow(69191,32).at(-1),d=damage(s.foundations,.2,77),a=adaptiveRepair(d,8,91),b=adaptiveRepair(d,8,91);assert.ok(a.added<=8);assert.deepEqual(a.trace,b.trace)});
test('RUN_069 recorded holdout uses multiple rules',()=>{for(const r of RESULT.rows)assert.ok(Object.values(r.ruleUse).filter(n=>n>0).length>=2)});
test('RUN_069 local reward is finite and nonnegative',()=>{const occ=new Set(['0,0','8,0']),v=localReward(occ,{position:{x:4,z:0}});assert.ok(Number.isFinite(v));assert.ok(v>=0)});
test('RUN_069 preserves preregistered negative scientific outcome',()=>{assert.equal(RESULT.rows.length,6);assert.equal(RESULT.pass,false);assert.equal(RESULT.summary.recovered,4);assert.equal(RESULT.summary.beatsFixed,1);assert.match(RESULT.preregistration.refute,/preserve result/i)});
test('RUN_069 harness has no UTF-8 BOM',()=>{const b=fs.readFileSync(require.resolve('../scripts/science-h2-adaptive-local-repair-grammar.cjs'));assert.notDeepEqual([...b.subarray(0,3)],[0xef,0xbb,0xbf])});
