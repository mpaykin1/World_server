import * as THREE from 'three';
export class WorldVisibilityRuntime{
  constructor({chunkSize=16}={}){this.chunkSize=chunkSize;this.visibilityHz=18;this.occlusionHz=14;this.detailRadius=.76;this.lodBias=1.35;this.last=0;this.frustum=new THREE.Frustum();this.matrix=new THREE.Matrix4();this.hysteresis=new Map();this.visible=0;this.hidden=0;this.unregister=null;}
  bindAutopilot(wqa=window.WorldQualityAutopilot){this.unregister?.();this.unregister=wqa?.registerVisibilityAdapter?.(this)||null;return this;}
  setVisibilityHz(v){this.visibilityHz=Math.max(4,v)} setOcclusionHz(v){this.occlusionHz=Math.max(4,v)} setDetailRadius(v){this.detailRadius=Math.max(.4,v)} setLodBias(v){this.lodBias=Math.max(.6,v)} setTextureBudgetScale(){}
  update(camera,chunks,now=performance.now()){
    if(now-this.last<1000/this.visibilityHz)return;this.last=now;camera.updateMatrixWorld();this.matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.matrix);let vis=0,hid=0;const maxDist=this.chunkSize*(3.2+6.5*this.detailRadius)/Math.max(.75,this.lodBias);
    for(const [key,c] of chunks){const center=new THREE.Vector3((c.cx+.5)*this.chunkSize,32,(c.cz+.5)*this.chunkSize);const near=Math.hypot(center.x-camera.position.x,center.z-camera.position.z)<this.chunkSize*1.8;const sphere=new THREE.Sphere(center,this.chunkSize*3.2);const desired=near||(this.frustum.intersectsSphere(sphere)&&center.distanceTo(camera.position)<maxDist);const h=this.hysteresis.get(key)||{score:0,shown:true};h.score=Math.max(-3,Math.min(3,h.score+(desired?1:-1)));if(near||h.score>=2)h.shown=true;else if(h.score<=-2)h.shown=false;this.hysteresis.set(key,h);for(const m of c.meshes)m.visible=h.shown;h.shown?vis++:hid++;
    }this.visible=vis;this.hidden=hid;
  }
  stats(){return{visibilityHz:this.visibilityHz,detailRadius:this.detailRadius,lodBias:this.lodBias,visibleChunks:this.visible,hiddenChunks:this.hidden,strategy:'frustum+fog-distance+hysteresis'};}
}
