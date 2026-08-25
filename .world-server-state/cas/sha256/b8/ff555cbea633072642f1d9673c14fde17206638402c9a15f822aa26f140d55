/**
 * Performance pressure classifier. V8 never lowers renderer resolution, source assets, texture quality,
 * or global shadow-map resolution. It only raises a pressure level consumed by distance-safe systems
 * (far haze shimmer, streaming decode concurrency, distant non-physics tick scheduler).
 */
export class PerformanceGovernor {
  constructor({ renderer, scene, targetFps = 55, mobileTargetFps = 30, isMobile = false }) {
    this.renderer=renderer;this.scene=scene;this.targetFps=isMobile?mobileTargetFps:targetFps;this.samples=[];this.lastDecision='baseline';this.level=0;this._lastAdjust=performance.now();
  }
  sample(frameDt){
    if(!Number.isFinite(frameDt)||frameDt<=0)return;this.samples.push(1/frameDt);if(this.samples.length>180)this.samples.shift();const now=performance.now();if(now-this._lastAdjust<2500||this.samples.length<90)return;this._lastAdjust=now;
    const sorted=[...this.samples].sort((a,b)=>a-b),p20=sorted[Math.floor(sorted.length*0.20)]||0;
    if(p20<this.targetFps*0.78)this._setLevel(2,'distance-work-pressure-high');
    else if(p20<this.targetFps*0.90)this._setLevel(1,'distance-work-pressure');
    else if(p20>this.targetFps*1.08)this._setLevel(Math.max(0,this.level-1),this.level>1?'pressure-reduced':'baseline-restored');
  }
  _setLevel(level,decision){this.level=Math.max(0,Math.min(2,level));this.lastDecision=decision;}
  report(){const fps=this.samples.length?this.samples.reduce((a,b)=>a+b,0)/this.samples.length:0;return{level:this.level,averageFps:fps,targetFps:this.targetFps,decision:this.lastDecision,visualSourceChanged:false,nearFieldQualityReduced:false,pixelRatioReduced:false,textureResolutionReduced:false,shadowResolutionReduced:false,policy:'distance-work-only'};}
}
