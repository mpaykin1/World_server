#!/usr/bin/env node
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');

test('RUN_072 reuses RUN_071, RUN_062 and RUN_066 infrastructure',()=>{
  const s=fs.readFileSync(path.join(__dirname,'../scripts/science-h2-repeated-damage-regrowth.cjs'),'utf8');
  assert.match(s,/science-h2-redundancy-during-growth/);
  assert.match(s,/science-h2-temporal-organized-build-growth/);
  assert.match(s,/science-h2-organized-growth-damage-robustness/);
  assert.match(s,/continueGrow/);
  assert.match(s,/continueGrowRedundant/);
  assert.doesNotMatch(s,/n\*4-Math\.hypot/);
  assert.doesNotMatch(s,/rad\*1\.7-nc\*\.55/);
});

test('RUN_072 preregistration is fixed before production execution',()=>{
  const s=fs.readFileSync(path.join(__dirname,'../scripts/science-h2-repeated-damage-regrowth.cjs'),'utf8');
  assert.match(s,/HOLD=\[72077,72101,72139,72221,72307,72467\]/);
  assert.match(s,/CYCLES=4/);
  assert.match(s,/DAMAGE=\.20/);
  assert.match(s,/REGROW=64/);
});

test('RUN_072 has no repair-system dependency',()=>{
  const s=fs.readFileSync(path.join(__dirname,'../scripts/science-h2-repeated-damage-regrowth.cjs'),'utf8');
  assert.doesNotMatch(s,/local-repair-rule-selection/);
  assert.doesNotMatch(s,/delayed-local-reward/);
});

test('scientific refutation is valid output, not CI failure',()=>{
  const s=fs.readFileSync(path.join(__dirname,'../scripts/science-h2-repeated-damage-regrowth.cjs'),'utf8');
  assert.match(s,/process\.exitCode=0/);
  assert.match(s,/process\.exitCode=1/);
  assert.doesNotMatch(s,/r\.pass\?0:2/);
});
