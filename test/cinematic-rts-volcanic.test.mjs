import test from 'node:test';
import assert from 'node:assert/strict';
import {buildVolcanicRtsLayout,rtsBudget,paintLavaPixels} from '../apps/ai3d-voxel-city/cinematic-rts-volcanic.mjs';

test('RTS geography is deterministic with lava channels and navigable metal center',()=>{
  const a=buildVolcanicRtsLayout({tier:'balanced',seed:1949});
  const b=buildVolcanicRtsLayout({tier:'balanced',seed:1949});
  assert.deepEqual(a,b);
  assert.ok(a.tiles.length>300);
  assert.ok(a.lava.length>65);
  assert.ok(a.tiles.some(t=>t.x===0&&t.z===0&&t.style==='industrial'));
  assert.ok(a.lava.some(t=>t.x<0));
  assert.ok(a.lava.some(t=>t.x>0));
  assert.equal(a.visualOnly,true);
  assert.equal(a.collisionsIntegrated,false);
});
test('resource crystals and units never spawn in molten lava',()=>{
  for(const tier of ['low','balanced','high','ultra']){
    const map=buildVolcanicRtsLayout({tier});
    assert.ok(map.resources.length>=12);
    assert.ok(map.resources.length<=rtsBudget(tier).crystals);
    assert.equal(map.units.length,rtsBudget(tier).units);
    assert.equal(map.structures.length,6);
    assert.ok(map.cliffs.length<=rtsBudget(tier).cliffs);
    assert.ok(map.stripes.length<=rtsBudget(tier).details);
    const lavaAt=(x,z)=>x < -70+Math.sin(z*.052)*10||
      x > 75+Math.sin(z*.041+1.8)*8||
      (z>65&&x<-27&&x>-78);
    for(const c of map.resources)assert.equal(lavaAt(c.x,c.z),false);
  }
});
test('low-tier geometry budget is genuinely reduced',()=>{
  const lo=buildVolcanicRtsLayout({tier:'low'});
  const hi=buildVolcanicRtsLayout({tier:'high'});
  assert.ok(lo.tiles.length<hi.tiles.length);
  assert.ok(lo.resources.length<hi.resources.length);
  assert.ok(lo.units.length<hi.units.length);
  assert.ok(lo.tiles.length+lo.lava.length<=370);
  assert.ok(hi.tiles.length+hi.lava.length<=1150);
});
test('seeds change decorative details without changing actionable building coordinates',()=>{
  const a=buildVolcanicRtsLayout({seed:1}),b=buildVolcanicRtsLayout({seed:2});
  assert.deepEqual(a.structures,b.structures);
  assert.deepEqual(a.tiles.map(t=>[t.x,t.z,t.style]),
                   b.tiles.map(t=>[t.x,t.z,t.style]));
  assert.notDeepEqual(a.resources,b.resources);
  assert.notDeepEqual(a.stripes,b.stripes);
});

test('CPU magma has bright veins, dark crust, fixed budget and repeatable pixels',()=>{
  const a=paintLavaPixels(64,20260925),b=paintLavaPixels(64,20260925);
  assert.equal(a.pixels.length,64*64*4);
  assert.deepEqual(a.pixels,b.pixels);
  const reds=[],greens=[];
  for(let i=0;i<a.pixels.length;i+=4){
    reds.push(a.pixels[i]);greens.push(a.pixels[i+1]);
    assert.equal(a.pixels[i+3],255);
  }
  assert.ok(Math.max(...reds)-Math.min(...reds)>65);
  assert.ok(Math.max(...greens)-Math.min(...greens)>75);
  assert.throws(()=>paintLavaPixels(1024),/budget/);
});

test('volcanic terrain keeps cliff and lava complexity',()=>{
 const map=buildVolcanicRtsLayout({tier:'balanced',seed:20260926});
 assert.ok(map.cliffs.length>=20);
 assert.ok(map.lava.length>=65);
 assert.ok(map.tiles.filter(t=>t.style==='basalt').length>150);
 assert.ok(map.stripes.length>20);
});
