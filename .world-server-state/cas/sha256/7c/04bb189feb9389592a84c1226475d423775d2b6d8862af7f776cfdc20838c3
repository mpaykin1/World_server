import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

function materialsOf(mesh){return Array.isArray(mesh.material)?mesh.material:[mesh.material];}
export class WetSurfaceSystem{
  constructor({renderer,scene,manifest}){
    this.renderer=renderer;this.scene=scene;this.manifest=manifest;const cfg=manifest.materials?.wetSurface||{};
    this.enabled=cfg.enabled!==false;this.intensity=THREE.MathUtils.clamp(cfg.intensity??0.14,0,0.35);
    this.roughnessMultiplier=THREE.MathUtils.clamp(cfg.roughnessMultiplier??(1-this.intensity*1.15),0.55,1);this.envBoost=THREE.MathUtils.clamp(cfg.envMapIntensityBoost??(this.intensity*1.25),0,0.55);
    this.clearcoat=THREE.MathUtils.clamp(cfg.clearcoat??(this.intensity*0.9),0,0.35);this.clearcoatRoughness=THREE.MathUtils.clamp(cfg.clearcoatRoughness??0.32,0.08,0.6);
    this._applied=new WeakSet();this._ownedEnv=null;this._lastScan=0;this._counts={pbr:0,phong:0,fallback:0,optOut:0};
    if(this.enabled&&cfg.reflections!==false&&!scene.environment){const pmrem=new THREE.PMREMGenerator(renderer),env=new RoomEnvironment();this._ownedEnv=pmrem.fromScene(env,0.04).texture;scene.environment=this._ownedEnv;env.dispose?.();pmrem.dispose();}
  }
  _applyMaterial(material){
    if(!material||this._applied.has(material))return;
    if(material.userData?.qualityWetOptOut===true){this._counts.optOut++;this._applied.add(material);return;}
    if(material.isMeshStandardMaterial||material.isMeshPhysicalMaterial){
      material.userData.__qualityWetOriginal={roughness:material.roughness,envMapIntensity:material.envMapIntensity,clearcoat:material.isMeshPhysicalMaterial?material.clearcoat:undefined,clearcoatRoughness:material.isMeshPhysicalMaterial?material.clearcoatRoughness:undefined};
      material.roughness=THREE.MathUtils.clamp((material.roughness??1)*this.roughnessMultiplier,0.18,1);material.envMapIntensity=Math.max(material.envMapIntensity??1,1+this.envBoost);
      if(material.isMeshPhysicalMaterial){material.clearcoat=Math.max(material.clearcoat??0,this.clearcoat);material.clearcoatRoughness=Math.min(material.clearcoatRoughness??1,this.clearcoatRoughness);}
      material.dithering=true;material.needsUpdate=true;this._counts.pbr++;
    }else if(material.isMeshPhongMaterial){
      material.userData.__qualityWetOriginal={shininess:material.shininess,specular:material.specular?.getHex?.()};material.shininess=Math.max(material.shininess??30,45+this.intensity*110);
      material.specular?.lerp?.(new THREE.Color(0xdde6ee),Math.min(0.22,this.intensity));material.needsUpdate=true;this._counts.phong++;
    }else{
      // Shader/basic/splat paths are covered by the global depth-post wet fallback in AtmosphereQualitySystem.
      material.userData.__qualityWetPostFallback=true;this._counts.fallback++;
    }
    this._applied.add(material);
  }
  scan(root=this.scene){if(!this.enabled)return 0;let changed=0;root.traverse?.(o=>{if(!o.isMesh||o.name==='__WORLD_COLLIDER__'||o.material?.visible===false)return;for(const m of materialsOf(o)){if(m&&!this._applied.has(m)){this._applyMaterial(m);changed++;}}});return changed;}
  update(nowMs=performance.now()){if(nowMs-this._lastScan<1200)return;this._lastScan=nowMs;this.scan();}
  report(){const total=this._counts.pbr+this._counts.phong+this._counts.fallback+this._counts.optOut;return{enabled:this.enabled,intensity:this.intensity,roughnessMultiplier:this.roughnessMultiplier,environmentReflections:Boolean(this.scene.environment),materials:{...this._counts,total},postFallbackForUnsupported:true,sourceAssetsModified:false};}
  dispose(){if(this._ownedEnv){if(this.scene.environment===this._ownedEnv)this.scene.environment=null;this._ownedEnv.dispose?.();}}
}
