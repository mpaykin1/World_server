export class SimulationLOD {
  constructor({near=42,mid=120,aiHzNear=30,aiHzMid=8,aiHzFar=2,animHzNear=60,animHzMid=15,animHzFar=4}={}){Object.assign(this,{near,mid,aiHzNear,aiHzMid,aiHzFar,animHzNear,animHzMid,animHzFar});}
  tier(distance,interactive=false){if(interactive||distance<=this.near)return 'near';if(distance<=this.mid)return 'mid';return 'far';}
  schedule(distance,interactive=false){const t=this.tier(distance,interactive);return {tier:t,aiHz:t==='near'?this.aiHzNear:t==='mid'?this.aiHzMid:this.aiHzFar,animationHz:t==='near'?this.animHzNear:t==='mid'?this.animHzMid:this.animHzFar,physicsHz:t==='near'?60:t==='mid'?20:5,nearQualityReduced:false,sourceAssetsChanged:false};}
}
