import test from 'node:test';
import assert from 'node:assert/strict';
import {buildVolcanicRtsLayout} from '../apps/ai3d-voxel-city/cinematic-rts-volcanic.mjs';
import {bakeRtsMaterial} from '../apps/ai3d-voxel-city/cinematic-rts-materials.mjs';
import {detailBudget,planIndustrialDetails}
  from '../apps/ai3d-voxel-city/cinematic-rts-details.mjs';

test('CPU material maps are deterministic and physically meaningful',()=>{
  const a=bakeRtsMaterial('industrial',64,7);
  const b=bakeRtsMaterial('industrial',64,7);
  assert.equal(a.albedo.length,64*64*4);
  assert.deepEqual(a.albedo,b.albedo);
  assert.deepEqual(a.normal,b.normal);
  assert.deepEqual(a.orm,b.orm);
  const colors=new Set(),metals=new Set();
  for(let i=0;i<a.albedo.length;i+=4){
    colors.add(a.albedo[i]+':'+a.albedo[i+1]);
    metals.add(a.orm[i+2]);
    assert.equal(a.albedo[i+3],255);
    assert.equal(a.normal[i+3],255);
    assert.equal(a.orm[i+3],255);
  }
  assert.ok(colors.size>40);
  assert.ok(metals.size>20);
  assert.ok(a.orm.some((v,i)=>i%4===2&&v>80));
});
test('basalt has non-metallic ORM, rock faults and non-flat tangent normals',()=>{
  const p=bakeRtsMaterial('basalt',64,23);
  const albedos=new Set(),normals=new Set();
  for(let i=0;i<p.albedo.length;i+=4){
    assert.equal(p.orm[i+2],0);
    albedos.add(p.albedo[i]);
    normals.add(p.normal[i]+':'+p.normal[i+1]);
  }
  assert.ok(albedos.size>28);
  assert.ok(normals.size>36);
  assert.throws(()=>bakeRtsMaterial('wood',64),/unbounded/);
  assert.throws(()=>bakeRtsMaterial('basalt',2048),/unbounded/);
});
test('same layout and seed produce identical physical industrial kit',()=>{
  const map=buildVolcanicRtsLayout({tier:'balanced'});
  const a=planIndustrialDetails(map,'balanced',2026);
  const b=planIndustrialDetails(map,'balanced',2026);
  assert.deepEqual(a,b);
  assert.ok(a.stats.facadePanels>=24);
  assert.ok(a.stats.fences>=48);
  assert.ok(a.stats.roofRibs>=16);
  assert.ok(a.stats.roofVents>=8);
  assert.ok(a.stats.conduit>=28);
  assert.ok(a.stats.groundDebris>80);
  assert.ok(a.stats.crystalChips>=80);
  assert.ok(a.stats.hotFissures>4);
  assert.ok(a.stats.rockOutcrops>=50);
  assert.ok(a.stats.ladders>=25);
  assert.ok(a.stats.beacons===4);
  assert.ok(a.stats.tanks>=6);
});
test('material and geometry budgets reduce on actual mobile preset',()=>{
  const low=planIndustrialDetails(buildVolcanicRtsLayout({tier:'low'}),'low');
  const high=planIndustrialDetails(buildVolcanicRtsLayout({tier:'high'}),'high');
  const total=p=>Object.values(p.stats).reduce((a,b)=>a+b,0);
  assert.ok(total(low)<total(high));
  assert.ok(low.stats.crystalChips<high.stats.crystalChips);
  assert.ok(low.stats.groundDebris<=detailBudget('low').debris);
  assert.ok(high.stats.rockOutcrops<=detailBudget('high').rocks);
  assert.ok(Object.values(high.stats).every(v=>v<650));
  assert.throws(()=>planIndustrialDetails({}),/missing layout/);
});
