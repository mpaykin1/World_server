export class ScreenSpaceAnimationBudget{
  constructor({nearRadius=42,midPixels=80,farPixels=20,midHz=30,farHz=10}={}){Object.assign(this,{nearRadius,midPixels,farPixels,midHz,farHz});this.entries=new Map();}
  register(id,{mixer,getDistance,getProjectedPixels,isInteracting=()=>false}){this.entries.set(id,{mixer,getDistance,getProjectedPixels,isInteracting,accum:0,lastTier:'near'});return()=>this.entries.delete(id);}
  update(dt){let updated=0,deferred=0;for(const e of this.entries.values()){const d=e.getDistance?.()??0,px=e.getProjectedPixels?.()??Infinity,interactive=e.isInteracting?.()===true;let hz=60,tier='near';if(!interactive&&d>this.nearRadius){if(px<this.farPixels){hz=this.farHz;tier='far';}else if(px<this.midPixels){hz=this.midHz;tier='mid';}}e.accum+=dt;const interval=1/hz;if(interactive||tier==='near'||e.accum>=interval){e.mixer?.update?.(e.accum);e.accum=0;updated++;}else deferred++;e.lastTier=tier;}return{updated,deferred};}
  setFarHz(hz){if(Number.isFinite(hz)&&hz>0)this.farHz=hz;}
  flushInteraction(id){const e=this.entries.get(id);if(e&&e.accum>0){e.mixer?.update?.(e.accum);e.accum=0;}return true;}
  report(){return{mode:'screen-space-animation-budget-v1',registered:this.entries.size,nearFullRate:true,interactionBoundaryExact:true,animationTimeAccumulatedNotDiscarded:true,sourceRigReduced:false};}
}
