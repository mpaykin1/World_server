import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGothicTower } from '../shared/gothic-architecture.mjs';
import { simulateCannonCollapse } from '../shared/voxel-structural-destruction.mjs';
import {
  RAPIER_PROVENANCE,
  createRapierCollapseRuntime,
  loadPinnedRapier,
} from '../shared/physics/rapier-collapse-runtime.mjs';

class Desc {
  constructor(kind,args=[]){this.kind=kind;this.args=args;this.values={};}
  setTranslation(...v){this.values.translation=v;return this;}
  setLinvel(...v){this.values.linvel=v;return this;}
  setAngvel(v){this.values.angvel=v;return this;}
  setCanSleep(v){this.values.canSleep=v;return this;}
  setCcdEnabled(v){this.values.ccd=v;return this;}
  setDensity(v){this.values.density=v;return this;}
  setFriction(v){this.values.friction=v;return this;}
  setRestitution(v){this.values.restitution=v;return this;}
}
const FakeRapier={
  initCalls:0,
  async init(){this.initCalls++;},
  RigidBodyDesc:{dynamic:()=>new Desc('body')},
  ColliderDesc:{cuboid:(...args)=>new Desc('cuboid',args)},
};
class FakeBody {
  constructor(desc,id){this.desc=desc;this.handle=id;this.steps=0;}
  translation(){const p=this.desc.values.translation;return{x:p[0],y:p[1]-this.steps*.2,z:p[2]};}
  rotation(){return{x:0,y:0,z:0,w:1};}
  isSleeping(){return this.steps>=4;}
}
class FakeWorld {
  constructor(){this.bodies=[];this.colliders=[];this.removed=[];}
  createRigidBody(desc){const b=new FakeBody(desc,this.bodies.length+1);this.bodies.push(b);return b;}
  createCollider(desc,body){const c={desc,body};this.colliders.push(c);return c;}
  step(){for(const b of this.bodies)b.steps++;}
  removeRigidBody(body){this.removed.push(body.handle);}
}

function collapseFixture(){
  const tower=buildGothicTower({seed:23,width:7,height:14});
  const result=simulateCannonCollapse(tower.voxels,{
    point:{x:3,y:0,z:0},direction:{x:-1,y:0,z:0},mass:50,speed:100,radius:3.2,
  },{supportMargin:.65,maxBodies:4,maxClusterVoxels:5000});
  assert.ok(result.collapse.bodies.length>=1);
  return {tower,result};
}

test('Rapier adapter provenance is pinned and permissively licensed',()=>{
  assert.equal(RAPIER_PROVENANCE.package,'@dimforge/rapier3d-deterministic-compat');
  assert.equal(RAPIER_PROVENANCE.version,'0.21.0');
  assert.equal(RAPIER_PROVENANCE.license,'Apache-2.0');
});

test('collapse plan becomes bounded dynamic bodies with voxel colliders and canonical velocities',()=>{
  const {tower,result}=collapseFixture(),world=new FakeWorld();
  const runtime=createRapierCollapseRuntime({RAPIER:FakeRapier,world,maxBodies:4,maxColliders:4096});
  const out=runtime.spawn(result.collapse,result.damage.remaining);
  assert.equal(out.deferred.length,0);
  assert.equal(out.spawned.length,result.collapse.bodies.length);
  assert.equal(world.bodies.length,result.collapse.bodies.length);
  assert.equal(world.colliders.length,result.collapse.bodies.reduce((n,b)=>n+b.voxelCount,0));

  const planned=result.collapse.bodies[0],desc=world.bodies[0].desc;
  assert.deepEqual(desc.values.translation,[planned.centerOfMass.x,planned.centerOfMass.y,planned.centerOfMass.z]);
  assert.deepEqual(desc.values.linvel,[planned.linearVelocity.x,planned.linearVelocity.y,planned.linearVelocity.z]);
  assert.deepEqual(desc.values.angvel,planned.angularVelocity);
  assert.equal(desc.values.canSleep,true);
  assert.ok(world.colliders.every(c=>c.desc.values.density>0));
  assert.ok(world.colliders.every(c=>c.desc.values.friction>=0&&c.desc.values.friction<=1));
  assert.ok(runtime.stats().activeColliders>0);
  assert.ok(tower.voxels.length>result.damage.remaining.length);
});

test('runtime steps bodies to sleep and does not duplicate a stable collapse id',()=>{
  const {result}=collapseFixture(),world=new FakeWorld();
  const runtime=createRapierCollapseRuntime({RAPIER:FakeRapier,world,maxBodies:4,maxColliders:4096});
  const first=runtime.spawn(result.collapse,result.damage.remaining);
  const before=world.bodies.length;
  const second=runtime.spawn(result.collapse,result.damage.remaining);
  assert.equal(world.bodies.length,before);
  assert.equal(second.spawned.length,first.spawned.length);
  const states=runtime.step(4);
  assert.ok(states.every(s=>s.sleeping&&s.settled));
  assert.equal(runtime.stats().sleepingBodies,states.length);
  runtime.clear();
  assert.equal(runtime.stats().activeBodies,0);
  assert.equal(world.removed.length,before);
});

test('body and collider budgets fail closed instead of spawning runaway physics',()=>{
  const {result}=collapseFixture();
  const tooFewColliders=new FakeWorld();
  const a=createRapierCollapseRuntime({RAPIER:FakeRapier,world:tooFewColliders,maxBodies:4,maxColliders:3});
  const outA=a.spawn(result.collapse,result.damage.remaining);
  assert.equal(outA.spawned.length,0);
  assert.ok(outA.deferred.some(x=>x.reason==='collider-budget'));

  const plan={bodies:[
    result.collapse.bodies[0],
    {...result.collapse.bodies[0],id:'second-collapse'},
  ]};
  const oneBody=new FakeWorld();
  const b=createRapierCollapseRuntime({RAPIER:FakeRapier,world:oneBody,maxBodies:1,maxColliders:4096});
  const outB=b.spawn(plan,result.damage.remaining);
  assert.equal(outB.spawned.length,1);
  assert.ok(outB.deferred.some(x=>x.reason==='body-budget'));
});

test('pinned loader resolves the expected deterministic compat URL and initializes WASM',async()=>{
  let seen='';FakeRapier.initCalls=0;
  const loaded=await loadPinnedRapier(async url=>{seen=url;return{default:FakeRapier};});
  assert.equal(loaded,FakeRapier);
  assert.equal(FakeRapier.initCalls,1);
  assert.equal(seen,'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-deterministic-compat@0.21.0/+esm');
});
