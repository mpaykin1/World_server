import test from 'node:test';import assert from 'node:assert/strict';
import {planOriginalChunkStages,acceptOriginalChunkResult} from '../shared/original-chunk-stage-planner.mjs';
test('missing chunks are planned nearest-first within bounded budget',()=>{
 const jobs=planOriginalChunkStages({radius:0,maxJobs:2});
 assert.equal(jobs.length,2);assert.deepEqual([jobs[0].x,jobs[0].z],[0,0]);assert.equal(jobs[0].action,'terrain');
});
test('neighbor gates prevent premature decoration and allow it when terrain ready',()=>{
 const chunks=new Map([['0,0',{stage:1,revision:4}]]);
 let jobs=planOriginalChunkStages({radius:0,chunks,maxJobs:25});
 assert.ok(!jobs.some(j=>j.x===0&&j.z===0&&j.action==='decorate'));
 for(let z=-1;z<=1;z++)for(let x=-1;x<=1;x++)chunks.set(x+','+z,{stage:1,revision:4});
 jobs=planOriginalChunkStages({radius:0,chunks,maxJobs:25});
 assert.ok(jobs.some(j=>j.x===0&&j.z===0&&j.action==='decorate'));
});
test('stale revisions and mismatched stages are rejected',()=>{
 assert.equal(acceptOriginalChunkResult({stage:2,revision:7},{expectedStage:2,revision:7}),true);
 assert.equal(acceptOriginalChunkResult({stage:2,revision:8},{expectedStage:2,revision:7}),false);
 assert.equal(acceptOriginalChunkResult({stage:3,revision:7},{expectedStage:2,revision:7}),false);
});
