(function(global){
  'use strict';
  if(global.WorldQualityTelemetry) return;
  const state={version:1,startedAt:performance.now(),samples:[],events:[],maxSamples:3600};
  function pushSample(sample){
    state.samples.push({t:performance.now(),...sample});
    if(state.samples.length>state.maxSamples) state.samples.splice(0,state.samples.length-state.maxSamples);
  }
  function event(type,data={}){ state.events.push({t:performance.now(),type,...data}); if(state.events.length>1000) state.events.shift(); }
  function snapshot(){ return JSON.parse(JSON.stringify(state)); }
  function tryRuntimeSample(){
    const rt=global.AI3DVoxelRuntime;
    if(!rt||typeof rt.stats!=='function') return;
    try{
      const s=rt.stats();
      const p=s.player||{};
      pushSample({
        player:{x:Number(p.x),y:Number(p.y),z:Number(p.z),onGround:p.onGround===true,playable:p.playable!==false},
        renderer:{triangles:Number(s.renderer?.triangles||s.mesher?.surfaceTriangles||0),drawCalls:Number(s.renderer?.drawCalls||0)}
      });
    }catch{}
  }
  let last=0;
  function tick(now){
    if(now-last>=100){ last=now; tryRuntimeSample(); }
    global.requestAnimationFrame(tick);
  }
  global.WorldQualityTelemetry={state,pushSample,event,snapshot};
  global.requestAnimationFrame(tick);
})(window);
