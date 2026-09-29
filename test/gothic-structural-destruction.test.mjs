import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGothicTower } from '../shared/gothic-architecture.mjs';
import {
  analyzeStructuralSupport,
  applyCannonImpact,
  buildStructuralGraph,
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
