import test from 'node:test';
import assert from 'node:assert/strict';
import {originalDirtySections,originalDirtyQueue} from '../shared/original-dirty-section-invalidation.mjs';
test('interior edit invalidates only own section',()=>{
 assert.deepEqual(originalDirtySections({x:4,y:5,z:4,minY:0,maxY:64}),[{cx:0,sy:0,cz:0}]);
});
test('negative chunk corner and vertical seam invalidate all adjacent sections',()=>{
 const a=originalDirtySections({x:-16,y:16,z:-16,minY:0,maxY:64});
 assert.equal(a.length,8);
 assert.ok(a.some(s=>s.cx===-2&&s.cz===-2&&s.sy===0));
 assert.ok(a.some(s=>s.cx===-1&&s.cz===-1&&s.sy===1));
});
test('dirty queue deduplicates and prioritizes nearest sections',()=>{
 const q=originalDirtyQueue();q.mark({cx:10,sy:0,cz:0});q.mark({cx:0,sy:0,cz:0});q.mark({cx:0,sy:0,cz:0});
 assert.equal(q.size,2);assert.deepEqual(q.drain({limit:1})[0],{cx:0,sy:0,cz:0});
 assert.equal(q.size,1);
});
