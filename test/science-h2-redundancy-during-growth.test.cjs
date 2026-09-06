#!/usr/bin/env node
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path');
test('RUN_071 reuses production/prior science and fixed holdout',()=>{const s=fs.readFileSync(path.join(__dirname,'../scripts/science-h2-redundancy-during-growth.cjs'),'utf8');assert.match(s,/lib\/game-rules/);assert.match(s,/science-h2-temporal-organized-build-growth/);assert.match(s,/science-h2-organized-growth-damage-robustness/);assert.match(s,/71071,71129,71237,71339,71453,71569/)});
test('RUN_071 contains no post-damage repair dependency',()=>{const s=fs.readFileSync(path.join(__dirname,'../scripts/science-h2-redundancy-during-growth.cjs'),'utf8');assert.doesNotMatch(s,/local-repair-rule-selection/);assert.doesNotMatch(s,/delayed-local-reward/)});
