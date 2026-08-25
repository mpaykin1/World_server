export class DistantPoseSharing{
 constructor({nearRadius=50,shareRadius=110}={}){this.nearRadius=nearRadius;this.shareRadius=shareRadius;this.rigs=new Map();this.shared=new Map();this.applied=0;}
 register(id,{getPosition,getAnimationKey,capturePose,applyPose}){this.rigs.set(id,{getPosition,getAnimationKey,capturePose,applyPose});return()=>this.rigs.delete(id)}
 update(playerPos){this.shared.clear();for(const[id,r]of this.rigs){const p=r.getPosition?.();if(!p)continue;const d=p.distanceTo(playerPos);if(d<this.shareRadius)continue;const key=r.getAnimationKey?.();if(!key)continue;let pose=this.shared.get(key);if(!pose){pose=r.capturePose?.();if(pose)this.shared.set(key,pose);}else if(r.applyPose){r.applyPose(pose);this.applied++;}}}
 report(){return{mode:'far-identical-animation-pose-sharing-v1',registered:this.rigs.size,nearRadius:this.nearRadius,shareRadius:this.shareRadius,nearCharactersUntouched:true,applied:this.applied};}
}
