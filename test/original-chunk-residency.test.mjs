import test from 'node:test';import assert from 'node:assert/strict';
import {planOriginalChunkResidency,assessOriginalChunkReadiness} from '../shared/original-chunk-residency.mjs';
test('unloads only idle chunks beyond render radius and margin',()=>{
 const chunks=[{cx:10,cz:0,busy:0},{cx:11,cz:0,busy:1},{cx:3,cz:3,busy:0},{cx:-12,cz:0,busy:0}];
 const remove=planOriginalChunkResidency({chunks,center:[0,0],radius:5,margin:5});
 assert.deepEqual(remove.map(c=>c.cx),[-12]);
});
test('four-stage progress counts missing and partial chunks',()=>{
 const chunks=new Map([['0,0',{terrain:true,final:true,lit:false,rendered:false}]]);
 const r=assessOriginalChunkReadiness({chunks,center:[0,0],radius:1});
 assert.equal(r.ready,false);assert.equal(r.complete,2);assert.equal(r.total,36);assert.equal(r.progress,2/36);
});
test('fully lit and rendered neighborhood reports ready',()=>{
 const chunks=new Map();for(let z=-1;z<=1;z++)for(let x=-1;x<=1;x++)chunks.set(`${x},${z}`,{terrain:true,final:true,lit:true,rendered:true});
 assert.deepEqual(assessOriginalChunkReadiness({chunks,center:[0,0],radius:1}),{ready:true,progress:1,complete:36,total:36});
});
