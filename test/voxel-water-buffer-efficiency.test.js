'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const client=fs.readFileSync(path.join(__dirname,'..','apps','voxel-world','client.js'),'utf8');
test('water chunk buffers omit unused vertex colors in both builders',()=>{
  const builders=client.split('\n').filter(line=>line.includes('water={pos'));
  assert.ok(builders.length>=2,'sync and incremental builders must both define water buffers');
  for(const line of builders) assert.ok(!line.includes('water={pos:[],col:'),'water material does not consume vertex colors');
  const push=client.split('\n').find(line=>line.includes('function pushFace'));
  assert.ok(/if\(arr\.col\)\{[\s\S]*arr\.col\.push/.test(push),'pushFace must skip dead color writes');
  assert.ok(push.includes('if(isSolid){const faceUv=FACE_UV_PACKED_BY_MATERIAL[materialId]'),'solid faces must resolve atlas UVs inside the solid-only path');
  const geometry=client.split('\n').find(line=>line.includes('function makeGeometry'));
  assert.ok(geometry.includes("if(data.col)g.setAttribute('color'"),'geometry must not upload an absent color attribute');
});
