import test from 'node:test';
import assert from 'node:assert/strict';
import {buildVolcanicRtsLayout}
 from '../apps/ai3d-voxel-city/cinematic-rts-volcanic.mjs';
import {buildLavaChannelGeometry,buildAshSubstrate}
 from '../apps/ai3d-voxel-city/cinematic-rts-rivers.mjs';

test('lava occupies true river tiles, not a full square behind the RTS map',()=>{
 const layout=buildVolcanicRtsLayout({tier:'balanced'});
 const model=buildLavaChannelGeometry(layout);
 assert.equal(model.stats.lavaPatches,layout.lava.length);
 assert.equal(model.stats.triangles,layout.lava.length*2);
 assert.equal(model.stats.drawBatches,1);
 assert.equal(model.indices.length,layout.lava.length*6);
 assert.ok(model.stats.lavaPatches<layout.tiles.length);
 assert.ok(model.positions.length/3<10000);
 assert.throws(()=>buildLavaChannelGeometry({}),/missing molten/);
});
test('all independent river patches share world-space UVs at bank joins',()=>{
 const model=buildLavaChannelGeometry(buildVolcanicRtsLayout({tier:'low'}));
 const seen=new Map(),pos=model.positions,uv=model.uv;
 for(let i=0;i<pos.length/3;i++){
  const x=pos[i*3],y=pos[i*3+1],z=pos[i*3+2],u=uv[i*2],v=uv[i*2+1];
  const key=Math.round(x*1e4)+':'+Math.round(z*1e4);
  assert.ok(Math.abs(y+5.9)<1e-5); // Float32 world-coordinate precision
  if(seen.has(key)){
   const prev=seen.get(key);
   assert.ok(Math.abs(u-prev[0])<1e-6,'lava U seam');
   assert.ok(Math.abs(v-prev[1])<1e-6,'lava V seam');
  }
  seen.set(key,[u,v]);
 }
 assert.ok(seen.size>50);
});
test('outside terrain is dark geometric ash below all navigable terrain',()=>{
 const ash=buildAshSubstrate(520,36,1949);
 assert.equal(ash.stats.triangles,36*36*2);
 assert.equal(ash.stats.drawBatches,1);
 assert.equal(ash.positions.length,(37*37)*3);
 assert.equal(ash.colors.length,ash.positions.length);
 assert.ok(ash.stats.maxHeight< -5.9);
 for(let i=1;i<ash.positions.length;i+=3){
  assert.ok(ash.positions[i]<-6.8);
  assert.ok(Number.isFinite(ash.positions[i]));
 }
 assert.deepEqual(ash,buildAshSubstrate(520,36,1949));
 assert.throws(()=>buildAshSubstrate(900,70),/budget/);
});
test('mobile ash terrain reduces vertices and keeps real lava bank silhouettes',()=>{
 const lo=buildAshSubstrate(520,22,12);
 const hi=buildAshSubstrate(520,48,12);
 assert.ok(lo.positions.length<hi.positions.length/3);
 assert.ok(lo.stats.triangles<hi.stats.triangles/3);
 const map=buildVolcanicRtsLayout({tier:'low'});
 assert.ok(buildLavaChannelGeometry(map).stats.lavaPatches>20);
});
