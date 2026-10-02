(() => {
  'use strict';

  const {
    NoitaRuntime, MatterPixelRenderer, SpriteAnimator, SpriteEntity,
    applyDamage, MATERIALS
  } = window.WorldNoitaStack;

  const canvas=document.getElementById('world');
  const statsEl=document.getElementById('stats');
  const toastEl=document.getElementById('toast');
  window.__NOITA_ERRORS__=[];
  addEventListener('error',e=>{
    window.__NOITA_ERRORS__.push({message:e.message,stack:e.error?.stack||''});
    statsEl.textContent='ERR: '+e.message;
  });
  addEventListener('unhandledrejection',e=>{
    window.__NOITA_ERRORS__.push({message:String(e.reason),stack:e.reason?.stack||''});
  });

  let runtime,renderer,player,animator;
  let last=performance.now(),accum=0,fps=60,frames=0,fpsClock=last;
  let zoomMode=0,toastTimer=0;
  const STEP=1/30;

  function toast(text){
    clearTimeout(toastTimer);
    toastEl.textContent=text;
    toastEl.classList.add('show');
    toastTimer=setTimeout(()=>toastEl.classList.remove('show'),1300);
  }

  function px(ctx,dx,dy,cell,x,y,w,h,color){
    ctx.fillStyle=color;
    ctx.fillRect(
      Math.round(dx+x*cell),Math.round(dy+y*cell),
      Math.ceil(w*cell),Math.ceil(h*cell)
    );
  }

  function drawAvatar(ctx,frame,dx,dy,dw,dh,cell){
    const bob=(frame===2||frame===4)?1:0;
    const legA=(frame===1||frame===3)?1:0;
    const legB=(frame===2||frame===4)?1:0;
    px(ctx,dx,dy,cell,4,2+bob,4,4,'#f1cda6');
    px(ctx,dx,dy,cell,3,1+bob,6,2,'#2a2337');
    px(ctx,dx,dy,cell,3,6+bob,6,8,'#5a2f7a');
    px(ctx,dx,dy,cell,2,8+bob,2,6,'#7e4aa0');
    px(ctx,dx,dy,cell,8,8+bob,2,6,'#7e4aa0');
    px(ctx,dx,dy,cell,3-legA,14,2,8,'#30333a');
    px(ctx,dx,dy,cell,7+legB,14,2,8,'#30333a');
    px(ctx,dx,dy,cell,1,10+bob,3,2,'#e0b98e');
    px(ctx,dx,dy,cell,9,10+bob,3,2,'#e0b98e');
    px(ctx,dx,dy,cell,10,10+bob,4,1,'#d8e56f');
    px(ctx,dx,dy,cell,13,9+bob,1,3,'#f4ff92');
  }

  function makeRuntime(){
    const mobile=innerWidth<600;
    runtime=new NoitaRuntime({
      width:180,height:110,seed:20261002,maxParticles:mobile?900:1600,
      cameraOptions:{
        x:mobile?72:88,y:42,zoom:mobile?1.05:1.2,
        baseCellPixels:3,pixelPerfect:true,width:innerWidth,height:innerHeight
      },
      structureInterval:4,structureMinCells:2
    });
    renderer=new MatterPixelRenderer(canvas,runtime.camera,{
      lightBudget:mobile?70:150,background:'#07101a'
    });
    animator=new SpriteAnimator({
      frameWidth:14,frameHeight:24,scale:.72,x:24,y:2,
      clips:{
        idle:{frames:[0],fps:1,loop:true},
        walk:{frames:[1,2,3,4],fps:8,loop:true},
        air:{frames:[5],fps:1,loop:true}
      },
      drawFrame:drawAvatar
    });
    player=new SpriteEntity({
      animator,x:24,y:2,speed:10,jumpSpeed:14,gravity:-30
    });
    buildScene();
    runtime.particles.emit('cross',24,12,12,{speed:2.2,life:1.6,spread:6.2});
  }

  function sparseRect(x1,y1,x2,y2,material){
    for(let x=x1;x<=x2;x++)for(let y=y1;y<=y2;y++){
      runtime.sparse.setCell(x,y,0,material);
    }
  }

  function denseRect(x1,y1,x2,y2,material,state){
    for(let x=x1;x<=x2;x++)for(let y=y1;y<=y2;y++){
      runtime.dense.set(x,y,material,state);
    }
  }

  function buildScene(){
    sparseRect(0,0,179,0,'stone');
    sparseRect(0,0,0,109,'stone');
    sparseRect(179,0,179,109,'stone');

    sparseRect(13,1,14,18,'stone');
    sparseRect(47,1,48,18,'stone');
    denseRect(15,1,46,5,'oil');
    denseRect(15,6,46,10,'water');

    sparseRect(53,1,55,13,'wood');
    sparseRect(66,1,68,13,'wood');
    sparseRect(56,1,65,3,'wood');
    for(let x=55;x<=67;x+=2)runtime.sparse.setCell(x,14,0,'wood');

    sparseRect(108,1,110,18,'wood');
    sparseRect(91,19,127,21,'wood');

    sparseRect(130,1,131,16,'stone');
    sparseRect(166,1,167,16,'stone');
    denseRect(132,1,165,10,'water');

    denseRect(73,69,118,84,'sand');
    runtime.camera.cutTo(innerWidth<600?72:88,42,innerWidth<600?1.05:1.2);
  }

  function isSolid(x,y){
    const sparse=runtime.sparse.getCell(x,y,0);
    if(sparse&&MATERIALS[sparse.material]?.phase==='solid')return true;
    const dense=runtime.dense.get(x,y);
    const phase=dense&&MATERIALS[dense.material]?.phase;
    return phase==='solid'||phase==='powder';
  }

  function spawnSand(){
    let placed=0;
    for(let y=55;y<=108&&placed<4000;y++){
      for(let x=28;x<=152&&placed<4000;x++){
        if(runtime.dense.get(x,y))continue;
        if(runtime.dense.set(x,y,'sand'))placed++;
      }
    }
    runtime.camera.animateTo(92,58,1.35);
    toast(placed+' новых клеток песка активированы');
  }

  function lavaWater(){
    denseRect(139,74,158,88,'lava');
    runtime.camera.animateTo(149,42,1.65);
    runtime.camera.shake(.55,.18);
    toast('Лава падает в воду — реакция не заскриптована');
  }

  function ignite(){
    for(let x=53;x<=68;x++)for(let y=1;y<=14;y++){
      const cell=runtime.sparse.getCell(x,y,0);
      if(cell?.material==='wood')runtime.sparse.setCell(x,y,0,'wood',{...cell,fuel:600});
    }
    for(let y=3;y<=10;y+=2)runtime.dense.set(52,y,'fire');
    runtime.camera.animateTo(61,22,2.0);
    toast('Dense fire → sparse wood → structural consequences');
  }

  function breakSupport(){
    applyDamage(runtime.sparse,109,1,0,2,1);
    runtime.detachUnsupported({minCells:2});
    runtime.camera.animateTo(109,22,1.9);
    runtime.camera.shake(1,.22);
    toast('Опора удалена: кластер отделился и стал rigid body');
  }

  function cycleZoom(){
    zoomMode=(zoomMode+1)%4;
    const views=[
      [88,42,1.15],[26,18,2.2],[109,24,1.85],[149,38,1.75]
    ];
    runtime.camera.animateTo(...views[zoomMode]);
    toast(['Обзор','Персонаж','Обвал','Лава + вода'][zoomMode]);
  }

  function spell(){
    const dir=animator.flipX?-1:1;
    const x=player.x+dir*8,y=player.y+9;
    runtime.particles.emit('cross',x,y,14,{speed:4,life:1.25,spread:6.2});
    runtime.particles.emit('spark',x,y,10,{speed:7,upward:2});
    runtime.dense.set(Math.round(x),Math.round(player.y+4),'fire');
    runtime.camera.shake(.45,.1);
  }

  function resize(){
    renderer?.resize(innerWidth,innerHeight);
  }

  function bindHold(id,value){
    const el=document.getElementById(id);
    const start=e=>{e.preventDefault();player.move(value);};
    const stop=e=>{e.preventDefault();player.move(0);};
    el.addEventListener('pointerdown',start);
    el.addEventListener('pointerup',stop);
    el.addEventListener('pointercancel',stop);
    el.addEventListener('pointerleave',e=>{if(e.buttons===0)stop(e);});
  }

  function physicsStep(){
    player.update(STEP,isSolid);
    const result=runtime.step(STEP,{
      maxDenseCells:innerWidth<600?42000:70000,
      maxSparseCells:30000,
      ambientParticleBudget:innerWidth<600?3:7
    });
    if(runtime.lastEvents.some(e=>e.type==='cluster-shatter')){
      toast('Удар: rigid cluster раскрошился обратно в matter');
    }
    if(runtime.lastEvents.some(e=>e.type==='reaction'&&e.reaction==='lava-water')){
      runtime.camera.shake(.35,.08);
    }
    return result;
  }

  function frame(now){
    requestAnimationFrame(frame);
    const dt=Math.min(.05,(now-last)/1000||.016);
    last=now;
    accum=Math.min(.12,accum+dt);
    while(accum>=STEP){
      physicsStep();
      accum-=STEP;
    }

    renderer.render(runtime.renderSources(),{
      rigid:runtime.rigid,
      particles:runtime.particles,
      entities:[player]
    });

    frames++;
    if(now-fpsClock>=500){
      fps=Math.round(frames*1000/(now-fpsClock));
      frames=0;fpsClock=now;
      const s=runtime.stats(),r=renderer.lastStats;
      statsEl.innerHTML=
        `fps ${fps} · cell ${s.camera.cellPixels}px<br>`+
        `dense ${s.dense.occupied} / active ${s.dense.active}<br>`+
        `rigid ${s.rigid} · particles ${s.particles.count} · glow ${r.emissive}`;
    }
  }

  document.getElementById('sand').onclick=spawnSand;
  document.getElementById('lava').onclick=lavaWater;
  document.getElementById('ignite').onclick=ignite;
  document.getElementById('break').onclick=breakSupport;
  document.getElementById('zoom').onclick=cycleZoom;
  document.getElementById('reset').onclick=()=>{makeRuntime();toast('Мир пересобран');};
  document.getElementById('jump').onclick=()=>player.jump();
  document.getElementById('action').onclick=spell;
  bindHold('left',-1);bindHold('right',1);

  addEventListener('keydown',e=>{
    if(e.code==='KeyA'||e.code==='ArrowLeft')player.move(-1);
    if(e.code==='KeyD'||e.code==='ArrowRight')player.move(1);
    if(e.code==='Space')player.jump();
    if(e.code==='KeyE')spell();
  });
  addEventListener('keyup',e=>{
    if(['KeyA','ArrowLeft','KeyD','ArrowRight'].includes(e.code))player.move(0);
  });
  addEventListener('resize',resize);

  window.__NOITA_FULL_STACK__={
    stats:()=>({
      ...runtime.stats(),renderer:{...renderer.lastStats},
      errors:[...window.__NOITA_ERRORS__]
    }),
    actions:{spawnSand,lavaWater,ignite,breakSupport,cycleZoom,spell,reset:makeRuntime},
    get player(){return player;}
  };

  makeRuntime();
  requestAnimationFrame(frame);
})();