'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const src=fs.readFileSync('scripts/browser-local-worker.cjs','utf8');
test('benchmark.run has safe executor',()=>assert.match(src,/'benchmark\.run':\s*execTestRun/));
test('heartbeat advertises only implemented executors',()=>assert.match(src,/filter\(cap => Object\.prototype\.hasOwnProperty\.call\(EXECUTORS, cap\)\)/));
test('allowedPaths escape is fail-closed',()=>{assert.match(src,/agent changed files outside allowedPaths/);assert.match(src,/if \(blockers\.length\) throw new Error\(blockers\.join\('; '\)\)/);});
test('benchmark still uses command allowlist',()=>assert.match(src,/const allowedPrefix = \['node --test','npm run','node scripts\/'\]/));
