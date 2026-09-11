'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','apps','voxel-world','client.js'),'utf8');

test('voxel world has baked vertex AO in chunk meshing',()=>{
  assert.match(src,/function faceCornerAO\(/);
  assert.match(src,/vertexShade\?\.\[i\]/);
  assert.match(src,/faceCornerAO\(lx,y,lz,f,localBlock\)/);
});

test('water V2 has shoreline, shallow depth, foam and sky Fresnel',()=>{
  for(const needle of ['goldenShore','waterShoreAt','gwDepthMix','gwFoam','goldenWaterSky','gwFresnel'])assert.match(src,new RegExp(needle));
});

test('near-field voxel vegetation is one capped InstancedMesh',()=>{
  assert.match(src,/new THREE\.InstancedMesh\(goldenVegetationGeometry,goldenVegetationMaterial,GOLDEN_VEGETATION_MAX\)/);
  assert.match(src,/refreshGoldenVegetation\(\)/);
  assert.match(src,/vegetationInstances:goldenVegetationMesh\.count/);
  assert.match(src,/GOLDEN_VEGETATION_MAX=matchMedia\('\(pointer:coarse\)'\)\.matches\?420:1250/);
});