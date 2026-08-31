import test from 'node:test'; import assert from 'node:assert/strict'; import {AdaptiveVfxQuality} from '../runtime/adaptive-quality.mjs';
test('quality degrades under sustained slow frames',()=>{const q=new AdaptiveVfxQuality({tier:'high',targetFps:60}); for(let i=0;i<100;i++) q.observeFrameMs(40); assert.notEqual(q.tier,'high');});

test('external world-quality ceiling prevents independent over-upgrade',()=>{const q=new AdaptiveVfxQuality({tier:'high',targetFps:60,upFrames:2,cooldownFrames:0});q.setCeiling('medium',{sync:true});for(let i=0;i<20;i++)q.observeFrameMs(5);assert.equal(q.tier,'medium');});
