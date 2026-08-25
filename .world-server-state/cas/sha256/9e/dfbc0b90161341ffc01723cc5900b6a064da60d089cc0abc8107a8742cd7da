import * as THREE from 'three';

function worldRadius(o){
  const s=o.geometry?.boundingSphere;
  if(!s)return 0;
  o.getWorldScale(_scale);
  return s.radius*Math.max(Math.abs(_scale.x),Math.abs(_scale.y),Math.abs(_scale.z));
}
const _center=new THREE.Vector3(), _scale=new THREE.Vector3();

export class ProximityQualityManager{
  constructor({root,scene,manifest}){
    this.root=root||scene;this.scene=scene||root;this.manifest=manifest;const cfg=manifest.graphics?.proximityQuality||{};
    this.enabled=cfg.enabled!==false;this.maxQualityRadius=cfg.maxQualityRadius??32;this.mediumRadius=Math.max(this.maxQualityRadius+8,cfg.mediumRadius??72);
    this.shadowRadius=cfg.shadowRadius??this.maxQualityRadius;this.fogCullMargin=cfg.fogCullMargin??6;this.fogFar=Infinity;
    this._tracked=new Map();this._lastScan=0;this._lastUpdate=0;this._culled=0;this.scan();
  }
  setFogRange(near,far){
    if(Number.isFinite(far)&&far>0)this.fogFar=far;
    if(Number.isFinite(near)&&near>0)this.fogNear=near;
  }
  scan(){
    if(!this.enabled)return;
    this.root?.traverse?.(o=>{if(!o.isMesh||o.name==='__WORLD_COLLIDER__'||this._tracked.has(o))return;
      o.geometry?.computeBoundingSphere?.();
      this._tracked.set(o,{castShadow:o.castShadow,receiveShadow:o.receiveShadow,visible:o.visible});
      o.frustumCulled=true;
    });
  }
  update(playerPosition,nowMs=performance.now()){
    if(!this.enabled||!playerPosition)return;
    if(nowMs-this._lastScan>1400){this._lastScan=nowMs;this.scan();}
    if(nowMs-this._lastUpdate<160)return;this._lastUpdate=nowMs;this._culled=0;
    for(const [o,base] of this._tracked){
      if(!o.parent){this._tracked.delete(o);continue;}
      if(o.geometry?.boundingSphere)_center.copy(o.geometry.boundingSphere.center).applyMatrix4(o.matrixWorld);else o.getWorldPosition(_center);
      const d=_center.distanceTo(playerPosition), r=worldRadius(o);
      // Source geometry/textures are never simplified. Objects are only hidden once their entire bounding sphere is beyond fully opaque fog.
      const fullyFogHidden=Number.isFinite(this.fogFar) && (d-r)>(this.fogFar+this.fogCullMargin);
      o.visible=fullyFogHidden?false:base.visible;
      if(fullyFogHidden){this._culled++;o.userData.__qualityTier='fog-occluded';continue;}
      o.castShadow=Boolean(base.castShadow&&d<=this.shadowRadius);
      o.receiveShadow=Boolean(base.receiveShadow&&d<=this.mediumRadius);
      o.userData.__qualityTier=d<=this.maxQualityRadius?'near-max':(d<=this.mediumRadius?'mid-full-source':'far-fog-full-source');
    }
  }
  report(){let near=0,mid=0,far=0,culled=0;for(const o of this._tracked.keys()){const t=o.userData.__qualityTier;if(t==='near-max')near++;else if(t==='mid-full-source')mid++;else if(t==='far-fog-full-source')far++;else if(t==='fog-occluded')culled++;}
    return{enabled:this.enabled,maxQualityRadius:this.maxQualityRadius,mediumRadius:this.mediumRadius,fogFar:Number.isFinite(this.fogFar)?this.fogFar:null,objects:{near,mid,far,culled},sourceGeometryChanged:false,sourceTexturesChanged:false,cullingPolicy:'only-when-entire-bounds-behind-opaque-fog'};}
}
