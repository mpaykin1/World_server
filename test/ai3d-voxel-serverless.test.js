'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const { _private }=require('../lib/api-handlers/ai3d-voxel-generate');

function body(w=48,h=38){
  const rgb=Buffer.alloc(w*h*3);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*3;
    if(y<14){rgb[i]=180;rgb[i+1]=80;rgb[i+2]=110;}
    else{
      const tower=(x>25&&x<31&&y<26);
      rgb[i]=tower?35:70;rgb[i+1]=tower?30:55;rgb[i+2]=tower?35:48;
    }
  }
  return {width:w,height:h,rgbBase64:rgb.toString('base64'),maxDepth:24,maxThickness:5,structureCell:4,depthLayers:8};
}

test('serverless voxel fallback builds non-empty cube world',()=>{
  const world=_private.generateWorld(body());
  assert.equal(world.schema,'ai3d-voxel-city-serverless-v1');
  assert.ok(world.voxels.length>1000);
  assert.equal(world.palette.length,64);
  assert.equal(world.claims.depthIsHeuristic,true);
  assert.equal(world.claims.depthSource,'heuristic_perspective_serverless');
});

test('serverless fallback has walkable foundation and multiple depth layers',()=>{
  const world=_private.generateWorld(body());
  assert.ok(world.stats.foundationVoxels>0);
  assert.ok(world.stats.frontDepthLayersUsed>=2);
});

test('invalid RGB length is rejected',()=>{
  assert.throws(()=>_private.generateWorld({width:48,height:38,rgbBase64:'AAAA'}),/RGB length mismatch/);
});
