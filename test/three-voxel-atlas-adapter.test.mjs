import test from 'node:test';
import assert from 'node:assert/strict';
import {createThreeVoxelAtlas} from '../shared/three-voxel-atlas-adapter.mjs';
test('atlas adapter preserves texture metadata and UV bounds',()=>{
 class DataTexture {constructor(data,width,height,format){Object.assign(this,{data,width,height,format});}}
 const T={DataTexture,RGBAFormat:1,SRGBColorSpace:'srgb',NearestFilter:2};
 const {texture,uvFor}=createThreeVoxelAtlas(T,{materials:['basalt','lava'],tileSize:8});
 assert.equal(texture.width,16);assert.equal(texture.colorSpace,'srgb');
 assert.equal(texture.needsUpdate,true);
 assert.deepEqual(uvFor('basalt'),{u0:0.03125,v0:0.0625,u1:0.46875,v1:0.9375});
 assert.throws(()=>uvFor('unknown'),RangeError);
});
