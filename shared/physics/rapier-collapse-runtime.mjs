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
const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0));

function hashUnit(input){
  let h=2166136261>>>0;
  for(const ch of String(input)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}
  return h/4294967295;
}
function normalized(v,fallback={x:1,y:0,z:0}){
  const x=Number(v?.x)||0,y=Number(v?.y)||0,z=Number(v?.z)||0,m=Math.hypot(x,y,z);
  return m>1e-8?{x:x/m,y:y/m,z:z/m}:{...fallback};
}

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

function makeFragmentBodyDesc(RAPIER,voxel,parentPlan,impact,index){
  const point=impact?.point||parentPlan?.centerOfMass||voxel;
  const incoming=normalized(impact?.direction||parentPlan?.linearVelocity);
  const outward=normalized({
    x:voxel.x-point.x,
    y:(voxel.y-point.y)*.55+.18,
    z:voxel.z-point.z,
  },incoming);
  const distance=Math.hypot(voxel.x-point.x,voxel.y-point.y,voxel.z-point.z);
  const near=1/(1+distance*.28);
  const key=key3(voxel.x,voxel.y,voxel.z);
  const jx=hashUnit(key+'|x')*2-1,jy=hashUnit(key+'|y')*2-1,jz=hashUnit(key+'|z')*2-1;
  const base=parentPlan?.linearVelocity||{x:0,y:0,z:0};
  const blast=2.3+near*7.2;
  const forward=1.2+near*2.8;
  const velocity={
    x:base.x*.62+outward.x*blast+incoming.x*forward+jx*1.35,
    y:Math.max(base.y*.25,0)+outward.y*blast+1.8+near*3.4+Math.abs(jy)*1.25,
    z:base.z*.62+outward.z*blast+incoming.z*forward+jz*1.35,
  };
  const angular={
    x:(hashUnit(key+'|ax')*2-1)*(3.5+near*6),
    y:(hashUnit(key+'|ay')*2-1)*(3.5+near*6),
    z:(hashUnit(key+'|az')*2-1)*(3.5+near*6),
  };
  let desc=RAPIER.RigidBodyDesc.dynamic();
  desc=callMaybe(desc,'setTranslation',voxel.x,voxel.y,voxel.z);
  desc=callMaybe(desc,'setLinvel',velocity.x,velocity.y,velocity.z);
  desc=callMaybe(desc,'setAngvel',angular);
  desc=callMaybe(desc,'setCanSleep',true);
  desc=callMaybe(desc,'setCcdEnabled',near>.42||index<24);
  return {desc,velocity,angular,key};
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

function makeClusterColliderDesc(RAPIER,plan,members,halfExtent){
  const box=plan.aabb;
  const hx=Math.max(halfExtent,(box.maxX-box.minX)/2+halfExtent);
  const hy=Math.max(halfExtent,(box.maxY-box.minY)/2+halfExtent);
  const hz=Math.max(halfExtent,(box.maxZ-box.minZ)/2+halfExtent);
  const cx=(box.minX+box.maxX)/2,cy=(box.minY+box.maxY)/2,cz=(box.minZ+box.maxZ)/2;
  const volume=Math.max(.001,8*hx*hy*hz);
  const density=Math.max(.01,Number(plan.mass)||1)/volume;
  const friction=members.length
    ? members.reduce((sum,v)=>sum+materialForBlock(v.blockType).friction,0)/members.length
    : .75;
  let desc=RAPIER.ColliderDesc.cuboid(hx,hy,hz);
  desc=callMaybe(desc,'setTranslation',cx-plan.centerOfMass.x,cy-plan.centerOfMass.y,cz-plan.centerOfMass.z);
  desc=callMaybe(desc,'setDensity',density);
  desc=callMaybe(desc,'setFriction',friction);
  desc=callMaybe(desc,'setRestitution',.025);
  return desc;
}

export function createRapierCollapseRuntime({RAPIER,world,maxBodies=16,maxColliders=2048,halfExtent=.49,colliderMode='voxel'}={}){
  assertRapier(RAPIER);assertWorld(world);
  const bodyBudget=clampInt(maxBodies,1,256);
  const colliderBudget=clampInt(maxColliders,1,8192);
  const extent=Math.max(.35,Math.min(.5,Number(halfExtent)||.49));
  const mode=colliderMode==='cluster-aabb'?'cluster-aabb':'voxel';
  const active=new Map();
  let colliderCount=0;

  function spawn(collapsePlan,sourceVoxels){
    const plans=Array.isArray(collapsePlan?.bodies)?collapsePlan.bodies:[];
    const voxels=mapVoxels(sourceVoxels);
    const spawned=[],deferred=[];
    for(const plan of plans){
      if(active.has(plan.id)){spawned.push(snapshotOne(active.get(plan.id)));continue;}
      if(active.size>=bodyBudget){deferred.push({id:plan.id,reason:'body-budget'});continue;}
      const neededColliders=mode==='cluster-aabb'?1:plan.voxelKeys.length;
      if(colliderCount+neededColliders>colliderBudget){deferred.push({id:plan.id,reason:'collider-budget'});continue;}
      const members=plan.voxelKeys.map(k=>voxels.get(k)).filter(Boolean);
      if(members.length!==plan.voxelKeys.length){deferred.push({id:plan.id,reason:'missing-voxels'});continue;}
      const rigidBody=world.createRigidBody(makeBodyDesc(RAPIER,plan));
      const colliders=[];
      if(mode==='cluster-aabb'){
        const collider=world.createCollider(makeClusterColliderDesc(RAPIER,plan,members,extent),rigidBody);
        colliders.push(collider);colliderCount++;
      }else{
        for(const voxel of members){
          const collider=world.createCollider(makeVoxelColliderDesc(RAPIER,voxel,plan.centerOfMass,extent),rigidBody);
          colliders.push(collider);colliderCount++;
        }
      }
      const entry={id:plan.id,plan,rigidBody,colliders,settled:false};
      active.set(plan.id,entry);
      spawned.push(snapshotOne(entry));
    }
    return {spawned,deferred,activeBodies:active.size,activeColliders:colliderCount};
  }

  function spawnFragments(collapsePlan,sourceVoxels,{impact,destroyed=[],maxFragments=128}={}){
    const plans=Array.isArray(collapsePlan?.bodies)?collapsePlan.bodies:[];
    const voxels=mapVoxels(sourceVoxels);
    const destroyedVoxels=(destroyed||[]).map(item=>item?.voxel||item).filter(Boolean);
    const candidates=[],seen=new Set(),point=impact?.point||{x:0,y:0,z:0};
    for(const voxel of destroyedVoxels){
      const key=key3(voxel.x,voxel.y,voxel.z);
      if(seen.has(key))continue;seen.add(key);
      candidates.push({voxel,parentPlan:null,key,priority:-1000+Math.hypot(voxel.x-point.x,voxel.y-point.y,voxel.z-point.z)});
    }
    for(const plan of plans){
      for(const key of plan.voxelKeys||[]){
        if(seen.has(key))continue;
        const voxel=voxels.get(key);if(!voxel)continue;seen.add(key);
        candidates.push({voxel,parentPlan:plan,key,priority:Math.hypot(voxel.x-point.x,voxel.y-point.y,voxel.z-point.z)});
      }
    }
    candidates.sort((a,b)=>a.priority-b.priority||a.key.localeCompare(b.key));
    const limit=clampInt(maxFragments,1,bodyBudget);
    const selected=candidates.slice(0,limit),spawned=[],deferred=[];
    for(let index=0;index<selected.length;index++){
      const item=selected[index],id=`fragment-${item.parentPlan?.id||'impact'}-${item.key}`;
      if(active.has(id)){spawned.push(snapshotOne(active.get(id)));continue;}
      if(active.size>=bodyBudget){deferred.push({id,reason:'body-budget'});continue;}
      if(colliderCount>=colliderBudget){deferred.push({id,reason:'collider-budget'});continue;}
      const motion=makeFragmentBodyDesc(RAPIER,item.voxel,item.parentPlan,impact,index);
      const rigidBody=world.createRigidBody(motion.desc);
      const material=materialForBlock(item.voxel.blockType);
      let colliderDesc=RAPIER.ColliderDesc.cuboid(extent,extent,extent);
      colliderDesc=callMaybe(colliderDesc,'setDensity',clamp(material.density,.05,20));
      colliderDesc=callMaybe(colliderDesc,'setFriction',clamp(material.friction,0,1));
      colliderDesc=callMaybe(colliderDesc,'setRestitution',material.brittleness>.8?.16:.06);
      const collider=world.createCollider(colliderDesc,rigidBody);colliderCount++;
      const entry={
        id,plan:{centerOfMass:{x:item.voxel.x,y:item.voxel.y,z:item.voxel.z}},
        rigidBody,colliders:[collider],settled:false,kind:'voxel-fragment',
        voxelKey:item.key,blockType:item.voxel.blockType,role:item.voxel.role||'',
      };
      active.set(id,entry);spawned.push(snapshotOne(entry));
    }
    for(const item of candidates.slice(limit))deferred.push({id:`fragment-deferred-${item.key}`,reason:'fragment-budget',voxelKey:item.key});
    return {spawned,deferred,activeBodies:active.size,activeColliders:colliderCount,candidateCount:candidates.length,fragmentCount:spawned.length};
  }

  function snapshotOne(entry){
    const p=entry.rigidBody.translation?.()||entry.plan.centerOfMass;
    const r=entry.rigidBody.rotation?.()||{x:0,y:0,z:0,w:1};
    const sleeping=Boolean(entry.rigidBody.isSleeping?.());
    entry.settled=entry.settled||sleeping;
    return {
      id:entry.id,position:{x:p.x,y:p.y,z:p.z},rotation:{x:r.x,y:r.y,z:r.z,w:r.w},sleeping,settled:entry.settled,
      kind:entry.kind||'collapse-cluster',voxelKey:entry.voxelKey||null,blockType:entry.blockType??null,role:entry.role||'',
    };
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
    return {activeBodies:active.size,activeColliders:colliderCount,sleepingBodies:sleeping,bodyBudget,colliderBudget,colliderMode:mode};
  }

  return {spawn,spawnFragments,step,snapshot,stats,clear};
}

export async function loadPinnedRapier(importer=url=>import(url)){
  const url='https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-deterministic-compat@0.21.0/+esm';
  const mod=await importer(url);
  const RAPIER=mod?.default||mod;
  if(typeof RAPIER?.init==='function')await RAPIER.init();
  assertRapier(RAPIER);
  return RAPIER;
}
