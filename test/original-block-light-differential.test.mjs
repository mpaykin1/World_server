import test from 'node:test';import assert from 'node:assert/strict';
import {buildOriginalVoxelLight} from '../shared/original-voxel-flood-light.mjs';
import {removeOriginalBlockLight} from '../shared/original-block-light-removal.mjs';
test('deterministic differential: 160 random 3D emitter removals and opacity increases',()=>{
 let seed=0xC0FFEE;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
 for(let run=0;run<160;run++){
  const size=[4,3,4],n=48,opacity=new Uint8Array(n),emission=new Uint8Array(n);
  for(let i=0;i<n;i++){opacity[i]=random()<0.15?15:0;emission[i]=random()<0.12?1+Math.floor(random()*15):0;}
  const block=buildOriginalVoxelLight({size,opacity,emission,sky:false}).block;
  const x=Math.floor(random()*4),y=Math.floor(random()*3),z=Math.floor(random()*4),i=x+4*(z+4*y);
  const newOpacity=random()<0.5?15:opacity[i],newEmission=random()<0.5?0:emission[i];
  const actual=removeOriginalBlockLight({size,opacity,emission,block},{x,y,z,newOpacity,newEmission});
  const expected=buildOriginalVoxelLight({size,opacity:actual.state.opacity,emission:actual.state.emission,sky:false}).block;
  assert.deepEqual(actual.state.block,expected,`differential case ${run}`);
 }
});
