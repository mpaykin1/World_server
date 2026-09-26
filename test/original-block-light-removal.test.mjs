import test from 'node:test';import assert from 'node:assert/strict';
import {buildOriginalVoxelLight} from '../shared/original-voxel-flood-light.mjs';
import {removeOriginalBlockLight} from '../shared/original-block-light-removal.mjs';
const make=(size,emitters,solid=[])=>{const n=size.reduce((a,b)=>a*b,1),opacity=new Uint8Array(n),emission=new Uint8Array(n);for(const i of emitters)emission[i]=15;for(const i of solid)opacity[i]=15;return {size,opacity,emission,block:buildOriginalVoxelLight({size,opacity,emission,sky:false}).block};};
const check=(state,edit)=>{const r=removeOriginalBlockLight(state,edit),expected=buildOriginalVoxelLight({...r.state,sky:false});assert.deepEqual(r.state.block,expected.block);return r;};
test('removes single source without rebuilding',()=>{const r=check(make([5,1,1],[2]),{x:2,y:0,z:0});assert.equal(r.mode,'incremental');assert.deepEqual([...r.state.block],[0,0,0,0,0]);});
test('overlapping emitters preserve surviving illumination',()=>{const r=check(make([7,1,1],[1,5]),{x:1,y:0,z:0});assert.equal(r.mode,'incremental');assert.equal(r.state.block[5],15);});
test('bounded work falls back to exact full rebuild',()=>{const r=removeOriginalBlockLight(make([7,1,1],[3]),{x:3,y:0,z:0},1);assert.equal(r.mode,'rebuild');});
