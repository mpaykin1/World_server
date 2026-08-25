'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const score=(bytes,touched)=>1500-(bytes/1024)*2-(touched.length+touched.filter(f=>f.startsWith('shared/')).length*4)*5;
test('smaller patch ranks higher',()=>assert.ok(score(2000,['apps/a.js'])>score(10000,['apps/a.js'])));
test('shared blast radius is penalized',()=>assert.ok(score(2000,['apps/a.js'])>score(2000,['shared/x.js'])));
