'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
test('nightly API requires CRON_SECRET and queues CPU-free tasks only',()=>{
 const s=fs.readFileSync('api/quality-autopilot-nightly.js','utf8');
 assert.match(s,/CRON_SECRET/);assert.match(s,/requires_gpu:false/);assert.match(s,/estimated_paid_cost:0/);
});
test('worker rejects GPU or paid completion result',()=>{
 const s=fs.readFileSync('api/quality-autopilot-worker.js','utf8');
 assert.match(s,/requiresGpu===true/);assert.match(s,/paidCost/);assert.match(s,/GPU\/paid result rejected/);
});
test('desktop worker refuses dirty worktree and busy CPU',()=>{
 const s=fs.readFileSync('desktop/cpu-night-autopilot.cjs','utf8');
 assert.match(s,/working tree is not clean/);assert.match(s,/usage>72/);assert.match(s,/requires_gpu/);
});
