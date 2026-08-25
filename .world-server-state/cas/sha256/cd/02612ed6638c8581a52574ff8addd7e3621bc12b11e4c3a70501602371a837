import * as THREE from 'three';
import { buildDynamicMeshCollider, updateDynamicMeshCollider } from './dynamic-swept-collision.js';

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();
const _delta = new THREE.Vector3();

function vec3(v, fallback=[0,0,0]) { const a=Array.isArray(v)&&v.length===3?v:fallback; return new THREE.Vector3(Number(a[0])||0,Number(a[1])||0,Number(a[2])||0); }
function findByName(root,name){ let found=null; root?.traverse?.(o=>{if(!found&&o.name===name)found=o;}); return found; }
function pointInAabb(p,min,max){return p.x>=min.x&&p.x<=max.x&&p.y>=min.y&&p.y<=max.y&&p.z>=min.z&&p.z<=max.z;}

/**
 * Source-safe runtime for optional kinematic platforms/elevators and water volumes.
 * Dynamic objects are declared by manifest; nothing rewrites visual source assets.
 */
export class DynamicEnvironmentRuntime {
  constructor({root,player,manifest}) {
    this.root=root; this.player=player; this.manifest=manifest;
    const cfg=manifest.environment||{};
    this.platforms=[]; this.water=[]; this._time=0; this._report={platforms:0,waterVolumes:0,missingObjects:[]};

    for(const spec of cfg.dynamicPlatforms||[]) {
      const object=findByName(root,spec.objectName);
      if(!object){this._report.missingObjects.push(spec.objectName);continue;}
      object.updateMatrixWorld(true);
      _box.setFromObject(object);
      const localStart=object.position.clone();
      const axis=vec3(spec.axis,[0,1,0]); if(axis.lengthSq()<1e-8)axis.set(0,1,0); axis.normalize();
      const distance=Math.max(0,Number(spec.distance)||0), period=Math.max(0.25,Number(spec.period)||4), phase=Number(spec.phase)||0;
      const exact=buildDynamicMeshCollider(object);
      this.platforms.push({object,spec,axis,distance,period,phase,start:localStart,lastWorld:new THREE.Vector3().setFromMatrixPosition(object.matrixWorld),delta:new THREE.Vector3(),bounds:new THREE.Box3().copy(_box),exact});
    }
    for(const spec of cfg.waterVolumes||[]) {
      const min=vec3(spec.min),max=vec3(spec.max);
      if(min.x>max.x)[min.x,max.x]=[max.x,min.x]; if(min.y>max.y)[min.y,max.y]=[max.y,min.y]; if(min.z>max.z)[min.z,max.z]=[max.z,min.z];
      this.water.push({min,max,buoyancy:Math.max(0,Number(spec.buoyancy) || 11.0),drag:THREE.MathUtils.clamp(Number(spec.drag) || 2.3,0,12),surfaceLift:Math.max(0,Number(spec.surfaceLift)||2.2)});
    }
    this._report.platforms=this.platforms.length; this._report.waterVolumes=this.water.length;
  }

  update(dt){
    if(!this.player)return;
    dt=Math.min(Math.max(dt||0,0),0.1); this._time+=dt;
    for(const p of this.platforms){
      const wave=0.5-0.5*Math.cos(((this._time/p.period)+p.phase)*Math.PI*2);
      p.object.position.copy(p.start).addScaledVector(p.axis,p.distance*wave);
      p.object.updateMatrixWorld(true);
      const nowWorld=new THREE.Vector3().setFromMatrixPosition(p.object.matrixWorld);
      p.delta.subVectors(nowWorld,p.lastWorld); p.lastWorld.copy(nowWorld);
      _box.setFromObject(p.object); p.bounds.copy(_box); if(p.exact){updateDynamicMeshCollider(p.exact);p.exact.delta.copy(p.delta);}
      // Carry only when the character's feet are on the platform top. This avoids teleports from nearby moving scenery.
      const feet=this.player.position;
      const margin=(this.player.config?.radius||0.32)+0.08;
      const onTop=feet.x>=_box.min.x-margin&&feet.x<=_box.max.x+margin&&feet.z>=_box.min.z-margin&&feet.z<=_box.max.z+margin&&Math.abs(feet.y-_box.max.y)<=0.16;
      if(onTop&&p.delta.lengthSq()>0)this.player.applyExternalDisplacement?.(p.delta,{carrySafePosition:true});
    }

    this.player.setDynamicColliders?.(this.platforms.map(p=>p.exact?{...p.exact,box:p.bounds,delta:p.delta}:{id:p.object.name||'platform',box:p.bounds,delta:p.delta,kind:'aabb-fallback'}));
    this.player.resolveDynamicCollisions?.();

    let submerged=false;
    for(const w of this.water){
      const eyeY=this.player.position.y+(this.player.config?.eyeHeight||1.58);
      const feet=this.player.position;
      if(!pointInAabb(feet,w.min,w.max)&&!(feet.x>=w.min.x&&feet.x<=w.max.x&&feet.z>=w.min.z&&feet.z<=w.max.z&&eyeY>=w.min.y&&feet.y<=w.max.y))continue;
      submerged=true;
      const depth=THREE.MathUtils.clamp(w.max.y-feet.y,0,Math.max(0.01,w.max.y-w.min.y));
      const depthRatio=THREE.MathUtils.clamp(depth/Math.max(0.5,this.player.config?.height||1.72),0,1);
      this.player.velocity.y += (w.buoyancy*depthRatio + (feet.y<w.max.y-0.05?w.surfaceLift:0))*dt;
      const damp=Math.exp(-w.drag*dt); this.player.velocity.x*=damp; this.player.velocity.z*=damp; this.player.velocity.y*=Math.exp(-w.drag*0.35*dt);
    }
    this.player.environmentState={...(this.player.environmentState||{}),inWater:submerged};
  }
  report(){return{...this._report,sourceAssetsModified:false,kinematicCarry:true,dynamicSideCollision:true,sweptDynamicMeshCollision:this.platforms.filter(p=>p.exact).length,conservativeDynamicAabbFallback:this.platforms.filter(p=>!p.exact).length,waterBuoyancy:true};}
}
