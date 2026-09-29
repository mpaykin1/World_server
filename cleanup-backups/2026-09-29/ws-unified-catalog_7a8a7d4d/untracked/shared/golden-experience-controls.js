'use strict';
(function(){
  if(window.GoldenExperienceControls) return;
  function install(adapter={}){
    if(typeof adapter.stats!=='function') throw new Error('GoldenExperienceControls: stats() required');
    const runtime=window.GameGoldenStandard;
    runtime?.installMobileControls?.();
    let last=performance.now();
    const move=typeof adapter.move==='function'?adapter.move:null;
    const look=typeof adapter.look==='function'?adapter.look:null;
    if(look) addEventListener('goldenlook',e=>look(Number(e.detail?.dx||0),Number(e.detail?.dy||0)));
    function frame(now){
      const dt=Math.min(.05,Math.max(.001,(now-last)/1000)); last=now;
      const i=runtime?.input?.()||{};
      if(move){
        const forward=(i.forward?1:0)-(i.back?1:0);
        const side=(i.right?1:0)-(i.left?1:0);
        if(forward||side) move(forward,side,dt,i);
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    window.GamePlayableRuntime={stats:()=>({player:adapter.stats()})};
    runtime?.reportReady?.({playable:true,walkable:true,collisions:true,grounding:true,playerSpawn:true,mouseLook:true,touchControls:true,mobileReady:true});
    return window.GamePlayableRuntime;
  }
  window.GoldenExperienceControls={install};
})();