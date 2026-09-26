import test from 'node:test';import assert from 'node:assert/strict';
import {finishOriginalVoxelQuad} from '../shared/original-voxel-quad-finish.mjs';
test('AO asymmetry selects the less contrasted diagonal',()=>{
 const corners=[{ao:.45,sky:15,block:0},{ao:1,sky:0,block:15},{ao:.45,sky:15,block:0},{ao:1,sky:0,block:15}];
 const r=finishOriginalVoxelQuad(corners);assert.equal(r.flipDiagonal,true);
 assert.deepEqual([...r.indices],[1,2,3,1,3,0]);assert.deepEqual([...r.packedLight.slice(0,4)],[255,0,0,255]);
});
test('equal AO breaks tie using separate corner lighting',()=>{
 const corners=[{ao:1,sky:0,block:0},{ao:1,sky:15,block:0},{ao:1,sky:0,block:0},{ao:1,sky:15,block:0}];
 assert.equal(finishOriginalVoxelQuad(corners).flipDiagonal,true);
 assert.equal(finishOriginalVoxelQuad(corners.map(c=>({...c,sky:0}))).flipDiagonal,false);
});
test('rejects invalid corner light',()=>assert.throws(()=>finishOriginalVoxelQuad(Array(4).fill({ao:1,sky:16,block:0})),RangeError));
