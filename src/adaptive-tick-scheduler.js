/**
 * Distance-aware scheduler for AI, ambience, particles and other non-physics systems.
 * Critical/player physics never goes through this scheduler.
 * Near field remains full-rate; only distant/fogged work is throttled.
 */
export class AdaptiveTickScheduler {
  constructor({ nearRadius=36, midRadius=90, farHz=2, midHz=12, nearHz=60 }={}) {
    this.nearRadius=nearRadius; this.midRadius=Math.max(midRadius,nearRadius+1);
    this.nearHz=nearHz; this.midHz=midHz; this.farHz=farHz;
    this.entries=new Map(); this.stats={executed:0,skipped:0,near:0,mid:0,far:0,sleeping:0};
  }
  register({id,update,getPosition=null,position=null,critical=false,visible=()=>true}) {
    if(!id||typeof update!=='function') throw new Error('AdaptiveTickScheduler requires id + update');
    const e={id,update,getPosition,position,critical,visible,last:0,accum:0}; this.entries.set(id,e); return()=>this.entries.delete(id);
  }
  update(nowMs,dt,playerPosition,fogFar=Infinity) {
    this.stats={executed:0,skipped:0,near:0,mid:0,far:0,sleeping:0};
    for(const e of this.entries.values()) {
      if(e.critical) { e.update(dt,{tier:'critical'});e.last=nowMs;this.stats.executed++;continue; }
      const p=e.getPosition?.()||e.position; const d=(p&&playerPosition?.distanceTo)?p.distanceTo(playerPosition):0;
      let hz=this.nearHz,tier='near';
      if(Number.isFinite(fogFar)&&d>fogFar*1.08){hz=0.5;tier='sleeping';}
      else if(d>this.midRadius){hz=this.farHz;tier='far';}
      else if(d>this.nearRadius){hz=this.midHz;tier='mid';}
      this.stats[tier]++;
      const interval=1000/Math.max(0.1,hz);
      if(nowMs-e.last<interval){this.stats.skipped++;continue;}
      const elapsed=Math.min(0.5,Math.max(dt,(nowMs-e.last)/1000||dt));
      e.last=nowMs;
      // Offscreen distant effects may sleep, but visible near-field systems always run at their configured full rate.
      if(tier!=='near'&&!e.visible()){this.stats.skipped++;continue;}
      e.update(elapsed,{tier,distance:d,hz});this.stats.executed++;
    }
  }
  report(){return{...this.stats,registered:this.entries.size,nearFieldFullRate:true,playerPhysicsThrottled:false};}
}
