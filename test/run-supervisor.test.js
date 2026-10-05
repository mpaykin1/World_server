[Reading 7 lines from start (total: 7 lines, 0 remaining)]

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {supervise,parseCli}=require('../scripts/run-supervisor.cjs');
test('parse command after separator',()=>{const o=parseCli(['--run-id','x','--timeout-ms','500','--','node','demo.js']);assert.equal(o.runId,'x');assert.equal(o.command,'node');assert.deepEqual(o.args,['demo.js'])});
test('bounded successful process passes',async()=>{const r=await supervise(process.execPath,['-e','console.log("heartbeat")'],{runId:'test-pass',timeoutMs:2000,stallMs:1000,heartbeatPattern:'heartbeat'});assert.equal(r.state,'PASS');assert.equal(r.exitCode,0)});
test('silent owned child becomes STALLED',async()=>{const t=Date.now();const r=await supervise(process.execPath,['-e','setInterval(()=>{},1000)'],{runId:'test-stall',timeoutMs:3000,stallMs:350,heartbeatPattern:'heartbeat'});assert.equal(r.state,'STALLED');assert.ok(Date.now()-t<2500);assert.ok(r.checkpointPath)});
test('hard timeout wins despite heartbeats',async()=>{const r=await supervise(process.execPath,['-e','setInterval(()=>console.log("tick"),50)'],{runId:'test-timeout',timeoutMs:500,stallMs:300,heartbeatPattern:'tick'});assert.equal(r.state,'TIMEOUT')});

[executed on device: WIN-GJVRHRQPB5A (6cbaf64e-47f4-428e-98d3-70d3c05abcef)]