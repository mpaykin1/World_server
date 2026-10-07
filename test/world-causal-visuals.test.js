'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {planCausalVisuals}=require('../lib/world-causal-visuals');
const e=(id,kind,x=2,revision=1)=>({id,kind,position:{x,y:0,z:-2},revision});
test('deterministic causal event -> actual asset request and dirty chunk',()=>{
 const opts={inventory:['lava-steam','volcanic-ash'],maxSprites:2};
 const input=[e('volcano:1','eruption',2,1),e('wall:1','lava_wall_contact',-2,2)];
 const a=planCausalVisuals(input,opts);
 assert.deepEqual(a,planCausalVisuals(input.slice().reverse(),opts));
 assert.deepEqual(a.requests.map(x=>x.asset),['lava-steam','volcanic-ash']);
 assert.deepEqual(a.dirtyChunks,['-1:-1','0:-1']);
 assert.equal(a.automaticPlacement,false);
});
test('unavailable atlas is reported, never pretended rendered',()=>{
 const a=planCausalVisuals([e('wall:2','lava_wall_contact')],{inventory:[]});
 assert.equal(a.requests.length,0);
 assert.equal(a.missingAssets[0].asset,'lava-steam');
});
test('deduplicates events and rejects malformed/unbounded input',()=>{
 const a=planCausalVisuals([e('a','eruption'),e('a','eruption'),e('bad','unknown'),e('huge','eruption',Infinity)],{inventory:['volcanic-ash'],maxSprites:1});
 assert.equal(a.requests.length,1);
 assert.equal(a.dirtyChunks.length,1);
});
test('budget bounds requests while retaining all dirty chunks',()=>{
 const a=planCausalVisuals([e('a','eruption',0),e('b','eruption',100)],{inventory:['volcanic-ash'],maxSprites:1});
 assert.equal(a.requests.length,1);assert.equal(a.dirtyChunks.length,2);
});
