// Bounded Rapier adapter for canonical voxel collapse plans.
// Canonical gameplay outcome is decided by voxel-structural-destruction.mjs.
// This layer only gives already-selected collapse clusters physical motion.

import { materialForBlock } from '../voxel-structural-destruction.mjs';

export const RAPIER_COLLAPSE_RUNTIME_VERSION = 1;
export const RAPIER_PROVENANCE = Object.freeze({
  package: '@dimforge/rapier3d-deterministic-compat',
  version: '0.21.0',
  license: 'Apache-2.0',
  upstream: 'https://github.com/dimforge/rapier',
  mode: 'optional-runtime-adapter',
});

const clampInt=(v,min,max)=>Math.max(min,Math.min(max,Math.trunc(Number(v)||min)));
const key3=(x,y,z)=>`${x},${y},${z}`;

function assertRapier(RAPIER){
  if(!RAPIER?.RigidBodyDesc?.dynamic||!RAPIER?.ColliderDesc?.cuboid)throw new TypeError('Compatible Rapier 3D API required');
}
function assertWorld(world){
  if(!world?.createRigidBody||!world?.createCollider||!world?.step)throw new TypeError('Rapier world required');
}
function mapVoxels(voxels){
  const m=new Map();
  for(const v of voxels||[])m.set(key3(v.x,v.y,v.z),v);
  return m;
}
function callMaybe(desc,name,...args){
  return typeof desc?.[name]==='function'?desc[name](...args):desc;
}

function makeBodyDesc(RAPIER,plan){
  let desc=RAPIER.RigidBodyDesc.dynamic();
  desc=callMaybe(desc,'setTranslation',plan.centerOfMass.x,plan.centerOfMass.y,plan.centerOfMass.z);
  desc=callMaybe(desc,'setLinvel',plan.linearVelocity.x,plan.linearVelocity.y,plan.linearVelocity.z);
  desc=callMaybe(desc,'setAngvel',plan.angularVelocity);
  desc=callMaybe(desc,'setCanSleep',true);
  desc=callMaybe(desc,'setCcdEnabled',plan.voxelCount<=64);
  return desc;
}

function makeVoxelColliderDesc(RAPIER,voxel,center,halfExtent){
  const material=materialForBlock(voxel.blockType);
  let desc=RAPIER.ColliderDesc.cuboid(halfExtent,halfExtent,halfExtent);
  desc=callMaybe(desc,'setTranslation',voxel.x-center.x,voxel.y-center.y,voxel.z-center.z);
  desc=callMaybe(desc,'setDensity',material.density);
  desc=callMaybe(desc,'setFriction',material.friction);
  desc=callMaybe(desc,'setRestitution',material.brittleness>.9?.08:.02);
  return desc;
}

export function createRapierCollapseRuntime({RAPIER,world,maxBodies=16,maxColliders=2048,halfExtent=.49}={}){
  assertRapier(RAPIER);assertWorld(world);
  const bodyBudget=clampInt(maxBodies,1,64);
  const colliderBudget=clampInt(maxColliders,1,8192);
  const extent=Math.max(.35,Math.min(.5,Number(halfExtent)||.49));
  const active=new Map();
  let colliderCount=0;

  function spawn(collapsePlan,sourceVoxels){
    const plans=Array.isArray(collapsePlan?.bodies)?collapsePlan.bodies:[];
    const voxels=mapVoxels(sourceVoxels);
    const spawned=[],deferred=[];
    for(const plan of plans){
      if(active.has(plan.id)){spawned.push(snapshotOne(active.get(plan.id)));continue;}
      if(active.size>=bodyBudget){deferred.push({id:plan.id,reason:'body-budget'});continue;}
      if(colliderCount+plan.voxelKeys.length>colliderBudget){deferred.push({id:plan.id,reason:'collider-budget'});continue;}
      const members=plan.voxelKeys.map(k=>voxels.get(k)).filter(Boolean);
      if(members.length!==plan.voxelKeys.length){deferred.push({id:plan.id,reason:'missing-voxels'});continue;}
      const rigidBody=world.createRigidBody(makeBodyDesc(RAPIER,plan));
      const colliders=[];
      for(const voxel of members){
        const collider=world.createCollider(makeVoxelColliderDesc(RAPIER,voxel,plan.centerOfMass,extent),rigidBody);
        colliders.push(collider);colliderCount++;
      }
      const entry={id:plan.id,plan,rigidBody,colliders,settled:false};
      active.set(plan.id,entry);
      spawned.push(snapshotOne(entry));
    }
    return {spawned,deferred,activeBodies:active.size,activeColliders:colliderCount};
  }

  function snapshotOne(entry){
    const p=entry.rigidBody.translation?.()||entry.plan.centerOfMass;
    const r=entry.rigidBody.rotation?.()||{x:0,y:0,z:0,w:1};
    const sleeping=Boolean(entry.rigidBody.isSleeping?.());
    entry.settled=entry.settled||sleeping;
    return {id:entry.id,position:{x:p.x,y:p.y,z:p.z},rotation:{x:r.x,y:r.y,z:r.z,w:r.w},sleeping,settled:entry.settled};
  }

  function snapshot(){return [...active.values()].map(snapshotOne).sort((a,b)=>a.id.localeCompare(b.id));}

  function step(steps=1){
    const count=clampInt(steps,1,8);
    for(let i=0;i<count;i++)world.step();
    return snapshot();
  }

  function clear({removeFromWorld=true}={}){
    if(removeFromWorld&&typeof world.removeRigidBody==='function'){
      for(const entry of active.values())world.removeRigidBody(entry.rigidBody);
    }
    active.clear();colliderCount=0;
  }

  function stats(){
    let sleeping=0;
    for(const entry of active.values())if(entry.rigidBody.isSleeping?.())sleeping++;
    return {activeBodies:active.size,activeColliders:colliderCount,sleepingBodies:sleeping,bodyBudget,colliderBudget};
  }

  return {spawn,step,snapshot,stats,clear};
}

export async function loadPinnedRapier(importer=url=>import(url)){
  const url='https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-deterministic-compat@0.21.0/+esm';
  const mod=await importer(url);
  const RAPIER=mod?.default||mod;
  if(typeof RAPIER?.init==='function')await RAPIER.init();
  assertRapier(RAPIER);
  return RAPIER;
}
