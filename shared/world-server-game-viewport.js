'use strict';
(function worldServerGameViewportBootstrap(){
  if (window.WorldServerGameViewport) return;

  const VERSION='1.0.0';
  const adapters=new Set();
  const pointerOwners=new Map();
  const state={ready:false,inputEvents:0,last:null,root:null,surface:null,resizeQueued:false};

  function px(n){ return Math.max(1,Math.round(Number(n)||1)); }
  function vv(){
    const v=window.visualViewport;
    return {
      width:Math.max(1,v?.width||window.innerWidth||document.documentElement.clientWidth||1),
      height:Math.max(1,v?.height||window.innerHeight||document.documentElement.clientHeight||1),
      left:Math.max(0,v?.offsetLeft||0),
      top:Math.max(0,v?.offsetTop||0)
    };
  }

  function lockDocument(){
    for (const el of [document.documentElement,document.body]){
      if(!el) continue;
      el.style.setProperty('overflow','hidden','important');
      el.style.setProperty('overscroll-behavior','none','important');
      el.style.setProperty('width','var(--wsgv-width)','important');
      el.style.setProperty('height','var(--wsgv-height)','important');
      el.style.setProperty('margin','0','important');
    }
    if(document.body){
      document.body.style.setProperty('position','fixed','important');
      document.body.style.setProperty('inset','0','important');
    }
  }

  function findRoot(){
    return document.querySelector('[data-world-server-game-root],#game-root')||document.body;
  }

  function visibleCanvases(){
    return [...document.querySelectorAll('canvas')].filter(c=>{
      const r=c.getBoundingClientRect();
      return r.width>8&&r.height>8;
    }).sort((a,b)=>{
      const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();
      return (br.width*br.height)-(ar.width*ar.height);
    });
  }

  function findSurface(){
    return document.querySelector('[data-world-server-game-surface]')||visibleCanvases()[0]||state.root;
  }

  function ownPointer(surface){
    if(!surface||surface.__wsgvPointerOwned) return;
    surface.__wsgvPointerOwned=true;
    surface.style.setProperty('touch-action','none','important');
    surface.style.setProperty('user-select','none','important');
    surface.style.setProperty('-webkit-user-select','none','important');

    surface.addEventListener('pointerdown',e=>{
      // A canvas can appear after bootstrap; its former root must not capture
      // unrelated UI clicks or steal pointers from the current game surface.
      if(surface!==state.surface||e.target?.closest?.('button,a[href],input,select,textarea,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="dialog"],[data-world-server-scroll]')) return;
      state.inputEvents++;
      pointerOwners.set(e.pointerId,surface);
      try{ surface.setPointerCapture?.(e.pointerId); }catch{}
      if(e.pointerType==='touch'&&e.cancelable) e.preventDefault();
    },{passive:false});

    surface.addEventListener('pointermove',e=>{
      if(pointerOwners.get(e.pointerId)!==surface) return;
      state.inputEvents++;
      if(e.pointerType==='touch'&&e.cancelable) e.preventDefault();
    },{passive:false});

    const end=e=>{
      if(pointerOwners.get(e.pointerId)!==surface) return;
      pointerOwners.delete(e.pointerId);
      try{ surface.releasePointerCapture?.(e.pointerId); }catch{}
      if(e.pointerType==='touch'&&e.cancelable) e.preventDefault();
    };
    surface.addEventListener('pointerup',end,{passive:false});
    surface.addEventListener('pointercancel',end,{passive:false});
  }

  function findRenderer(){
    return window.renderer||window.gameRenderer||window.WorldServer?.renderer||null;
  }

  function findCamera(){
    return window.camera||window.gameCamera||window.WorldServer?.camera||null;
  }

  function findTrackedCamera(){
    const globalCamera=findCamera();
    if(globalCamera) return globalCamera;
    for(const adapter of adapters){
      const camera=adapter.camera||adapter.getCamera?.();
      if(camera) return camera;
    }
    return null;
  }

  function resizeRenderer(cssW,cssH,dpr){
    const r=findRenderer();
    try{
      if(r?.setPixelRatio) r.setPixelRatio(dpr);
      if(r?.setSize) r.setSize(cssW,cssH,false);
    }catch{}
    return r;
  }

  function resizeCamera(cssW,cssH){
    const c=findCamera();
    try{
      if(c&&'aspect' in c&&cssH>0){
        c.aspect=cssW/cssH;
        c.updateProjectionMatrix?.();
      }
    }catch{}
    return c;
  }

  function resizeCanvas(canvas,dpr){
    if(!canvas) return null;
    const rect=canvas.getBoundingClientRect();
    if(rect.width<=0||rect.height<=0) return null;
    const cssW=rect.width,cssH=rect.height;
    const bw=px(cssW*dpr),bh=px(cssH*dpr);
    if(Math.abs(canvas.width-bw)>1) canvas.width=bw;
    if(Math.abs(canvas.height-bh)>1) canvas.height=bh;
    let gl=null;
    try{ gl=canvas.getContext('webgl2')||canvas.getContext('webgl'); }catch{}
    try{ gl?.viewport(0,0,canvas.width,canvas.height); }catch{}
    return {canvas,rect,cssW,cssH,bw,bh,gl};
  }

  function applyAdapters(payload){
    for(const a of adapters){
      try{ a.onResize?.(payload); }catch(error){ console.error('[WorldServerGameViewport adapter]',error); }
      const camera=a.camera||a.getCamera?.();
      try{
        if(camera&&'aspect' in camera){
          camera.aspect=payload.cssWidth/payload.cssHeight;
          camera.updateProjectionMatrix?.();
        }
      }catch{}
      for(const target of a.renderTargets||[]){
        try{ target?.setSize?.(payload.bufferWidth,payload.bufferHeight); }catch{}
      }
    }
  }

  function zeroScroll(){
    const x=window.scrollX||0,y=window.scrollY||0;
    if(x||y) window.scrollTo(0,0);
    if(document.documentElement) document.documentElement.scrollTop=0;
    if(document.body) document.body.scrollTop=0;
  }

  function allowNativePan(target){
    return !!target?.closest?.('[data-world-server-scroll]');
  }

  function blockBrowserGesture(event){
    if(allowNativePan(event.target)) return;
    if(event.cancelable) event.preventDefault();
  }

  function sync(){
    state.resizeQueued=false;
    lockDocument();
    const view=vv();
    state.root=findRoot();
    state.surface=findSurface();
    const dpr=Math.max(1,Math.min(4,window.devicePixelRatio||1));

    document.documentElement.style.setProperty('--wsgv-width',px(view.width)+'px');
    document.documentElement.style.setProperty('--wsgv-height',px(view.height)+'px');
    document.documentElement.style.setProperty('--wsgv-offset-left',Math.round(view.left)+'px');
    document.documentElement.style.setProperty('--wsgv-offset-top',Math.round(view.top)+'px');

    if(state.surface&&state.surface.tagName==='CANVAS') state.surface.dataset.worldServerPrimaryCanvas='1';
    ownPointer(state.surface);
    zeroScroll();

    let canvasInfo=state.surface?.tagName==='CANVAS'?resizeCanvas(state.surface,dpr):null;
    if(!canvasInfo){
      const canvas=visibleCanvases()[0];
      if(canvas){
        canvas.dataset.worldServerPrimaryCanvas='1';
        ownPointer(canvas);
        canvasInfo=resizeCanvas(canvas,dpr);
        state.surface=canvas;
      }
    }

    const cssW=canvasInfo?.cssW||view.width;
    const cssH=canvasInfo?.cssH||view.height;
    resizeRenderer(cssW,cssH,dpr);
    const camera=resizeCamera(cssW,cssH);
    if(canvasInfo) canvasInfo=resizeCanvas(canvasInfo.canvas,dpr)||canvasInfo;

    const payload={
      version:VERSION,visualViewport:view,cssWidth:cssW,cssHeight:cssH,dpr,
      bufferWidth:canvasInfo?.canvas.width||px(cssW*dpr),
      bufferHeight:canvasInfo?.canvas.height||px(cssH*dpr),
      surface:state.surface,root:state.root,camera
    };
    applyAdapters(payload);
    state.last=payload;
    state.ready=true;
    window.dispatchEvent(new CustomEvent('worldserverviewportresize',{detail:payload}));
    return payload;
  }

  function schedule(){
    if(state.resizeQueued) return;
    state.resizeQueued=true;
    requestAnimationFrame(sync);
  }

  function snapshot(){
    const p=state.last||sync();
    const csHtml=getComputedStyle(document.documentElement);
    const csBody=getComputedStyle(document.body);
    const surface=state.surface;
    const csSurface=surface?getComputedStyle(surface):null;
    const docH=document.documentElement.scrollHeight;
    const vh=p.visualViewport.height;
    let gl=null;
    if(surface?.tagName==='CANVAS'){
      try{ gl=surface.getContext('webgl2')||surface.getContext('webgl'); }catch{}
    }
    const camera=findTrackedCamera();
    const expectedAspect=p.cssWidth/p.cssHeight;
    const cameraAspect=Number(camera?.aspect);
    const checks={
      documentHeight:Math.abs(docH-vh)<=3,
      scrollZero:(window.scrollX||0)===0&&(window.scrollY||0)===0,
      overflowHidden:csHtml.overflow==='hidden'&&csBody.overflow==='hidden',
      touchActionNone:!csSurface||csSurface.touchAction==='none',
      canvasCss:surface?.tagName!=='CANVAS'||(
        Math.abs(surface.getBoundingClientRect().width-p.visualViewport.width)<=2&&
        Math.abs(surface.getBoundingClientRect().height-p.visualViewport.height)<=2
      ),
      drawingBuffer:!gl||(
        Math.abs(gl.drawingBufferWidth-p.bufferWidth)<=1&&
        Math.abs(gl.drawingBufferHeight-p.bufferHeight)<=1
      ),
      webglViewport:!gl||(()=>{
        try{
          const v=gl.getParameter(gl.VIEWPORT);
          return v[0]===0&&v[1]===0&&
            Math.abs(v[2]-gl.drawingBufferWidth)<=1&&
            Math.abs(v[3]-gl.drawingBufferHeight)<=1;
        }catch{return false;}
      })(),
      cameraAspect:!Number.isFinite(cameraAspect)||Math.abs(cameraAspect-expectedAspect)<0.002
    };
    return {version:VERSION,pass:Object.values(checks).every(Boolean),checks,inputEvents:state.inputEvents,metrics:p};
  }

  function registerAdapter(adapter){
    if(!adapter||typeof adapter!=='object') throw new TypeError('adapter must be an object');
    adapters.add(adapter);
    schedule();
    return ()=>adapters.delete(adapter);
  }

  function boot(){
    if(state.ready) return;
    sync();
    window.visualViewport?.addEventListener('resize',schedule,{passive:true});
    // iOS may emit VisualViewport scroll while Safari chrome is settling.
    // Rewriting viewport geometry from that event can feed back into rubber-band;
    // resize is the authoritative geometry signal, document scroll is guarded separately.
    window.addEventListener('resize',schedule,{passive:true});
    window.addEventListener('orientationchange',schedule,{passive:true});
    window.addEventListener('scroll',zeroScroll,{passive:true,capture:true});
    document.addEventListener('touchmove',blockBrowserGesture,{passive:false,capture:true});
    for(const type of ['gesturestart','gesturechange','gestureend']){
      document.addEventListener(type,blockBrowserGesture,{passive:false,capture:true});
    }
    document.addEventListener('visibilitychange',()=>{ if(!document.hidden) schedule(); });
    new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  }

  window.WorldServerGameViewport={VERSION,state,boot,sync,schedule,snapshot,registerAdapter};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
