import test from 'node:test';
import assert from 'node:assert/strict';
import {buildVolcanicRtsLayout} from '../apps/ai3d-voxel-city/cinematic-rts-volcanic.mjs';
import {sculptBasaltGeometry}
 from '../apps/ai3d-voxel-city/cinematic-rts-terrain.mjs';
test('CPU basalt creates continuous terrain with real cliff geometry',()=>{
 const layout=buildVolcanicRtsLayout({tier:'balanced'});
 const mesh=sculptBasaltGeometry(layout,'balanced',20260925);
 const s=mesh.stats;
 assert.ok(s.sculptedTiles>150);
 assert.ok(s.cliffSegments>40);
 assert.ok(s.triangles>3000&&s.triangles<25000);
 assert.equal(s.vertices,mesh.positions.length/3);
 assert.equal(mesh.normals.length,mesh.positions.length);
 assert.equal(mesh.colors.length,mesh.positions.length);
 assert.equal(mesh.uv.length,s.vertices*2);
 assert.equal(mesh.indices.length,s.triangles*3);
 assert.equal(s.separateDrawCalls,1);
 let min=1e6,max=-1e6;
 for(let i=1;i<mesh.positions.length;i+=3){
  const y=mesh.positions[i];min=Math.min(min,y);max=Math.max(max,y);
 }
 assert.ok(min< -5);
 assert.ok(max> -2);
});
test('basalt preserves global seam-consistent height in neighbouring patches',()=>{
 const map=buildVolcanicRtsLayout({tier:'balanced'});
 const mesh=sculptBasaltGeometry(map,'balanced',20260925);
 const vertices=new Map();
 for(let i=0;i<mesh.positions.length;i+=3){
  const x=mesh.positions[i],y=mesh.positions[i+1],z=mesh.positions[i+2];
  if(y< -2.7||mesh.normals[i+1]<.3)continue; // omit the displaced vertical cliff skirt
  const k=Math.round(x*1e4)+':'+Math.round(z*1e4);
  const previous=vertices.get(k);
  if(previous!==undefined)assert.ok(Math.abs(y-previous)<.02,'visible geometric seam '+k);
  vertices.set(k,y);
 }
 assert.ok(vertices.size>1500);
});
test('mobile lower subdivisions cut triangles without deleting basalt geography',()=>{
 const layout=buildVolcanicRtsLayout({tier:'balanced'});
 const mobile=sculptBasaltGeometry(layout,'low',20260925);
 const desktop=sculptBasaltGeometry(layout,'high',20260925);
 assert.equal(mobile.stats.sculptedTiles,desktop.stats.sculptedTiles);
 assert.ok(desktop.stats.triangles>mobile.stats.triangles*1.75);
 assert.deepEqual(sculpt(),sculptBasaltGeometry(layout,'low',20260925));
 function sculpt(){return sculptBasaltGeometry(layout,'low',20260925);}
});
test('invalid terrain source fails closed',()=>{
 assert.throws(()=>sculptBasaltGeometry(null),/missing terrain/);
 assert.throws(()=>sculptBasaltGeometry({tiles:[],lava:[]}),/missing terrain/);
});
