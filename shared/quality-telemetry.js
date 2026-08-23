'use strict';
(function(){
  if(window.__WORLD_SERVER_QUALITY_TELEMETRY__)return;
  window.__WORLD_SERVER_QUALITY_TELEMETRY__=true;
  const endpoint='/api/quality-telemetry';
  const app=(location.pathname.match(/\/apps\/([^/]+)/)||[])[1]||'unknown';
  const started=performance.now();
  let errors=0,frames=0,frameStart=performance.now(),sent=false;
  function send(type,data={}){
    const payload={type,app,path:location.pathname,ts:Date.now(),...data};
    const body=JSON.stringify(payload);
    try{
      if(navigator.sendBeacon)navigator.sendBeacon(endpoint,new Blob([body],{type:'application/json'}));
      else fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body,keepalive:true}).catch(()=>{});
    }catch{}
  }
  addEventListener('error',e=>{errors++;send('client_error',{message:String(e.message||'error').slice(0,240)})});
  addEventListener('unhandledrejection',e=>{errors++;send('unhandled_rejection',{message:String(e.reason?.message||e.reason||'rejection').slice(0,240)})});
  function tick(now){frames++;if(now-frameStart<4000){requestAnimationFrame(tick);return}
    if(sent)return;sent=true;
    const fps=Math.round(frames*1000/Math.max(1,now-frameStart));
    const nav=performance.getEntriesByType('navigation')[0];
    send('quality_session',{
      loadMs:Math.round(nav?.loadEventEnd||performance.now()),
      domMs:Math.round(nav?.domContentLoadedEventEnd||0),
      fps,
      errors,
      coarse:matchMedia('(pointer:coarse)').matches,
      viewport:[innerWidth,innerHeight],
      dpr:Number(devicePixelRatio||1)
    });
  }
  requestAnimationFrame(tick);
})();