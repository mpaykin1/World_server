import { buildGothicTower } from '../../shared/gothic-architecture.mjs';
import { fireCannonAtStructure } from '../../shared/voxel-structural-destruction.mjs';
import {
  RAPIER_PROVENANCE,
  createRapierCollapseRuntime,
  loadPinnedRapier,
} from '../../shared/physics/rapier-collapse-runtime.mjs';

const PALETTE=new Map([
  [3,0x73777c],[5,0x80522e],[9,0x9edfed],[10,0x87504a],[13,0x8f99a4],
]);
const key3=(v)=>`${v.x},${v.y},${v.z}`;

function towerOrigin(player,heightAt){
  const x=Math.round(player.pos.x-Math.sin(player.yaw)*18);
  const z=Math.round(player.pos.z-Math.cos(player.yaw)*18);
  let y=heightAt(x,z)+1;
  for(const dx of [-3,0,3])for(const dz of [-3,0,3])y=Math.max(y,heightAt(x+dx,z+dz)+1);
  return{x,y,z};
}

function instancedVoxels(THREE,voxels,localCenter=null){
  const mesh=new THREE.InstancedMesh(
    new THREE.BoxGeometry(.98,.98,.98),
    new THREE.MeshStandardMaterial({color:0xffffff,roughness:.88,metalness:.02,vertexColors:true}),
    Math.max(1,voxels.length),
  );
  const matrix=new THREE.Matrix4();
  for(let i=0;i<voxels.length;i++){
    const v=voxels[i],cx=localCenter?.x||0,cy=localCenter?.y||0,cz=localCenter?.z||0;
    matrix.makeTranslation(v.x-cx,v.y-cy,v.z-cz);mesh.setMatrixAt(i,matrix);
    mesh.setColorAt(i,new THREE.Color(PALETTE.get(v.blockType)||0x777777));
  }
  mesh.count=voxels.length;mesh.instanceMatrix.needsUpdate=true;
  if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
}

function disposeMesh(scene,mesh){
  if(!mesh)return;scene.remove(mesh);mesh.geometry?.dispose?.();mesh.material?.dispose?.();
}

function addGroundCollider(RAPIER,world,origin){
  let desc=RAPIER.ColliderDesc.cuboid(42,.5,42);
  if(typeof desc.setTranslation==='function')desc=desc.setTranslation(origin.x,origin.y-1,origin.z);
  if(typeof desc.setFriction==='function')desc=desc.setFriction(.9);
  world.createCollider(desc);
}

function addCannonMarker(THREE,scene,origin){
  const group=new THREE.Group(),dark=new THREE.MeshStandardMaterial({color:0x34383d,roughness:.65,metalness:.45});
  const wood=new THREE.MeshStandardMaterial({color:0x6b472c,roughness:.9});
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.24,.34,3.2,12),dark);
  barrel.rotation.z=Math.PI/2;barrel.position.set(origin.x+17.4,origin.y+1.15,origin.z);group.add(barrel);
  for(const z of [-.7,.7]){
    const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.68,.68,.22,12),wood);
    wheel.rotation.x=Math.PI/2;wheel.position.set(origin.x+18,origin.y+.6,origin.z+z);group.add(wheel);
  }
  scene.add(group);return group;
}

function mountFireButton(fire){
  const button=document.createElement('button');button.type='button';button.id='gothicFireBtn';
  button.textContent='💥 ПУШКА';
  button.style.cssText='position:fixed;right:12px;top:12px;z-index:75;min-height:44px;padding:9px 14px;border:1px solid #fff8;border-radius:10px;background:#271b19dd;color:white;font:700 13px system-ui';
  button.addEventListener('click',async()=>{button.disabled=true;try{await fire();button.textContent='💥 ВЫСТРЕЛ';}catch(e){button.textContent='ОШИБКА';console.error('[GOTHIC DESTRUCTION]',e);}});
  document.body.appendChild(button);return button;
}

export async function installGothicDestructionLab({THREE,scene,player,heightAt,toast}={}){
  if(!THREE||!scene||!player||typeof heightAt!=='function')throw new TypeError('Voxel runtime bindings required');
  const origin=towerOrigin(player,heightAt),tower=buildGothicTower({origin,seed:20260929,width:7,height:14});
  let staticMesh=instancedVoxels(THREE,tower.voxels),fired=false,accumulator=0;
  scene.add(staticMesh);addCannonMarker(THREE,scene,origin);

  const RAPIER=await loadPinnedRapier(),world=new RAPIER.World({x:0,y:-9.81,z:0});
  addGroundCollider(RAPIER,world,origin);
  const physics=createRapierCollapseRuntime({RAPIER,world,maxBodies:8,maxColliders:1400});
  const bodyMeshes=new Map();

  function rebuildStatic(voxels,dynamicKeys){
    disposeMesh(scene,staticMesh);
    staticMesh=instancedVoxels(THREE,voxels.filter(v=>!dynamicKeys.has(key3(v))));
    scene.add(staticMesh);
  }

  async function fire(){
    if(fired)return{alreadyFired:true,...stats()};
    const shot={origin:{x:origin.x+18,y:origin.y+1.4,z:origin.z},velocity:{x:-80,y:0,z:0},mass:48,damageRadius:3.5};
    const result=fireCannonAtStructure(tower.voxels,shot,{supportMargin:.65,maxBodies:8,maxClusterVoxels:1200});
    const spawned=physics.spawn(result.collapse,result.damage?.remaining||tower.voxels);
    const spawnedIds=new Set(spawned.spawned.map(x=>x.id)),dynamicKeys=new Set();
    for(const plan of result.collapse.bodies){
      if(!spawnedIds.has(plan.id))continue;
      for(const key of plan.voxelKeys)dynamicKeys.add(key);
      const members=(result.damage?.remaining||[]).filter(v=>plan.voxelKeys.includes(key3(v)));
      const mesh=instancedVoxels(THREE,members,plan.centerOfMass);scene.add(mesh);bodyMeshes.set(plan.id,mesh);
    }
    rebuildStatic(result.damage?.remaining||tower.voxels,dynamicKeys);
    fired=true;toast?.(`Башня повреждена: ${result.damage?.destroyed.length||0} блоков · падающих частей: ${spawned.spawned.length}`);
    return{result,spawned};
  }

  function update(_now,dt){
    if(!fired||!bodyMeshes.size)return;
    accumulator+=Math.min(.05,Math.max(0,Number(dt)||0));
    let steps=0;while(accumulator>=1/60&&steps<3){physics.step(1);accumulator-=1/60;steps++;}
    for(const state of physics.snapshot()){
      const mesh=bodyMeshes.get(state.id);if(!mesh)continue;
      mesh.position.set(state.position.x,state.position.y,state.position.z);
      mesh.quaternion.set(state.rotation.x,state.rotation.y,state.rotation.z,state.rotation.w);
    }
  }

  function stats(){
    return{
      enabled:true,fired,towerVoxels:tower.voxels.length,dynamicMeshes:bodyMeshes.size,
      origin:{...origin},bodies:physics.snapshot(),
      ...physics.stats(),rapier:RAPIER_PROVENANCE,
    };
  }

  const button=mountFireButton(fire);
  toast?.('Gothic destruction lab включён · кнопка ПУШКА');
  return{fire,update,stats,origin,tower,button};
}
