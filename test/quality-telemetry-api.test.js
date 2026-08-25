'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const api=require('../lib/quality/telemetry-api-core');
test('telemetry accepts only allow-listed finite metrics',()=>{const m=api.cleanMetrics({fpsP50:60,evil:'x',memoryMb:'123'});assert.deepEqual(m,{fpsP50:60,memoryMb:123});});
test('telemetry aggregation calculates sessions and metrics',()=>{const r=api.aggregate([{session_id:'a',metrics:{fpsP50:60,errorRate:0}},{session_id:'b',metrics:{fpsP50:30,errorRate:1}}]);assert.equal(r.samples,2);assert.equal(r.sessions,2);assert.equal(r.metrics.fpsP50,45);});
test('same-origin telemetry rejects cross-site origins',()=>{assert.equal(api.sameOrigin({headers:{origin:'https://evil.example',host:'good.example'}}),false);assert.equal(api.sameOrigin({headers:{origin:'https://good.example',host:'good.example'}}),true);});
