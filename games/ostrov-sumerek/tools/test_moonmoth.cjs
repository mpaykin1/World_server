'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = path.resolve(__dirname, '../packs/moonmoth');
class Vector3 {
  constructor(x=0,y=0,z=0){ this.set(x,y,z); }
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
}
const reg={bodies:new Map(),brains:new Map(),enemies:new Map()};
let segments=0,glows=0,steers=0;
const sandbox={
  THREE:{Vector3}, Math, REG:reg, SEA:0,
  toColor:(c)=>c, terrainTop:()=>2,
  defineBody:(id,b)=>{assert(!reg.bodies.has(id));reg.bodies.set(id,b)},
  defineBrain:(id,b)=>{assert(!reg.brains.has(id));reg.brains.set(id,b)},
  defineEnemy:(id,e)=>{assert(!reg.enemies.has(id));reg.enemies.set(id,e)},
  steerFoe:()=>{steers++}, putSegment:()=>{segments++},
  ribbons:{seg:()=>{segments++}}, glow:{spark:()=>{glows++}},
};
vm.createContext(sandbox);
for(const file of ['bodies.js','brains.js','enemies.js'])
  vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),sandbox,{filename:file});
const def=reg.enemies.get('moon_moth');
assert(def && reg.bodies.has(def.body) && reg.brains.has(def.brain));
assert.equal(def.spawn.max({tod:0.2,collected:20}),0);
assert.equal(def.spawn.max({tod:0.6,collected:20}),2);
assert.equal(def.spawn.biomes[0],'dusk');
const f={def,seed:1,t:0,alpha:1,vel:new Vector3(1,0,0),segs:[],rads:[],state:'wander',timer:0,target:new Vector3(),hp:28};
f.body=reg.bodies.get(def.body);f.brain=reg.brains.get(def.brain);
f.body.init(f,5,5,5);f.brain.init(f);
assert.equal(f.segs.length,1);
const s={px:6,py:5,pz:6,dxp:1,dzp:1,dist:1.4,prog:0,canChase:true,chaseR:6.5};
f.brain.think(f,1/60,s);assert.equal(f.state,'chase');
f.brain.think(f,1/60,s);assert(f.speed>0 && Number.isFinite(f.target.x));
f.body.step(f,1/60);f.body.render(f);f.body.drawFx(f);
assert.equal(steers,1);assert(segments>=3);assert.equal(glows,1);
f.brain.onHurtHero(f); assert.equal(f.state,'flee');
f.brain.think(f,1/60,s); assert(f.speed>0);
f.brain.think(f,2,s); assert.equal(f.state,'wander');
f.brain.onDamaged(f); assert.equal(f.state,'chase');
console.log('PASS: registry, biome gating, orbit/chase, retreat, GPU wing drawing');
