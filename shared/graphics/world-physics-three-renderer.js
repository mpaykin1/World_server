import * as THREE from 'three';

const PALETTE=Object.freeze({
  stone:{color:0x777d82,roughness:.92},
  metal:{color:0xb7a89b,roughness:.46,metalness:.5},
  glass:{color:0xb8e9f4,roughness:.18,transparent:true,opacity:.42},
  coal:{color:0x35383b,roughness:.9},dirt:{color:0x795238,roughness:.96},
  snow:{color:0xe9f4ff,roughness:.82},ash:{color:0x666b70,roughness:.98},
  sand:{color:0xd8c17a,roughness:.94},
  water:{color:0x3f8fe8,roughness:.18,transparent:true,opacity:.58},
  oil:{color:0x6c5528,roughness:.28,transparent:true,opacity:.82},
  wood:{color:0x80522e,roughness:.88},
  steam:{color:0xd9edf5,roughness:1,transparent:true,opacity:.28,emissive:0x25323a,emissiveIntensity:.12},
  fire:{color:0xff8a31,roughness:.4,transparent:true,opacity:.82,emissive:0xff4a0b,emissiveIntensity:3.2},
  lava:{color:0xff4f1f,roughness:.52,emissive:0xff2100,emissiveIntensity:3.5}
});

function createMaterial(spec){
  return new THREE.MeshStandardMaterial({
    color:spec.color,roughness:spec.roughness??.8,metalness:spec.metalness??0,
    transparent:Boolean(spec.transparent),opacity:spec.opacity??1,depthWrite:!spec.transparent,
    emissive:spec.emissive??0x000000,emissiveIntensity:spec.emissiveIntensity??0
  });
}

function flattenState(state){
  const items=[];
  for(const item of state?.cells||[])items.push({
    x:item.x,y:item.y,z:item.z,material:item.cell?.material||item.material||'stone'
  });
  for(const cluster of state?.clusters||[])for(const item of cluster.cells||[])items.push({
    x:cluster.origin.x+item.dx,y:cluster.origin.y+item.dy,z:cluster.origin.z+item.dz,
    material:item.cell?.material||'stone'
  });
  return items;
}

export function createWorldPhysicsThreeRenderer({
  scene,mobile=matchMedia('(pointer:coarse)').matches,
  maxInstances=mobile?3200:9000,lightBudget=mobile?4:10
}={}){
  if(!scene)throw new Error('world physics renderer requires scene');
  const group=new THREE.Group();group.name='WorldPhysicsDynamicMatter';scene.add(group);
  const geometry=new THREE.BoxGeometry(.96,.96,.96),meshes=new Map(),dummy=new THREE.Object3D();
  const lightPool=[],activeLights=[];let dropped=0,lastCount=0;

  function meshFor(material){
    if(meshes.has(material))return meshes.get(material);
    const mesh=new THREE.InstancedMesh(geometry,createMaterial(PALETTE[material]||PALETTE.stone),maxInstances);
    mesh.name=`Matter-${material}`;mesh.count=0;mesh.frustumCulled=true;
    mesh.castShadow=false;mesh.receiveShadow=true;group.add(mesh);meshes.set(material,mesh);return mesh;
  }
  function light(){
    const value=lightPool.pop()||new THREE.PointLight(0xff6d24,0,8,2);
    if(!value.parent)group.add(value);activeLights.push(value);return value;
  }
  function resetLights(){
    while(activeLights.length){const value=activeLights.pop();value.intensity=0;lightPool.push(value);}
  }
  function update(state){
    const items=flattenState(state),byMaterial=new Map();dropped=0;lastCount=items.length;
    for(const item of items){
      if(!byMaterial.has(item.material))byMaterial.set(item.material,[]);
      const bucket=byMaterial.get(item.material);
      if(bucket.length<maxInstances)bucket.push(item);else dropped++;
    }
    for(const [name,mesh] of meshes)if(!byMaterial.has(name))mesh.count=0;
    resetLights();let lightsUsed=0;
    for(const [material,bucket] of byMaterial){
      const mesh=meshFor(material);mesh.count=bucket.length;
      for(let i=0;i<bucket.length;i++){
        const item=bucket[i];dummy.position.set(item.x+.5,item.y+.5,item.z+.5);
        const pulse=(material==='fire'||material==='lava')?1+.04*Math.sin((item.x+item.y+item.z)*1.7):1;
        dummy.scale.setScalar(pulse);dummy.rotation.set(0,0,0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
        if(lightsUsed<lightBudget&&(material==='fire'||material==='lava')){
          const value=light();value.color.setHex(material==='lava'?0xff3a12:0xff8a35);
          value.intensity=material==='lava'?2.1:1.35;value.distance=material==='lava'?9:7;
          value.position.set(item.x+.5,item.y+.8,item.z+.5);lightsUsed++;
        }
      }
      mesh.instanceMatrix.needsUpdate=true;
    }
    return diagnostics();
  }
  function consumeCommands(commands){
    for(const command of commands||[]){
      if(command.type!=='light-pulse'||activeLights.length>=lightBudget)continue;
      const p=command.position;if(!p)continue;const value=light();
      value.color.setHex(command.effect==='explosion'?0xffa348:0xffd18a);
      value.position.set(p.x+.5,p.y+.5,p.z+.5);value.intensity=Math.min(5,Number(command.intensity)||1);
      value.distance=12;
    }
  }
  function diagnostics(){
    return{visible:lastCount-dropped,requested:lastCount,dropped,materials:[...meshes.keys()],
      lights:activeLights.length,maxInstances,lightBudget};
  }
  function dispose(){
    scene.remove(group);geometry.dispose();for(const mesh of meshes.values())mesh.material.dispose();
    meshes.clear();lightPool.length=0;activeLights.length=0;
  }
  return{group,update,consumeCommands,diagnostics,dispose};
}
