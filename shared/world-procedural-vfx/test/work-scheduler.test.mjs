import test from 'node:test';import assert from 'node:assert/strict';import {VfxWorkScheduler} from '../runtime/work-scheduler.mjs';
test('scheduler has idle/local fallback without a new worker',async()=>{const s=new VfxWorkScheduler({idle:null,timeout:(fn)=>fn()});assert.equal(await s.runLocal(()=>42),42);assert.equal(await s.runWorker('x',{}, {fallback:()=>7}),7);s.dispose();});
