import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGothicTower, buildGothicViaduct } from '../shared/gothic-architecture.mjs';
import {
  analyzeStructuralSupport,
  applyCannonImpact,
  buildStructuralGraph,
  fireCannonAtStructure,
  traceCannonProjectile,
  materialForBlock,
  planCollapseBodies,
  simulateCannonCollapse,
} from '../shared/voxel-structural-destruction.mjs';

const byRole=(tower,role)=>tower.voxels.filter(v=>v.role===role);
const canonical=result=>({
  destroyed:result.damage.destroyed.map(x=>x.key),
  counts:result.analysis.counts,
  bodies:result.collapse.bodies.map(b=>({
    id:b.id,status:b.status,voxelCount:b.voxelCount,mass:b.mass,
    centerOfMass:b.centerOfMass,pivot:b.pivot,
    linearVelocity:b.linearVelocity,angularVelocity:b.angularVelocity,
  })),
  deferred:result.collapse.deferred,
});

test('gothic tower grammar is deterministic and structurally semantic',()=>{
  const a=buildGothicTower({seed:41,width:7,height:14});
  const b=buildGothicTower({seed:41,width:7,height:14});
  assert.deepEqual(a,b);
  assert.equal(byRole(a,'foundation').length,4);
  assert.ok(byRole(a,'pier').length>=40);
  assert.ok(byRole(a,'arch').length>=5);
  assert.ok(byRole(a,'window').length>=5);
  assert.ok(byRole(a,'spire').length>0);
  assert.ok(a.voxels.length>150&&a.voxels.length<3000);
  assert.equal(new Set(a.voxels.map(v=>`${v.x},${v.y},${v.z}`)).size,a.voxels.length);
});

test('material model makes glass fail under an impact that stone survives',()=>{
  const impact={point:{x:0,y:0,z:0},direction:{x:1,y:0,z:0},mass:1,speed:7,radius:.5};
  const glass=applyCannonImpact([{x:0,y:0,z:0,blockType:9}],impact);
  const stone=applyCannonImpact([{x:0,y:0,z:0,blockType:3}],impact);
  assert.equal(materialForBlock(9).name,'glass');
  assert.equal(materialForBlock(3).name,'stone');
  assert.equal(glass.destroyed.length,1);
  assert.equal(stone.destroyed.length,0);
});

test('structural graph keeps a tower supported after one corner foundation is lost',()=>{
  const tower=buildGothicTower({seed:7,width:7,height:14});
  const hit=applyCannonImpact(tower.voxels,{
    point:{x:3,y:0,z:3},direction:{x:-1,y:0,z:0},mass:30,speed:60,radius:.45,
  });
  assert.ok(hit.destroyed.some(x=>x.voxel.role==='foundation'));
  const analysis=analyzeStructuralSupport(hit.remaining,{supportMargin:.65});
  assert.equal(analysis.counts['topple-risk'],0);
  assert.equal(analysis.counts.unsupported,0);
  assert.ok(analysis.counts.supported>=1);
});

test('breaching the loaded side foundations creates deterministic directional toppling',()=>{
  const tower=buildGothicTower({seed:11,width:7,height:14});
  const impact={point:{x:3,y:0,z:0},direction:{x:-1,y:0,z:0},mass:50,speed:100,radius:3.2};
  const result=simulateCannonCollapse(tower.voxels,impact,{supportMargin:.65,maxBodies:8,maxClusterVoxels:5000});
  const lostFoundations=result.damage.destroyed.filter(x=>x.voxel.role==='foundation');
  assert.equal(lostFoundations.length,2);
  assert.ok(result.analysis.counts['topple-risk']>=1);
  assert.ok(result.collapse.bodies.length>=1);
  const main=result.collapse.bodies.sort((a,b)=>b.voxelCount-a.voxelCount)[0];
  assert.equal(main.status,'topple-risk');
  assert.ok(main.linearVelocity.x>0,'tower should fall toward the breached +X side');
  assert.ok(Math.abs(main.angularVelocity.z)>0);
  assert.ok(main.mass>0);
});

test('detached voxels become unsupported clusters while anchored structure remains static',()=>{
  const voxels=[
    {x:0,y:0,z:0,blockType:3,role:'foundation'},
    {x:0,y:1,z:0,blockType:3,role:'pier'},
    {x:5,y:5,z:5,blockType:10,role:'wall'},
    {x:5,y:6,z:5,blockType:10,role:'wall'},
  ];
  const graph=buildStructuralGraph(voxels);
  assert.equal(graph.keys.length,4);
  const analysis=analyzeStructuralSupport(voxels);
  assert.equal(analysis.counts.supported,1);
  assert.equal(analysis.counts.unsupported,1);
  const plan=planCollapseBodies(analysis,{impactDirection:{x:0,y:0,z:1}});
  assert.equal(plan.bodies.length,1);
  assert.equal(plan.bodies[0].voxelCount,2);
  assert.ok(plan.bodies[0].linearVelocity.z>0);
});

test('collapse planning is replay deterministic and obeys rigid-body budgets',()=>{
  const tower=buildGothicTower({seed:99,width:7,height:16});
  const impact={point:{x:3,y:0,z:0},direction:{x:-1,y:0,z:0},mass:55,speed:100,radius:3.2};
  const a=simulateCannonCollapse(tower.voxels,impact,{supportMargin:.65,maxBodies:8,maxClusterVoxels:5000});
  const b=simulateCannonCollapse(tower.voxels,impact,{supportMargin:.65,maxBodies:8,maxClusterVoxels:5000});
  assert.deepEqual(canonical(a),canonical(b));

  const bounded=planCollapseBodies(a.analysis,{impactDirection:a.damage.direction,maxBodies:2,maxClusterVoxels:10});
  assert.equal(bounded.bodies.length,0);
  assert.ok(bounded.deferred.length>=1);
  assert.ok(bounded.deferred.every(x=>x.reason==='budget'));
});


test('ballistic cannon flight hits the generated tower before applying structural damage',()=>{
  const tower=buildGothicTower({seed:31,width:7,height:14});
  const shot={
    origin:{x:18,y:1.4,z:0},
    velocity:{x:-80,y:0,z:0},
    mass:48,
    damageRadius:3.5,
  };
  const flight=traceCannonProjectile(tower.voxels,shot,{maxStep:.1,maxTime:2});
  assert.equal(flight.hit,true);
  assert.equal(flight.voxel.x,3);
  assert.ok(flight.time>0&&flight.time<1);
  assert.ok(flight.samples>10);
  assert.ok(flight.velocity.y<0);

  const result=fireCannonAtStructure(tower.voxels,shot,{
    maxStep:.1,maxTime:2,supportMargin:.65,maxBodies:8,maxClusterVoxels:5000,
  });
  assert.equal(result.flight.hit,true);
  assert.ok(result.damage.destroyed.length>0);
  assert.ok(result.collapse.bodies.length>=1);
  const main=[...result.collapse.bodies].sort((a,b)=>b.voxelCount-a.voxelCount)[0];
  assert.ok(main.linearVelocity.x>0,'remaining support should tip the damaged tower toward +X breach');
});

test('missed cannon shot leaves the structure intact and creates no collapse bodies',()=>{
  const tower=buildGothicTower({seed:32,width:7,height:14});
  const result=fireCannonAtStructure(tower.voxels,{
    origin:{x:18,y:40,z:0},velocity:{x:-40,y:0,z:0},mass:48,damageRadius:3.2,
  },{maxStep:.1,maxTime:.5});
  assert.equal(result.flight.hit,false);
  assert.equal(result.damage,null);
  assert.equal(result.collapse.bodies.length,0);
  assert.equal(result.analysis.counts.unsupported,0);
});


test('gothic viaduct stays stable with all piers and loses the unsupported span after one pier is removed',()=>{
  const viaduct=buildGothicViaduct({seed:55,spanCount:4,pierSpacing:8,deckY:9});
  const options={enableSpanSupport:true,supportDistanceBudget:32,maxBodies:12,maxClusterVoxels:5000};

  const baseline=analyzeStructuralSupport(viaduct.voxels,options);
  assert.equal(baseline.counts.unsupported,0);
  assert.equal(baseline.counts['topple-risk'],0);
  assert.equal(baseline.spanUnsupportedVoxels,0);

  const middle=viaduct.pierXs[Math.floor(viaduct.pierXs.length/2)];
  const damaged=viaduct.voxels.filter(v=>!(v.x===middle&&(v.role==='foundation'||v.role==='pier')));
  const after=analyzeStructuralSupport(damaged,options);
  assert.equal(after.counts.unsupported,0,'bridge remains globally connected to outer foundations');
  assert.ok(after.spanUnsupportedVoxels>0,'long unsupported span must be detected despite connectivity');
  assert.ok(after.spanRegions.length>=1);

  const plan=planCollapseBodies(after,{...options,impactDirection:{x:1,y:0,z:0}});
  assert.ok(plan.bodies.some(b=>b.status==='unsupported-span'));
  assert.ok(plan.bodies.some(b=>b.voxelKeys.some(k=>k.startsWith(`${middle},`)));
});

test('span support is opt-in so ordinary voxel structures keep pure connectivity semantics',()=>{
  const viaduct=buildGothicViaduct({seed:56,spanCount:4,pierSpacing:8,deckY:9});
  const middle=viaduct.pierXs[Math.floor(viaduct.pierXs.length/2)];
  const damaged=viaduct.voxels.filter(v=>!(v.x===middle&&(v.role==='foundation'||v.role==='pier')));
  const plain=analyzeStructuralSupport(damaged);
  assert.equal(plain.spanUnsupportedVoxels,0);
  assert.equal(plain.spanRegions.length,0);
});
