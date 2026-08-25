import * as THREE from 'three';
import { AdaptiveTickScheduler } from './adaptive-tick-scheduler.js';

const _p=new THREE.Vector3();

/**
 * FPS optimizer with a hard invariant: it cannot lower source geometry/texture/material fidelity near the player.
 * It reduces CPU/GPU work by freezing proven-static transforms, prewarming shaders/textures, throttling distant
 * non-physics work, exact instancing of explicitly decorative duplicates, and scheduling background work.
 */
export class FpsQualityOptimizer {
  constructor({renderer,scene,camera,root,manifest,player=null,atmosphere=null}){
    this.renderer=renderer;this.scene=scene;this.camera=camera;this.root=root||scene;this.manifest=manifest;this.player=player;this.atmosphere=atmosphere;
    const c=manifest.graphics?.fpsOptimization||{};
    this.nearRadius=c.nearMaxRadius??36;this.midRadius=c.midRadius??90;
    this.scheduler=new AdaptiveTickScheduler({nearRadius:this.nearRadius,midRadius:this.midRadius,nearHz:c.nearTickHz??60,midHz:c.midTickHz??12,farHz:c.farTickHz??2});
    this.maxAniso=Math.max(1,renderer.capabilities?.getMaxAnisotropy?.()||1);
    this.staticFrozen=0;this.prewarmedTextures=0;this.batches=0;this.batchedObjects=0;this._textures=new Set();this._originalStatic=[];this._batchRecords=[];this._lastTextureUpdate=0;
    this._dynamicNames=new Set((manifest.environment?.dynamicPlatforms||[]).map(x=>x.objectName).filter(Boolean));
    this._scanAndFreezeStatic();this._collectTextures();this._buildExactDecorativeInstances();this._prewarm();
  }
  _isDynamic(o){return o.isSkinnedMesh||o.morphTargetInfluences||o.userData?.dynamic===true||this._dynamicNames.has(o.name);}
  _scanAndFreezeStatic(){
    this.root?.updateMatrixWorld?.(true);
    this.root?.traverse?.(o=>{
      if(o===this.root||this._isDynamic(o)||o.userData?.qualityNoFreeze)return;
      // Only freeze leaf visual transforms; parent groups may still be used by streaming/runtime systems.
      if((o.isMesh||o.isPoints||o.isLine)&&o.matrixAutoUpdate!==false){o.updateMatrix?.();this._originalStatic.push([o,o.matrixAutoUpdate]);o.matrixAutoUpdate=false;this.staticFrozen++;}
    });
  }
  _collectTextures(){
    this.root?.traverse?.(o=>{if(!o.material)return;const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){
      if(!m)continue;for(const k of ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap','alphaMap','lightMap']){const t=m[k];if(t?.isTexture)this._textures.add(t);}
    }});
  }
  _prewarm(){
    // Shader compilation and texture upload trade startup idle time for much less first-use stutter.
    try{const p=this.renderer.compileAsync?.(this.scene,this.camera);p?.catch?.(()=>{});}catch{}
    for(const t of this._textures){
      try{t.anisotropy=this.maxAniso;t.needsUpdate=true;this.renderer.initTexture?.(t);this.prewarmedTextures++;}catch{}
    }
  }
  _buildExactDecorativeInstances(){
    const cfg=this.manifest.graphics?.fpsOptimization||{}; if(cfg.exactDecorativeInstancing===false)return;
    const groups=new Map();
    this.root?.traverse?.(o=>{
      // Automatic batching is intentionally opt-in at object level so gameplay/interactions cannot be broken.
      if(!o.isMesh||!o.userData?.qualityDecorativeStatic||this._isDynamic(o)||Array.isArray(o.material))return;
      const key=`${o.geometry?.uuid||''}|${o.material?.uuid||''}|${o.castShadow?1:0}|${o.receiveShadow?1:0}`;
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);
    });
    for(const list of groups.values()){
      if(list.length<3)continue;const first=list[0];const parent=first.parent;if(!parent||list.some(x=>x.parent!==parent))continue;
      const inst=new THREE.InstancedMesh(first.geometry,first.material,list.length);inst.name=`__QUALITY_EXACT_INSTANCE__${first.name||first.geometry.uuid}`;inst.castShadow=first.castShadow;inst.receiveShadow=first.receiveShadow;inst.frustumCulled=true;
      for(let i=0;i<list.length;i++){list[i].updateMatrix();inst.setMatrixAt(i,list[i].matrix);list[i].visible=false;}
      inst.instanceMatrix.needsUpdate=true;parent.add(inst);this._batchRecords.push({inst,list,parent});this.batches++;this.batchedObjects+=list.length;
    }
  }
  registerDistantSystem(spec){return this.scheduler.register(spec);}
  update(nowMs,dt){
    const pos=this.player?.position;if(!pos)return;
    const fogFar=this.atmosphere?.baseFar??Infinity;
    this.scheduler.update(nowMs,dt,pos,fogFar);
    // Keep maximum texture sampling quality in the near field. No runtime code lowers source resolution.
    if(nowMs-this._lastTextureUpdate>2000){this._lastTextureUpdate=nowMs;for(const t of this._textures){if(t.anisotropy!==this.maxAniso){t.anisotropy=this.maxAniso;t.needsUpdate=true;}}}
  }
  destroy(){
    for(const [o,v] of this._originalStatic)o.matrixAutoUpdate=v;
    for(const r of this._batchRecords){r.parent.remove(r.inst);r.inst.dispose?.();for(const o of r.list)o.visible=true;}
  }
  report(){return{
    mode:'cpu-first-near-lossless-v9',staticTransformsFrozen:this.staticFrozen,shaderWarmup:true,prewarmedTextures:this.prewarmedTextures,
    maximumAnisotropy:this.maxAniso,exactDecorativeBatches:this.batches,batchedDecorativeObjects:this.batchedObjects,scheduler:this.scheduler.report(),
    sourceGeometryChanged:false,sourceTexturesChanged:false,sourceMaterialsChanged:false,nearFieldQualityReduced:false,pixelRatioReduced:false,
    guarantees:['full-source-geometry-near-player','full-source-textures-near-player','no-decimation','no-texture-downscale','no-dynamic-resolution']
  };}
}
