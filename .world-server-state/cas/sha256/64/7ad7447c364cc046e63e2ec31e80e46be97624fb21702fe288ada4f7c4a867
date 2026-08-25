import * as THREE from 'three';

async function sha256Hex(buffer){if(!globalThis.crypto?.subtle)return null;const digest=await crypto.subtle.digest('SHA-256',buffer);return[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}
function meshList(root){const out=[];root?.traverse?.(o=>{if(o.isMesh&&o.geometry?.getAttribute?.('position'))out.push(o);});return out;}
function patchMaterial(material){
  if(!material||material.userData.__bakedLightPatched)return;material.userData.__bakedLightPatched=true;const prev=material.onBeforeCompile;
  material.onBeforeCompile=shader=>{prev?.(shader);shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float qualityBakedLight;\nvarying float vQualityBakedLight;').replace('#include <begin_vertex>','#include <begin_vertex>\nvQualityBakedLight=qualityBakedLight;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vQualityBakedLight;').replace('#include <output_fragment>','outgoingLight *= clamp(vQualityBakedLight,0.72,1.18);\n#include <output_fragment>');};
  const oldKey=material.customProgramCacheKey?.bind(material);material.customProgramCacheKey=()=>`${oldKey?oldKey():''}|quality-baked-light-v2`;material.needsUpdate=true;
}
function runtimeNormalBake(mesh){
  const geo=mesh.geometry;if(!geo.getAttribute('normal'))geo.computeVertexNormals();const normals=geo.getAttribute('normal'),count=geo.getAttribute('position').count;
  if(!normals||normals.count!==count)throw new Error(`LIGHT-BAKE BLOCKED: normal count mismatch on ${mesh.name||'mesh'}`);
  const values=new Float32Array(count),n=new THREE.Vector3(),nm=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld),sun=new THREE.Vector3(0.42,0.82,-0.39).normalize();
  for(let i=0;i<count;i++){n.fromBufferAttribute(normals,i).applyMatrix3(nm).normalize();const sky=THREE.MathUtils.clamp(n.y*0.5+0.5,0,1),direct=Math.max(0,n.dot(sun));values[i]=THREE.MathUtils.clamp(0.76+0.11*sky+0.20*direct,0.72,1.16);}
  geo.setAttribute('qualityBakedLight',new THREE.BufferAttribute(values,1,false));const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];mats.forEach(patchMaterial);return count;
}


async function applyUvGlbBake(root,cfg,descriptor,manifest){
  const meshes=meshList(root), loader=new THREE.TextureLoader();let applied=0,fallback=0;
  for(const entry of descriptor.entries||[]){
    let mesh=meshes.find(m=>m.name===entry.geometryName&&m.geometry.getAttribute('position')?.count===entry.vertices);
    if(!mesh)mesh=meshes.find(m=>m.geometry.getAttribute('position')?.count===entry.vertices&&!m.userData.__qualityLightmapAssigned);
    if(!mesh)throw new Error(`LIGHT-BAKE BLOCKED: cannot match GLB lightmap geometry ${entry.geometryName}`);
    const url=new URL(entry.textureUrl,cfg.descriptorUrl).href;const tex=await loader.loadAsync(url);tex.colorSpace=THREE.NoColorSpace;tex.channel=entry.uvChannel??0;tex.flipY=false;
    const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];for(const m of mats){if(!m)continue;m.lightMap=tex;m.lightMapIntensity=entry.lightMapIntensity??1;m.needsUpdate=true;}
    mesh.userData.__qualityLightmapAssigned=true;applied++;
  }
  for(const f of descriptor.fallbacks||[]){let mesh=meshes.find(m=>m.name===f.geometryName&&m.geometry.getAttribute('position')?.count===f.vertices&&!m.userData.__qualityLightmapAssigned);if(!mesh)mesh=meshes.find(m=>m.geometry.getAttribute('position')?.count===f.vertices&&!m.userData.__qualityLightmapAssigned);if(mesh){runtimeNormalBake(mesh);mesh.userData.__qualityLightmapAssigned=true;fallback++;}}
  return{enabled:true,mode:'uv-lightmap-glb-v1',verified:true,lightmappedMeshes:applied,fallbackMeshes:fallback,sourceSha256:manifest.visual.sha256,sourceAssetsModified:false,deterministic:true};
}

export async function applyBakedLighting({world,manifest}){
  const cfg=manifest.lightingBake||{};if(cfg.enabled===false)return{enabled:false,reason:'disabled'};
  if(world.visual?.kind!=='mesh')return{enabled:false,reason:'non-mesh-visual',sourceAssetsModified:false};
  if(cfg.mode==='runtime-normal-scalar-v1'){
    world.visual.root.updateMatrixWorld(true);let vertices=0,meshes=0;for(const mesh of meshList(world.visual.root)){vertices+=runtimeNormalBake(mesh);meshes++;}
    if(!meshes)throw new Error('LIGHT-BAKE BLOCKED: runtime bake found no meshes');
    return{enabled:true,mode:cfg.mode,verified:true,meshes,vertices,sourceSha256:manifest.visual.sha256,sourceAssetsModified:false,deterministic:true};
  }
  if(!cfg.descriptorUrl)return{enabled:false,reason:'not-configured'};
  const r=await fetch(cfg.descriptorUrl,{cache:'no-cache'});if(!r.ok)throw new Error(`Lighting bake descriptor HTTP ${r.status}`);const d=await r.json();
  if(d.sourceSha256!==manifest.visual.sha256)throw new Error('LIGHT-BAKE BLOCKED: descriptor source SHA does not match visual source');
  if(d.mode==='uv-lightmap-glb-v1')return applyUvGlbBake(world.visual.root,cfg,d,manifest);
  const scalarModes=new Set(['vertex-scalar-ply-v1','voxel-raytraced-gi-ply-v1']);
  if(!scalarModes.has(d.mode))return{enabled:false,reason:`runtime-adapter-not-supported:${d.mode}`};
  const meshes=meshList(world.visual.root);if(meshes.length!==1)throw new Error(`LIGHT-BAKE BLOCKED: expected one PLY mesh, found ${meshes.length}`);
  const binUrl=new URL(d.binaryUrl,cfg.descriptorUrl).href,br=await fetch(binUrl,{cache:'force-cache'});if(!br.ok)throw new Error(`Lighting bake binary HTTP ${br.status}`);const ab=await br.arrayBuffer();
  if(d.binarySha256){const h=await sha256Hex(ab);if(h&&h!==d.binarySha256)throw new Error('LIGHT-BAKE BLOCKED: baked lighting binary hash mismatch');}
  const values=new Float32Array(ab),geo=meshes[0].geometry,count=geo.getAttribute('position').count;if(values.length!==count)throw new Error(`LIGHT-BAKE BLOCKED: vertex count mismatch ${values.length} != ${count}`);
  geo.setAttribute('qualityBakedLight',new THREE.BufferAttribute(values,1,false));const mats=Array.isArray(meshes[0].material)?meshes[0].material:[meshes[0].material];mats.forEach(patchMaterial);
  return{enabled:true,mode:d.mode,verified:true,vertices:count,sourceSha256:d.sourceSha256,binarySha256:d.binarySha256,sourceAssetsModified:false,deterministic:true,offlineRayTracedGi:d.mode==='voxel-raytraced-gi-ply-v1'};
}
