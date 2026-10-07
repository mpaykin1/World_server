'use strict';
(function(global){
  if(global.GoldenPerformanceAutoTune)return;
  function registerRenderer(renderer,o={}){
    if(global.GoldenQualityDirector?.registerRenderer)return global.GoldenQualityDirector.registerRenderer(renderer,o);
    if(!renderer)return()=>{};
    const min=Number(o.minDpr??.75),max=Number(o.maxDpr??Math.min(global.devicePixelRatio||1,2));
    const target=Number(o.targetFps??(global.matchMedia?.('(pointer:coarse)').matches?45:55));
    let dpr=Math.min(max,Number(renderer.getPixelRatio?.()||global.devicePixelRatio||1));
    let frames=0,last=global.performance?.now?.()||0,ema=target,stop=false;
    function tick(now){
      if(stop)return;frames++;
      if(now-last>=2000){
        const fps=frames*1000/(now-last);ema=ema*.65+fps*.35;frames=0;last=now;
        const old=dpr;if(ema<target-7)dpr=Math.max(min,dpr-.15);else if(ema>target+8)dpr=Math.min(max,dpr+.1);
        if(Math.abs(dpr-old)>.01){renderer.setPixelRatio?.(dpr);renderer.setSize?.(global.innerWidth,global.innerHeight,false);}
      }
      global.requestAnimationFrame?.(tick);
    }
    global.requestAnimationFrame?.(tick);return()=>{stop=true;};
  }
  global.GoldenPerformanceAutoTune={registerRenderer};
})(typeof window!=='undefined'?window:globalThis);
