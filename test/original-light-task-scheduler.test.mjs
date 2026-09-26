import test from 'node:test';import assert from 'node:assert/strict';
import {createOriginalLightTaskScheduler} from '../shared/original-light-task-scheduler.mjs';
test('one chunk task runs after 32 edits without starving further edits',()=>{
 const q=createOriginalLightTaskScheduler();for(let i=0;i<70;i++)q.enqueueEdit({x:i,y:0,z:0,newValue:1});q.enqueueChunk({cx:0,cz:0});
 const kinds=[];for(let i=0;i<34;i++)kinds.push(q.next().kind);
 assert.equal(kinds.slice(0,32).every(x=>x==='edit'),true);assert.equal(kinds[32],'chunk');assert.equal(kinds[33],'edit');
});
test('repeated pending edit coalesces latest value without changing order',()=>{
 const q=createOriginalLightTaskScheduler({maxEditStreak:2});q.enqueueEdit({x:1,y:2,z:3,newValue:1});q.enqueueEdit({x:4,y:2,z:3,newValue:5});
 assert.equal(q.enqueueEdit({x:1,y:2,z:3,newValue:9}),'coalesced');
 assert.deepEqual(q.pending(),{edits:2,chunks:0,streak:0});assert.equal(q.next().task.newValue,9);
});
test('bounded capacity and empty queue are handled',()=>{
 const q=createOriginalLightTaskScheduler({maxPending:1});assert.equal(q.enqueueChunk({cx:0,cz:0}),'queued');
 assert.equal(q.enqueueEdit({x:0,y:0,z:0}),'full');assert.equal(q.next().kind,'chunk');assert.equal(q.next(),null);
});
