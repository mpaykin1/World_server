export class NetworkInterestManager{
 constructor({near=45,mid=120,far=260,farHz=2}={}){this.near=near;this.mid=mid;this.far=far;this.farHz=farHz;this.entities=new Map();}
 register(id,getPosition,meta={}){this.entities.set(id,{getPosition,meta,lastSent:0});return()=>this.entities.delete(id)}
 plan(playerPos,nowMs=performance.now(),fogFar=Infinity){const out=[];for(const[id,e]of this.entities){const p=e.getPosition?.();if(!p)continue;const d=p.distanceTo(playerPos);if(d>Math.min(this.far,fogFar*1.1))continue;const hz=d<this.near?30:d<this.mid?10:this.farHz;const interval=1000/hz;if(nowMs-e.lastSent>=interval){e.lastSent=nowMs;out.push({id,hz,distance:d,fullPrecision:d<this.near});}}return out;}
 setFarHz(hz){if(Number.isFinite(hz)&&hz>0)this.farHz=hz;}
 report(){return{mode:'distance-interest-v1',registered:this.entities.size,nearFullPrecision:true,sourceQualityReduced:false};}
}
