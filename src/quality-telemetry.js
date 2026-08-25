export class QualityTelemetry {
  constructor({worldId, player, governor, endpoint='/api/quality-telemetry', project='world-factory'}) {
    this.worldId=worldId; this.player=player; this.governor=governor;this.endpoint=endpoint;this.project=project;
    this.errors=[]; this.events=[]; this.startedAt=performance.now();this.fpsSamples=[];
    this.sessionId=globalThis.crypto?.randomUUID?.()||`s-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.buildId=document.documentElement?.dataset?.buildId||'runtime-v3';this._lastFlush=0;this._flushInFlight=false;
    window.__WORLD_QA__ = {
      version:'WORLD_FACTORY_QUALITY_CORE_V10', worldId,
      getSnapshot:()=>this.snapshot(), recordError:(id,detail)=>this.recordError(id,detail), player,
      flushTelemetry:(reason='manual')=>this.flush(reason),
    };
    this._timer=setInterval(()=>this.flush('interval'),30000);
    addEventListener('pagehide',()=>this.flush('pagehide',{beacon:true}),{capture:true});
    addEventListener('error',e=>this.recordError('window-error',e?.message||'window error'));
    addEventListener('unhandledrejection',e=>this.recordError('unhandled-rejection',String(e?.reason||'promise rejection')));
  }
  sample(dt){ if(dt>0&&Number.isFinite(dt)){this.fpsSamples.push(1/dt); if(this.fpsSamples.length>600)this.fpsSamples.shift();} }
  recordError(id,detail){this.errors.push({id:String(id).slice(0,120),detail:String(detail).slice(0,4000),time:performance.now()});if(this.errors.length>100)this.errors.shift();}
  event(id,data={}){this.events.push({id,data,time:performance.now()}); if(this.events.length>500)this.events.shift();}
  snapshot(){
    const fps=this.fpsSamples.length?this.fpsSamples.reduce((a,b)=>a+b,0)/this.fpsSamples.length:0;
    return {
      worldId:this.worldId, uptimeMs:performance.now()-this.startedAt, fps,
      position:this.player?.position?.toArray?.(), velocity:this.player?.velocity?.toArray?.(), grounded:Boolean(this.player?.grounded),
      yaw:this.player?.yaw, pitch:this.player?.pitch, roll:this.player?.camera?.rotation?.z ?? 0,
      bodyYaw:this.player?.bodyYaw, performance:this.governor?.report?.(), errors:[...this.errors], events:this.events.slice(-80),
    };
  }
  async flush(reason='interval',{beacon=false}={}){
    if(this._flushInFlight||!this.endpoint)return false;const now=performance.now();if(reason==='interval'&&now-this._lastFlush<25000)return false;
    this._lastFlush=now;const payload={project:this.project,worldId:this.worldId,buildId:this.buildId,sessionId:this.sessionId,reason,snapshot:this.snapshot()};
    const body=JSON.stringify(payload);
    if(beacon&&navigator.sendBeacon){try{return navigator.sendBeacon(this.endpoint,new Blob([body],{type:'application/json'}));}catch{return false;}}
    this._flushInFlight=true;
    try{const r=await fetch(this.endpoint,{method:'POST',headers:{'content-type':'application/json'},body,keepalive:true});return r.ok;}catch{return false;}finally{this._flushInFlight=false;}
  }
  dispose(){clearInterval(this._timer);}
}
