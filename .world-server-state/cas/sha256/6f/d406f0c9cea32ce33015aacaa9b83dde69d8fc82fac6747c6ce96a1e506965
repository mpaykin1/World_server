import * as THREE from 'three';

export function fitLightingToWorld({sun, hemi, worldBounds, renderer, manifest}){
  const size=worldBounds.getSize(new THREE.Vector3());
  const center=worldBounds.getCenter(new THREE.Vector3());
  const span=Math.max(size.x,size.z,10);
  // Keep a consistent cinematic baseline while fitting shadow coverage to actual world scale.
  sun.target.position.copy(center); sun.parent?.add?.(sun.target);
  sun.position.copy(center).add(new THREE.Vector3(-span*0.35,Math.max(size.y,span)*0.8,span*0.45));
  const cam=sun.shadow.camera;
  cam.left=-span*0.62;cam.right=span*0.62;cam.top=span*0.62;cam.bottom=-span*0.62;
  cam.near=0.5;cam.far=Math.max(80,Math.max(size.y,span)*2.8);cam.updateProjectionMatrix();
  const texel=span/Math.max(1,sun.shadow.mapSize.x);sun.shadow.bias=-Math.max(0.00002,Math.min(0.0015,texel*0.00035));
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMappingExposure=manifest.graphics?.exposure ?? 1.08;
  if(hemi)hemi.intensity=manifest.graphics?.ambientIntensity ?? 1.35;
  return {shadowSpan:span,exposure:renderer.toneMappingExposure,sourceMaterialsModified:false};
}

export function validateRuntimeMaterials(root){
  const issues=[];let materials=0,textures=0;
  root?.traverse?.(o=>{if(!o.isMesh)return;const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms){if(!m)continue;materials++;
    if(m.map){textures++;if(m.map.colorSpace!==THREE.SRGBColorSpace)issues.push({type:'base-color-space',material:m.name||'(unnamed)'});}
    if(m.normalMap){textures++;if(m.normalMap.colorSpace===THREE.SRGBColorSpace)issues.push({type:'normal-map-srgb',material:m.name||'(unnamed)'});}
    if(m.roughnessMap)textures++;if(m.metalnessMap)textures++;if(m.emissiveMap)textures++;
  }});
  return {pass:issues.length===0,issues,materials,textures};
}
