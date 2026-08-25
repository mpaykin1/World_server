export class PredictiveStreamingV2 {
  constructor({lookAheadSec=2.5,cameraWeight=0.45,maxPrefetch=24}={}){this.lookAheadSec=lookAheadSec;this.cameraWeight=cameraWeight;this.maxPrefetch=maxPrefetch;}
  scoreChunk(chunk,{position,velocity,cameraForward}){const future={x:position.x+velocity.x*this.lookAheadSec,y:position.y+velocity.y*this.lookAheadSec,z:position.z+velocity.z*this.lookAheadSec};const c=chunk.center;const dx=c.x-future.x,dy=c.y-future.y,dz=c.z-future.z;const d=Math.hypot(dx,dy,dz)||1;const facing=(dx*cameraForward.x+dy*cameraForward.y+dz*cameraForward.z)/d;const speed=Math.hypot(velocity.x,velocity.y,velocity.z);return d-(Math.max(0,facing)*this.cameraWeight*30)-(speed*this.lookAheadSec);}
  prioritize(chunks,state){return [...chunks].sort((a,b)=>this.scoreChunk(a,state)-this.scoreChunk(b,state)).slice(0,this.maxPrefetch);}
  contract(){return {sourceAssetChanged:false,nearFirst:true,motionAndCameraPrediction:true};}
}
