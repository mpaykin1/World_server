import test from 'node:test';
import assert from 'node:assert/strict';
import { reconstructVoxelModel, reconstructWorldFromTwoViews, editVoxelModel } from '../shared/pixel3d/multiview-voxel.mjs';

function image(width,height,draw){
  const data=new Uint8ClampedArray(width*height*4);
  const set=(x,y,r=200,g=100,b=50,a=255)=>{const i=(y*width+x)*4;data[i]=r;data[i+1]=g;data[i+2]=b;data[i+3]=a;};
  draw(set);
  return {width,height,data};
}

test('front + right reconstructs the maximal orthographic visual hull',()=>{
  const front=image(6,6,set=>{for(let y=1;y<=4;y++)for(let x=1;x<=4;x++)set(x,y,220,60,40);});
  const right=image(6,6,set=>{for(let y=1;y<=4;y++)for(let z=2;z<=3;z++)set(z,y,40,120,220);});
  const model=reconstructVoxelModel([{...front,side:'front'},{...right,side:'right'}],{maxAxis:6});
  assert.deepEqual(model.dimensions,{width:6,height:6,depth:6});
  assert.equal(model.voxels.length,4*4*2);
  assert.equal(model.validation.perView.front.iou,1);
  assert.equal(model.validation.perView.right.iou,1);
  assert.equal(model.inference.incompatibleRows.length,0);
});

test('contradictory silhouette rows are reported instead of silently invented',()=>{
  const front=image(4,4,set=>{for(let x=0;x<4;x++)set(x,1);});
  const right=image(4,4,()=>{});
  const model=reconstructVoxelModel([{...front,side:'front'},{...right,side:'right'}],{maxAxis:4});
  assert.equal(model.voxels.length,0);
  assert.ok(model.inference.incompatibleRows.length>=1);
  assert.equal(model.validation.perView.front.recall,0);
});

test('World Server scene output stays compatible with palette-index voxel tuples',()=>{
  const front=image(3,3,set=>set(1,1,255,0,0));
  const right=image(3,3,set=>set(1,1,0,0,255));
  const {model,scene}=reconstructWorldFromTwoViews(front,right,{maxAxis:3});
  assert.equal(model.voxels.length,1);
  assert.equal(scene.voxels[0].length,4);
  assert.equal(scene.performance.browserMeshing,'chunked_greedy_surface');
  assert.equal(scene.editor.editable,true);
});

test('edits are non-destructive and use the same integer voxel coordinates',()=>{
  const front=image(2,2,set=>set(0,0));
  const right=image(2,2,set=>set(0,0));
  const model=reconstructVoxelModel([{...front,side:'front'},{...right,side:'right'}],{maxAxis:2});
  const edited=editVoxelModel(model,[{type:'paint',x:0,y:1,z:0,color:'#00ff00'},{type:'add',x:1,y:1,z:1,color:'#ffffff'}]);
  assert.equal(model.voxels.length,1);
  assert.equal(edited.voxels.length,2);
  assert.ok(edited.palette.includes(0x00ff00));
});
