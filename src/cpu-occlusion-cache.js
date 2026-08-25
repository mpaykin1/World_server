export class CpuOcclusionCache {
  constructor({nearBypassRadius=42,confirmFrames=3,maxAgeFrames=20}={}){this.nearBypassRadius=nearBypassRadius;this.confirmFrames=confirmFrames;this.maxAgeFrames=maxAgeFrames;this.map=new Map();this.frame=0;}
  beginFrame(){this.frame++;}
  update(id,{distance,occluded,confidence=1}){if(distance<=this.nearBypassRadius){this.map.delete(id);return {visible:true,reason:'near-bypass'};}const r=this.map.get(id)||{hiddenFrames:0,lastFrame:this.frame};r.hiddenFrames=occluded&&confidence>=0.99?r.hiddenFrames+1:0;r.lastFrame=this.frame;this.map.set(id,r);return {visible:r.hiddenFrames<this.confirmFrames,reason:r.hiddenFrames>=this.confirmFrames?'confirmed-cpu-occluded':'unconfirmed'};}
  isVisible(id,distance){if(distance<=this.nearBypassRadius)return true;const r=this.map.get(id);if(!r||this.frame-r.lastFrame>this.maxAgeFrames)return true;return r.hiddenFrames<this.confirmFrames;}
  prune(){for(const [k,v] of this.map)if(this.frame-v.lastFrame>this.maxAgeFrames)this.map.delete(k);}
  contract(){return {failVisible:true,nearBypassRadius:this.nearBypassRadius,sourceAssetsModified:false};}
}
