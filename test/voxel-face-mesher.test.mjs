import test from 'node:test';
import assert from 'node:assert/strict';
import {vertexOcclusion,faceOcclusion,greedyFaceRectangles,packFaceOcclusion} from '../shared/voxel-face-mesher.mjs';

test('corner occlusion handles clear, diagonal and two-side blocking',()=>{
 assert.equal(vertexOcclusion(false,false,false),3);
 assert.equal(vertexOcclusion(false,false,true),2);
 assert.equal(vertexOcclusion(true,false,false),2);
 assert.equal(vertexOcclusion(true,true,false),0);
 assert.equal(vertexOcclusion(true,true,true),0);
 assert.throws(()=>vertexOcclusion(1,false,false),TypeError);
});
test('four face corners are deterministic with integer neighborhood',()=>{
 const solid=new Set(['-1,0,0','0,-1,0','-1,-1,0']);
 const sample=(x,y,z)=>solid.has([x,y,z].join(','));
 assert.deepEqual(faceOcclusion(sample,[0,0,0],[1,0,0],[0,1,0]),[0,2,3,2]);
 assert.equal(packFaceOcclusion([0,2,3,2]),184);
 assert.throws(()=>packFaceOcclusion([0,1,4,2]),RangeError);
});
test('greedy merging respects materials and corner lighting',()=>{
 const a={material:'basalt',ao:255},b={material:'basalt',ao:0};
 const rects=greedyFaceRectangles([[a,a,b],[a,a,null]]);
 assert.deepEqual(rects.map(({x,y,width,height})=>[x,y,width,height]),[[0,0,2,2],[2,0,1,1]]);
 assert.equal(greedyFaceRectangles([[],[]]).length,0);
 assert.throws(()=>greedyFaceRectangles([[a],[a,a]]),RangeError);
});
