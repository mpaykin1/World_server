(function(root,factory){
  const api=factory(
    root.LivingInkCore || (typeof require==='function'?require('./living-ink-core.js'):null),
    root.LivingInkQuality || (typeof require==='function'?require('./living-ink-quality.js'):null)
  );
  if(typeof module==='object'&&module.exports) module.exports=api;
  root.LivingInkOffice=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Core,Quality){
  'use strict';
  if(!Core) throw new Error('LivingInkCore is required');
  if(!Quality) throw new Error('LivingInkQuality is required');
  const {v,hash,clamp}=Core;
  const ACTIONS=['idle','walk','sit','type','coffee','talk','listen','meeting','whiteboard','printer','carry-folder','open-door','look-around'];
  const PALETTE=['#506579','#667684','#756c66','#58695f','#445a70','#68717d'];

  function personProfile(seed,index=0){
    const s=seed+index*977;
    return {
      id:`employee-${index+1}`,seed:s,height:.92+hash(s,1)*.22,build:.80+hash(s,2)*.55,
      shoulders:.90+hash(s,3)*.20,hair:Math.floor(hash(s,5)*5),
      suit:PALETTE[Math.floor(hash(s,7)*PALETTE.length)],
      shirt:['#f3f5f4','#f2ede5','#e9eef1','#efeae3'][Math.floor(hash(s,8)*4)],
      accessory:['watch','glasses','badge','briefcase','folder'][Math.floor(hash(s,9)*5)]
    };
  }

  function behaviorAt(seed,t,phase=0){
    const cycle=[['type',9],['walk',5],['coffee',5],['walk',4],['sit',4],['talk',5],['type',8]];
    const total=cycle.reduce((n,x)=>n+x[1],0),time=((t*.001)+phase+hash(seed,22)*5)%total;
    let a=0; for(const [state,d] of cycle){if(time<a+d)return {state,local:(time-a)/d};a+=d;}
    return {state:'idle',local:0};
  }

  function box(r,x,y,z,sx,sy,sz,opt={}){
    const c=opt.color||r.style.wash,a=opt.alpha??.14,p=opt.priority??1,seed=opt.seed||0;
    const x0=x-sx/2,x1=x+sx/2,y0=y-sy/2,y1=y+sy/2,z0=z-sz/2,z1=z+sz/2;
    const zFace=r.camera.z<=z
      ? [v(x0,y0,z0),v(x1,y0,z0),v(x1,y1,z0),v(x0,y1,z0)]
      : [v(x1,y0,z1),v(x0,y0,z1),v(x0,y1,z1),v(x1,y1,z1)];
    const xFace=r.camera.x<=x
      ? [v(x0,y0,z1),v(x0,y0,z0),v(x0,y1,z0),v(x0,y1,z1)]
      : [v(x1,y0,z0),v(x1,y0,z1),v(x1,y1,z1),v(x1,y1,z0)];
    const top=[v(x0,y1,z0),v(x1,y1,z0),v(x1,y1,z1),v(x0,y1,z1)];
    r.poly(zFace,{color:c,alpha:a,priority:p,seed});
    r.poly(xFace,{color:c,alpha:a*.92,priority:p,seed:seed+1});
    r.poly(top,{color:c,alpha:a*1.12,priority:p,seed:seed+2});
    if(opt.edges===false) return;
    const ea=opt.edgeAlpha??.22;
    const e=[
      [x0,y0,z0,x1,y0,z0],[x1,y0,z0,x1,y1,z0],[x1,y1,z0,x0,y1,z0],[x0,y1,z0,x0,y0,z0],
      [x0,y1,z1,x1,y1,z1],[x0,y1,z0,x0,y1,z1],[x1,y1,z0,x1,y1,z1],
      [x0,y0,z0,x0,y0,z1],[x1,y0,z0,x1,y0,z1]
    ];
    e.forEach((q,i)=>r.line(v(q[0],q[1],q[2]),v(q[3],q[4],q[5]),{width:.008,color:r.style.inkSoft,alpha:ea,priority:p,seed:seed+20+i}));
  }

  function roomShell(r,z,seed,side){
    const cx=side*4.15,w=5.15,d=8.8;
    box(r,cx,-.035,z,w,.07,d,{color:r.style.warm,alpha:.055,priority:2,seed:seed+1,edgeAlpha:.08});
    box(r,side*6.65,1.55,z,.06,3.10,d,{color:r.style.glass,alpha:.055,priority:1,seed:seed+2,edgeAlpha:.15});
    box(r,cx,1.55,z+d/2,.06,3.10,w,{color:r.style.glass,alpha:.05,priority:1,seed:seed+3,edgeAlpha:.14});
    Quality.glassPartition(r,{x:side*1.58,z:z-d*.31,w:2.6,h:2.82,axis:'z',seed:seed+4});
    Quality.glassPartition(r,{x:side*1.58,z:z+d*.31,w:2.6,h:2.82,axis:'z',seed:seed+44});
    Quality.glassPartition(r,{x:cx,z:z+d*.16,w:4.45,h:2.76,axis:'x',seed:seed+84,label:'ASQURA',doorGap:.72});
    Quality.watercolorMass(r,v(cx,.9,z),2.25,.76,r.style.glass,.065,seed+95,1.08);
  }

  function desk(r,x,z,rot,seed){
    box(r,x,.72,z,1.55,.10,.70,{color:r.style.warm,alpha:.12,priority:1,seed});
    const face=rot<0?-1:1;
    box(r,x+face*.28,1.10,z,.72,.46,.055,{color:r.style.screen,alpha:.36,priority:1,seed:seed+20});
    box(r,x+face*.28,.82,z,.06,.25,.06,{color:r.style.inkSoft,alpha:.10,priority:1,seed:seed+21});
    box(r,x-face*.18,.775,z,.48,.025,.22,{color:r.style.wash,alpha:.09,priority:0,seed:seed+22});
    r.blob(v(x-face*.52,.79,z+.21),{radius:.034,stretch:1.05,color:r.style.warm,alpha:.20,priority:0,seed:seed+23});
    Quality.propScatter(r,x,z,seed+70,face);
  }

  function chair(r,x,z,seed){
    box(r,x,.45,z,.48,.08,.44,{color:r.style.wash,alpha:.12,priority:1,seed});
    box(r,x,.72,z+.18,.48,.56,.07,{color:r.style.wash,alpha:.10,priority:1,seed:seed+2});
    r.line(v(x,.42,z),v(x,.10,z),{alpha:.25,priority:1,seed:seed+3});
    for(const a of [-.34,-.17,.17,.34]) r.line(v(x,.10,z),v(x+a,.025,z+(a>0?.13:-.13)),{alpha:.20,priority:1,seed:seed+10+Math.round((a+.4)*20)});
  }

  function plant(r,x,z,seed,scale=1){
    box(r,x,.16,z,.36*scale,.32*scale,.36*scale,{color:r.style.warm,alpha:.10,priority:1,seed});
    for(let i=0;i<7;i++){
      const ang=(i/6-.5)*1.5,tipX=x+Math.sin(ang)*.33*scale,tipY=.55*scale+Math.cos(ang)*.52*scale;
      r.line(v(x,.30*scale,z),v(tipX,tipY,z+(hash(seed,i,8)-.5)*.16),{width:.012,alpha:.25,priority:i<5?1:0,seed:seed+10+i});
      r.blob(v(tipX,tipY,z),{radius:.12*scale,stretch:.44,color:r.style.plant,alpha:.22,priority:i<5?1:0,seed:seed+30+i});
    }
  }

  function coffeePoint(r,x,z,seed){
    box(r,x,.58,z,1.35,1.16,.70,{color:r.style.warm,alpha:.10,priority:1,seed});
    box(r,x,1.12,z-.33,.62,.58,.06,{color:r.style.wash,alpha:.18,priority:1,seed:seed+2});
    box(r,x,1.02,z-.36,.16,.08,.05,{color:r.style.ink,alpha:.14,priority:0,seed:seed+3});
    for(let i=0;i<3;i++) r.blob(v(x-.26+i*.25,.79,z-.42),{radius:.04,stretch:.72,color:r.style.warm,alpha:.22,priority:0,seed:seed+8+i});
  }

  function printer(r,x,z,seed){
    box(r,x,.52,z,.72,.82,.55,{color:r.style.wash,alpha:.12,priority:1,seed});
    box(r,x,.81,z-.30,.54,.08,.06,{color:r.style.inkSoft,alpha:.11,priority:0,seed:seed+1});
    for(let i=0;i<3;i++) r.line(v(x-.22,.58-i*.07,z-.31),v(x+.22,.58-i*.07,z-.31),{alpha:.16,priority:0,seed:seed+3+i});
  }

  function meeting(r,x,z,seed){
    box(r,x,.67,z,2.20,.10,1.00,{color:r.style.warm,alpha:.10,priority:1,seed});
    for(const dx of [-.78,-.26,.26,.78]) chair(r,x+dx,z+.72,seed+20+Math.round(dx*10));
    for(const dx of [-.62,.62]) chair(r,x+dx,z-.70,seed+40+Math.round(dx*10));
    box(r,x,1.67,z+.50,1.25,.80,.055,{color:r.style.screen,alpha:.11,priority:1,seed:seed+60});
    r.line(v(x-.50,1.48,z+.46),v(x-.12,1.80,z+.46),{alpha:.24,priority:0,seed:seed+61});
    r.line(v(x-.12,1.80,z+.46),v(x+.20,1.56,z+.46),{alpha:.24,priority:0,seed:seed+62});
    r.line(v(x+.20,1.56,z+.46),v(x+.49,1.92,z+.46),{alpha:.24,priority:0,seed:seed+63});
  }

  function lounge(r,x,z,seed){
    box(r,x,.31,z,2.25,.62,.70,{color:r.style.wash,alpha:.10,priority:1,seed});
    box(r,x,.66,z+.28,2.10,.66,.10,{color:r.style.wash,alpha:.08,priority:1,seed:seed+2});
    box(r,x+.10,.39,z-1.02,1.30,.07,.58,{color:r.style.warm,alpha:.09,priority:1,seed:seed+3});
  }

  function human(r,p,x,z,state,t,side=1,scale=1){
    Quality.humanSilhouette(r,p,x,z,state,t,side,scale);
  }

  function moduleAt(r,z,seed,t,people,startIndex,moduleIndex=0){
    const plan=Quality.compositionPlan(z,moduleIndex);
    roomShell(r,z,seed,-1);roomShell(r,z,seed+200,1);
    box(r,0,-.04,z,3.0,.06,9.4,{color:r.style.warm,alpha:.045,priority:2,seed:seed+300,edgeAlpha:.06});
    plan.washCenters.forEach((w,i)=>Quality.watercolorMass(r,v(w.x,.55,w.z),w.rx,w.ry,i? '#9ba8b1':'#a6afb4',.075,seed+302+i,1.15));
    for(const dz of [-3.4,0,3.4]){
      const zz=z+dz;
      r.line(v(-1.55,3.12,zz),v(1.55,3.12,zz),{alpha:.13,priority:1,seed:seed+310+Math.round(dz*10)});
      r.line(v(0,3.12,zz),v(0,2.74,zz),{alpha:.16,priority:1,seed:seed+320+Math.round(dz*10)});
      r.blob(v(0,2.69,zz),{radius:.16,stretch:.24,color:r.style.wash,alpha:.14,priority:1,seed:seed+330+Math.round(dz*10)});
    }

    desk(r,-4.3,z-1.8,1,seed+400); chair(r,-4.9,z-1.8,seed+401);
    desk(r,-4.0,z+1.2,-1,seed+410); chair(r,-3.45,z+1.2,seed+411);
    meeting(r,4.2,z-1.35,seed+430);
    lounge(r,4.3,z+2.55,seed+450);
    coffeePoint(r,-5.5,z+3.1,seed+470);
    printer(r,5.8,z+3.4,seed+480);
    plant(r,-6.0,z-3.0,seed+490,.95);plant(r,-2.1,z+3.4,seed+491,.70);plant(r,2.2,z+.3,seed+492,.72);plant(r,6.0,z-3.1,seed+493,.90);

    const hero=people[startIndex%people.length];
    human(r,hero,plan.hero.x,plan.hero.z,'walk',t,hero.seed%2?1:-1,plan.hero.scale);
    plan.secondary.forEach((q,i)=>{
      const p=people[(startIndex+i+1)%people.length];
      const directed=Quality.stagedBehavior(i+moduleIndex,t,seed);
      human(r,p,q.x,q.z,i<2?q.state:directed,t,p.seed%2?1:-1,q.scale);
    });
    human(r,people[(startIndex+6)%people.length],5.7,z+3.35,'printer',t,-1,.90);
    human(r,people[(startIndex+7)%people.length],-3.55,z+1.15,'type',t,1,.92);
  }

  function renderOffice(r,recipe,t){
    const seed=recipe.seed||12345;
    r.begin();
    const people=Array.from({length:24},(_,i)=>personProfile(seed,i));
    const moduleSize=10;
    const center=Math.floor((r.camera.z+2)/moduleSize);
    let rendered=0;
    for(let m=center-1;m<=center+2;m++){
      if(m<0) continue;
      moduleAt(r,5+m*moduleSize,seed+m*701,t,people,m*8,m);
      rendered++;
    }
    // long corridor rails make forward motion legible
    r.line(v(-1.52,0,r.camera.z-3),v(-1.52,0,r.camera.z+52),{alpha:.15,priority:2,seed:seed+900});
    r.line(v(1.52,0,r.camera.z-3),v(1.52,0,r.camera.z+52),{alpha:.15,priority:2,seed:seed+901});
    r.text(v(0,2.28,r.camera.z+11),'ASQURA',{size:.13,alpha:.32,priority:1});
    const stats=r.end();
    return {
      stats,
      people:people.slice(0,10).map(p=>({id:p.id,height:p.height,build:p.build,suit:p.suit,accessory:p.accessory})),
      actions:ACTIONS.slice(),
      lodLevels:['near-detail','medium-simplified','far-ink'],
      props:['3d-desks','3d-computers','3d-chairs','plants','coffee-machine','printer','meeting-room','lounge','glass-offices','pendant-lights'],
      renderer:'world-space-3d-living-ink',
      qualitySystems:Quality.SYSTEMS.slice(),
      visualQualityProfile:'asqura-quality-floor-v2',
      renderedModules:rendered,
      cameraMode:r.illustrationMode?'illustration':'walkthrough',
      camera:{...r.camera}
    };
  }

  function ensureTouchHud(){
    if(typeof document==='undefined') return null;
    let hud=document.getElementById('living-ink-touch-hud');
    if(hud) return hud;
    hud=document.createElement('div');hud.id='living-ink-touch-hud';
    hud.innerHTML='<div class="li-stick li-left"><div class="li-knob"></div></div><div class="li-look">LOOK</div><button class="li-frame" type="button">FRAME</button>';
    const style=document.createElement('style');
    style.textContent=`
      #living-ink-touch-hud{position:fixed;inset:0;pointer-events:none;z-index:8}
      .li-stick{position:absolute;left:max(20px,env(safe-area-inset-left));bottom:max(28px,env(safe-area-inset-bottom));width:118px;height:118px;border:1px solid rgba(49,72,95,.20);border-radius:50%;background:rgba(248,245,239,.18);box-shadow:inset 0 0 28px rgba(49,72,95,.04)}
      .li-knob{position:absolute;left:39px;top:39px;width:40px;height:40px;border-radius:50%;border:1px solid rgba(49,72,95,.27);background:rgba(248,245,239,.42);transform:translate(0,0)}
      .li-look{position:absolute;right:max(18px,env(safe-area-inset-right));bottom:max(39px,env(safe-area-inset-bottom));font:700 9px system-ui;letter-spacing:.12em;color:rgba(49,72,95,.22)}
      .li-frame{position:absolute;left:max(16px,env(safe-area-inset-left));top:max(16px,env(safe-area-inset-top));pointer-events:auto;border:1px solid rgba(49,72,95,.16);border-radius:999px;padding:7px 10px;background:rgba(248,245,239,.62);color:rgba(49,72,95,.45);font:800 9px system-ui;letter-spacing:.10em}
      .li-frame.active{background:rgba(115,136,151,.14);color:rgba(49,72,95,.72)}
      @media (pointer:fine){.li-stick,.li-look{display:none}}
    `;
    document.head.appendChild(style);document.body.appendChild(hud);return hud;
  }

  function installInteraction(r,canvas){
    const keys=Object.create(null),active=new Map(),move={x:0,y:0},hud=ensureTouchHud();
    const knob=()=>hud?.querySelector('.li-knob'),frameButton=hud?.querySelector('.li-frame');
    if(frameButton){
      frameButton.addEventListener('pointerdown',e=>e.stopPropagation());
      frameButton.addEventListener('click',e=>{
        e.stopPropagation();
        r.illustrationMode=!r.illustrationMode;
        if(r.illustrationMode){Quality.applyIllustrationCamera(r,true);r.camera.yaw=-.06;}
        else{r.camera.y=1.58;r.camera.pitch=.035;r.resize();}
        frameButton.classList.toggle('active',r.illustrationMode);
        window.__livingInkCameraMode=r.illustrationMode?'illustration':'walkthrough';
      });
    }
    const resetKnob=()=>{const k=knob();if(k)k.style.transform='translate(0px,0px)';};
    addEventListener('keydown',e=>keys[e.key]=true);addEventListener('keyup',e=>keys[e.key]=false);

    function down(e){
      const side=e.clientX<innerWidth*.48?'move':'look';
      active.set(e.pointerId,{side,startX:e.clientX,startY:e.clientY,lastX:e.clientX,lastY:e.clientY});
      canvas.setPointerCapture?.(e.pointerId);e.preventDefault();
    }
    function movePointer(e){
      const a=active.get(e.pointerId);if(!a)return;
      if(a.side==='move'){
        const dx=e.clientX-a.startX,dy=e.clientY-a.startY,rad=46;
        move.x=clamp(dx/rad,-1,1);move.y=clamp(-dy/rad,-1,1);
        const k=knob();if(k)k.style.transform=`translate(${move.x*31}px,${-move.y*31}px)`;
      }else{
        const dx=e.clientX-a.lastX,dy=e.clientY-a.lastY;
        r.camera.yaw+=dx*.0042;r.camera.pitch=clamp(r.camera.pitch+dy*.0026,-.22,.24);
        a.lastX=e.clientX;a.lastY=e.clientY;
      }
      e.preventDefault();
    }
    function up(e){
      const a=active.get(e.pointerId);if(a?.side==='move'){move.x=0;move.y=0;resetKnob();}
      active.delete(e.pointerId);e.preventDefault();
    }
    canvas.addEventListener('pointerdown',down,{passive:false});
    canvas.addEventListener('pointermove',movePointer,{passive:false});
    canvas.addEventListener('pointerup',up,{passive:false});canvas.addEventListener('pointercancel',up,{passive:false});

    return function updateInput(dt){
      const keyF=(keys.w||keys.W||keys.ArrowUp?1:0)-(keys.s||keys.S||keys.ArrowDown?1:0);
      const keyS=(keys.d||keys.D||keys.ArrowRight?1:0)-(keys.a||keys.A||keys.ArrowLeft?1:0);
      const f=clamp(keyF+move.y,-1,1),s=clamp(keyS+move.x,-1,1),mag=Math.min(1,Math.hypot(f,s)||1),speed=3.15*mag;
      const fx=Math.sin(r.camera.yaw),fz=Math.cos(r.camera.yaw),rx=Math.sin(r.camera.yaw+Math.PI/2),rz=Math.cos(r.camera.yaw+Math.PI/2);
      r.camera.x=clamp(r.camera.x+(fx*f+rx*s)*speed*dt,-6.2,6.2);
      r.camera.z=clamp(r.camera.z+(fz*f+rz*s)*speed*dt,-2.15,160);
      window.__livingInkNavigation={forward:f,strafe:s,touchPointers:active.size,camera:{...r.camera}};
    };
  }

  function start(canvas,recipe){
    const r=new Core.LivingInkRenderer(canvas,{seed:recipe.seed||12345,style:recipe.style||{}});
    r.camera={x:0,y:1.54,z:-2.15,yaw:-.035,pitch:.018};
    r.illustrationMode=false;
    const input=installInteraction(r,canvas);
    let last=0,frames=0,startAt=performance.now(),frameTimes=[];
    function tick(t){
      const dt=Math.min(.033,last?(t-last)/1000:0);last=t;input(dt);
      const result=renderOffice(r,recipe,t);frames++;frameTimes.push(dt*1000);if(frameTimes.length>180)frameTimes.shift();
      const sorted=frameTimes.slice().sort((a,b)=>a-b),p95=sorted[Math.floor(sorted.length*.95)]||0,elapsed=Math.max(.001,(t-startAt)/1000);
      window.__livingInkMetrics={fps:frames/elapsed,p95FrameMs:p95,drawCalls:result.stats.drawCalls,primitives:result.stats.primitives,standalone:true,seed:recipe.seed};
      window.__livingInkScene=result;requestAnimationFrame(tick);
    }
    addEventListener('resize',()=>{r.resize();if(r.illustrationMode)Quality.applyIllustrationCamera(r,true);});requestAnimationFrame(tick);return r;
  }
  return {ACTIONS,personProfile,behaviorAt,renderOffice,installInteraction,start};
});
