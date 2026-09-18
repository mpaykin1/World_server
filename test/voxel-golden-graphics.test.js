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
});test('voxel material V2 adds block-aware procedural detail without extra draw calls',()=>{
  assert.match(src,/goldenVoxelMaterialV2=true/);
  assert.match(src,/attribute float goldenMaterial/);
  assert.match(src,/gvmacro=goldenVoxelHash/);
  assert.match(src,/metalnessFactor=max\(metalnessFactor,.42\)/);
  assert.match(src,/setAttribute\('goldenMaterial'/);
});

test('chunk streaming can contract under graphics pressure',()=>{
  assert.match(src,/function goldenViewRadius\(\)/);
  assert.match(src,/getBudget\?\.\('viewChunks'\)/);
  assert.match(src,/pressure\|\|0\)>1\.05/);
  assert.match(src,/viewRadius=goldenViewRadius\(\)/);
});


test('vegetation V2 uses crossed blades and vertex-only wind in one instanced draw',()=>{
  assert.match(src,/goldenVegetationGeometry=new THREE\.BufferGeometry\(\)/);
  assert.match(src,/goldenVegetationV2=true/);
  assert.match(src,/goldenVegetationTime/);
  assert.match(src,/instanceMatrix\[3\]\.x/);
  assert.match(src,/side:THREE\.DoubleSide,vertexColors:true/);
});

test('chunk streaming yields between rebuild slices to avoid long main-thread stalls',()=>{
  assert.match(src,/function yieldChunkBuild\(\)/);
  assert.match(src,/requestIdleCallback/);
  assert.match(src,/async function materializeChunkBatch/);
  assert.match(src,/await yieldChunkBuild\(\)/);
  assert.match(src,/await materializeChunkBatch\(need/);
});

test('voxel material atlas V2 supplies one shared texture and per-face UV tiles',()=>{
  assert.match(src,/VOXEL_ATLAS_COLS=4/);
  assert.match(src,/createVoxelMaterialAtlas\(\)/);
  assert.match(src,/goldenVoxelAtlasV2=true/);
  assert.match(src,/map:voxelMaterialAtlas/);
  assert.match(src,/arr\.uv\.push/);
  assert.match(src,/g\.setAttribute\('uv'/);
});
test('runtime LOD policy cuts distant shadow work and adapts vegetation/water',()=>{
  assert.match(src,/function updateGoldenLodPolicy\(/);
  assert.match(src,/shadowRadius=quality>\.78\?1:0/);
  assert.match(src,/goldenVegetationPopulation/);
  assert.match(src,/goldenWaterStrength\.value=/);
});

test('startup streaming ramps detail without blocking first playable seconds',()=>{
  assert.match(src,/goldenStreamingStartedAt=performance\.now\(\)/);
  assert.match(src,/age<12000\?1:\(age<30000\?2:VIEW\)/);
  assert.match(src,/need\.length>=2/);
  assert.ok(/while\(top>0&&c\.get\(lx,top,lz\)===BLOCK\.AIR\)top--/.test(src) || /const top=c\.columnTop\[lz\*CHUNK\+lx\]/.test(src), 'meshing must bound each column by its highest non-air voxel');`r`n  if(/columnTop/.test(src)){`r`n    assert.match(src,/columnTop=new Uint8Array\(CHUNK\*CHUNK\)/);`r`n    assert.match(src,/if\(b!==BLOCK\.AIR\).*if\(y>this\.columnTop\[ci\]\)this\.columnTop\[ci\]=y/);`r`n    assert.match(src,/else if\(prev!==BLOCK\.AIR&&y===this\.columnTop\[ci\]\).*while\(top>0&&this\.blocks\[this\.idx\(lx,top,lz\)\]===BLOCK\.AIR\)top--/);`r`n  }
});