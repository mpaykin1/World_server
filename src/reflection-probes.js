import * as THREE from 'three';

export class StaticReflectionProbeSystem{
 constructor({renderer,scene,manifest}){this.renderer=renderer;this.scene=scene;this.manifest=manifest;this.target=null;this.captured=false;this.loadedOffline=false;this.skipped=false;this.texture=null;}
 async _tryOffline(position,cfg){
  if(!cfg.descriptorUrl)return false;
  const r=await fetch(cfg.descriptorUrl,{cache:'force-cache'});if(!r.ok)throw new Error(`reflection descriptor HTTP ${r.status}`);const d=await r.json();
  if(d.sourceSha256&&d.sourceSha256!==this.manifest.visual.sha256)throw new Error('REFLECTION PROBE BLOCKED: source SHA mismatch');
  if(d.mode!=='offline-voxel-raytraced-cubemap-v1'||!Array.isArray(d.probes)||!d.probes.length)return false;
  let best=d.probes[0],bestD=Infinity;for(const p of d.probes){const q=new THREE.Vector3().fromArray(p.position||[0,0,0]);const dist=q.distanceToSquared(position);if(dist<bestD){best=p;bestD=dist;}}
  if(!Array.isArray(best.faces)||best.faces.length!==6)throw new Error('REFLECTION PROBE BLOCKED: cubemap must have 6 faces');
  const urls=best.faces.map(x=>new URL(x,cfg.descriptorUrl).href);const tex=await new THREE.CubeTextureLoader().loadAsync(urls);tex.colorSpace=THREE.SRGBColorSpace;this.scene.environment=tex;this.texture=tex;this.loadedOffline=true;return true;
 }
 async capture(position){
  const cfg=this.manifest.graphics?.reflectionProbes||{};if(cfg.enabled===false)return{enabled:false};
  try{if(await this._tryOffline(position,cfg))return this.report();}catch(e){console.warn('offline reflection probe unavailable, using safe runtime capture',e);}
  if(!this.renderer?.capabilities){this.skipped=true;return{enabled:true,skipped:true}};
  const size=Math.max(64,Math.min(512,cfg.resolution??256));this.target=new THREE.WebGLCubeRenderTarget(size,{generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter,type:THREE.HalfFloatType});const cam=new THREE.CubeCamera(0.08,cfg.far??900,this.target);cam.position.copy(position);this.scene.add(cam);const oldEnv=this.scene.environment;cam.visible=false;
  try{this.scene.environment=null;cam.update(this.renderer,this.scene);this.scene.environment=this.target.texture;this.captured=true;}catch(e){this.scene.environment=oldEnv;this.skipped=true;console.warn('reflection probe',e)}finally{this.scene.remove(cam)}return this.report();
 }
 report(){return{enabled:true,mode:this.loadedOffline?'offline-voxel-raytraced-cubemap-v1':'static-world-cubemap-once-v1',captured:this.captured,loadedOffline:this.loadedOffline,skipped:this.skipped,sourceAssetsModified:false,dynamicPerFrameCapture:false};}
 dispose(){this.target?.dispose?.();this.texture?.dispose?.();}
}
