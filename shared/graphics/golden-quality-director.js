'use strict';
(function(global){
  if(global.GoldenQualityDirector)return;
  const instances=new WeakMap();
  const directors=new Set();
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const TIER=Object.freeze({
    low:{target:30,minDpr:.62,maxDpr:1.05,texMB:160,particles:240,vegetation:320,shadow:16,view:3},
    balanced:{target:45,minDpr:.72,maxDpr:1.35,texMB:256,particles:650,vegetation:700,shadow:28,view:4},
    cinematic:{target:55,minDpr:.78,maxDpr:1.75,texMB:384,particles:1400,vegetation:1400,shadow:42,view:5},
    ultra:{target:60,minDpr:.9,maxDpr:2,texMB:640,particles:2800,vegetation:2600,shadow:58,view:6}
  });
  function detectTier(){
    const q=new URLSearchParams(global.location?.search||'').get('goldenGraphics');
    if(q&&TIER[q])return q;
    if(q==='high')return 'cinematic';
    const coarse=global.matchMedia?.('(pointer:coarse)')?.matches===true;
    const mem=Number(global.navigator?.deviceMemory||0),cores=Number(global.navigator?.hardwareConcurrency||4);
    if((mem&&mem<=2)||cores<=2)return 'low';
    if(coarse||(mem&&mem<=4)||cores<=4)return 'balanced';
    return cores>=10&&(mem>=8||!mem)?'ultra':'cinematic';
  }
  function create(options={}){
    const renderer=options.renderer;if(!renderer)return null;
    if(instances.has(renderer))return instances.get(renderer);
    const tier=options.tier||detectTier(),base=TIER[tier]||TIER.balanced;
    const coarse=global.matchMedia?.('(pointer:coarse)')?.matches===true;
    const target=Number(options.targetFps||base.target),nativeDpr=Math.max(1,Number(global.devicePixelRatio||1));
    const state={tier,target,quality:1,dpr:Math.min(nativeDpr,base.maxDpr),fps:target,frameMs:1000/target,
      p95Ms:1000/target,last:0,lastAdjust:0,frames:0,samples:[],changes:0,
      memoryBytes:0,resources:new Map(),pressure:0,externalMaxDpr:null,webgpu:Boolean(global.navigator?.gpu),coarse};
    const budgets={textureMB:base.texMB,particles:base.particles,vegetation:base.vegetation,shadowDistance:base.shadow,
      viewChunks:base.view,animationNear:18,animationMid:42,animationFar:78,drawCalls:coarse?650:1100};
    function setDpr(next){
      const cap=Math.min(base.maxDpr,nativeDpr,state.externalMaxDpr||Infinity);next=clamp(next,Math.min(base.minDpr,cap),cap);
      if(Math.abs(next-state.dpr)<.04)return;
      state.dpr=next;state.changes++;renderer.setPixelRatio?.(next);
      renderer.setSize?.(global.innerWidth||1,global.innerHeight||1,false);
    }
    function adjust(now){
      if(now-state.lastAdjust<1500)return;state.lastAdjust=now;
      const budgetMs=1000/target,slow=state.p95Ms>budgetMs*1.18||state.fps<target-6||state.pressure>1.02;
      const fast=state.p95Ms<budgetMs*.87&&state.fps>target+3&&state.pressure<.72;
      if(slow)state.quality=clamp(state.quality-.09,.42,1);else if(fast)state.quality=clamp(state.quality+.035,.42,1);
      setDpr(lerp(base.minDpr,Math.min(base.maxDpr,nativeDpr),state.quality));
      global.dispatchEvent?.(new CustomEvent('goldenqualitychange',{detail:telemetry()}));
    }
    function telemetry(){
      const info=renderer.info?.render||{};
      const scale=clamp(state.quality,.42,1);
      return{tier:state.tier,targetFps:target,fps:Math.round(state.fps),frameMs:+state.frameMs.toFixed(1),
        p95Ms:+state.p95Ms.toFixed(1),quality:+state.quality.toFixed(2),dpr:+state.dpr.toFixed(2),changes:state.changes,
        pressure:+state.pressure.toFixed(2),memoryMB:+(state.memoryBytes/1048576).toFixed(1),resources:state.resources.size,webgpuAvailable:state.webgpu,drawCalls:Number(info.calls||0),triangles:Number(info.triangles||0),
        budgets:{textureMB:Math.round(budgets.textureMB*scale),particles:Math.round(budgets.particles*scale),
          vegetation:Math.round(budgets.vegetation*scale),shadowDistance:+(budgets.shadowDistance*lerp(.68,1,scale)).toFixed(1),
          viewChunks:Math.max(2,Math.round(budgets.viewChunks*lerp(.72,1,scale))),drawCalls:Math.round(budgets.drawCalls*scale)}};
    }
    function sample(now){
      if(!state.last){state.last=now;return;}
      const raw=now-state.last;state.last=now;
      if(raw<=0||raw>250){state.samples.length=0;state.frameMs=1000/target;state.p95Ms=1000/target;return;}
      const dt=clamp(raw,4,100);state.frames++;
      state.frameMs=state.frameMs*.82+dt*.18;state.fps=state.fps*.82+(1000/dt)*.18;
      state.samples.push(dt);if(state.samples.length>90)state.samples.shift();
      if(state.samples.length>8){const s=[...state.samples].sort((a,b)=>a-b);state.p95Ms=s[Math.min(s.length-1,Math.floor((s.length-1)*.95))];}
      const calls=Number(renderer.info?.render?.calls||0),callPressure=calls/budgets.drawCalls;
      const memPressure=state.memoryBytes/(budgets.textureMB*1024*1024);
      state.pressure=clamp(Math.max(callPressure,memPressure),0,2);adjust(now);
    }
    let stopped=false,raf=0;
    function loop(now){if(stopped)return;sample(now);raf=global.requestAnimationFrame?.(loop)||0;}
    raf=global.requestAnimationFrame?.(loop)||0;
    const api={
      state,budgets,telemetry,
      getBudget(name){return telemetry().budgets[name];},
      registerResource(key,bytes=0){
        const prev=state.resources.get(key)||0;state.memoryBytes=Math.max(0,state.memoryBytes-prev+Math.max(0,Number(bytes)||0));
        state.resources.set(key,Math.max(0,Number(bytes)||0));return()=>api.unregisterResource(key);
      },
      unregisterResource(key){const prev=state.resources.get(key)||0;state.memoryBytes=Math.max(0,state.memoryBytes-prev);state.resources.delete(key);},
      setQuality(value){state.quality=clamp(Number(value)||1,.42,1);setDpr(lerp(base.minDpr,Math.min(base.maxDpr,nativeDpr),state.quality));return telemetry();},
      setExternalMaxDpr(value){const v=Number(value);state.externalMaxDpr=Number.isFinite(v)&&v>0?v:null;setDpr(state.dpr);return telemetry();},
      stop(){stopped=true;if(raf)global.cancelAnimationFrame?.(raf);instances.delete(renderer);directors.delete(api);},
    };
    instances.set(renderer,api);directors.add(api);renderer.domElement?.setAttribute?.('data-golden-quality',tier);
    global.dispatchEvent?.(new CustomEvent('goldenqualityready',{detail:telemetry()}));
    return api;
  }
  function registerRenderer(renderer,options={}){const d=create({...options,renderer});return()=>d?.stop?.();}
  function diagnostics(){return[...directors].map(d=>d.telemetry());}
  function forRenderer(renderer){return instances.get(renderer)||null;}
  global.GoldenQualityDirector={TIER,detectTier,create,registerRenderer,forRenderer,diagnostics};
})(typeof window!=='undefined'?window:globalThis);
