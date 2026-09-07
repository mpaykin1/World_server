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
  addEventListener('world:science-domain',e=>{const d=e.detail||{};const runId=String(d.runId||'').slice(0,16),domain=String(d.domain||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,32),phase=String(d.phase||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,24);if(runId&&domain)send('science_domain',{message:`${runId}:${domain}:${phase}`})});
  addEventListener('world:science-gameplay',e=>{
    const d=e?.detail||{};
    const science={runId:String(d.runId||'').slice(0,16),phase:String(d.phase||'').slice(0,24),effectCount:Number(d.effectCount)||0,localNodes:Number(d.localNodes)||0,beforeLcc:Number(d.beforeLcc)||0,afterLcc:Number(d.afterLcc)||0,cycleClosures:Number(d.cycleClosures)||0};
    send('science_gameplay',{message:JSON.stringify(science).slice(0,240)});
  });
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
