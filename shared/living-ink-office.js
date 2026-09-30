(function(root,factory){
  const api=factory(root.LivingInkCore || (typeof require==='function'?require('./living-ink-core.js'):null));
  if(typeof module==='object'&&module.exports) module.exports=api;
  root.LivingInkOffice=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Core){
  'use strict';
  if(!Core) throw new Error('LivingInkCore is required');
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
    const faces=[
      [v(x0,y0,z0),v(x1,y0,z0),v(x1,y1,z0),v(x0,y1,z0)],
      [v(x1,y0,z0),v(x1,y0,z1),v(x1,y1,z1),v(x1,y1,z0)],
      [v(x1,y0,z1),v(x0,y0,z1),v(x0,y1,z1),v(x1,y1,z1)],
      [v(x0,y0,z1),v(x0,y0,z0),v(x0,y1,z0),v(x0,y1,z1)],
      [v(x0,y1,z0),v(x1,y1,z0),v(x1,y1,z1),v(x0,y1,z1)]
    ];
    faces.forEach((f,i)=>r.poly(f,{color:c,alpha:a*(i===4?1.15:1),priority:p,seed:seed+i}));
    const e=[
      [x0,y0,z0,x1,y0,z0],[x1,y0,z0,x1,y0,z1],[x1,y0,z1,x0,y0,z1],[x0,y0,z1,x0,y0,z0],
      [x0,y1,z0,x1,y1,z0],[x1,y1,z0,x1,y1,z1],[x1,y1,z1,x0,y1,z1],[x0,y1,z1,x0,y1,z0],
      [x0,y0,z0,x0,y1,z0],[x1,y0,z0,x1,y1,z0],[x1,y0,z1,x1,y1,z1],[x0,y0,z1,x0,y1,z1]
    ];
    if(opt.edges!==false) e.forEach((q,i)=>r.line(v(q[0],q[1],q[2]),v(q[3],q[4],q[5]),{width:.008,color:r.style.inkSoft,alpha:opt.edgeAlpha??.22,priority:p,seed:seed+20+i}));
  }

  function roomShell(r,z,seed,side){
    const cx=side*4.15,w=5.15,d=8.8,h=3.15;
    // floor volume
    box(r,cx,-.035,z,w,.07,d,{color:r.style.warm,alpha:.055,priority:2,seed:seed+1,edgeAlpha:.08});
    // outer wall and rear wall, leaving an open entry toward the corridor
    box(r,side*6.65,1.55,z,.06,3.10,d,{color:r.style.glass,alpha:.07,priority:1,seed:seed+2,edgeAlpha:.18});
    box(r,cx,1.55,z+d/2,.06,3.10,w,{color:r.style.glass,alpha:.06,priority:1,seed:seed+3,edgeAlpha:.16});
    // glass corridor facade with a wide central door opening
    const gx=side*1.58;
    box(r,gx,1.55,z-d*.31,.05,3.10,2.3,{color:r.style.glass,alpha:.08,priority:1,seed:seed+4,edgeAlpha:.18});
    box(r,gx,1.55,z+d*.31,.05,3.10,2.3,{color:r.style.glass,alpha:.08,priority:1,seed:seed+5,edgeAlpha:.18});
    r.text(v(cx,2.30,z+d*.36),'ASQURA',{size:.11,alpha:.34,priority:1});
  }

  function desk(r,x,z,rot,seed){
    box(r,x,.72,z,1.55,.10,.70,{color:r.style.warm,alpha:.12,priority:1,seed});
    const face=rot<0?-1:1;
    box(r,x+face*.28,1.10,z,.72,.46,.055,{color:r.style.screen,alpha:.36,priority:1,seed:seed+20});
    box(r,x+face*.28,.82,z,.06,.25,.06,{color:r.style.inkSoft,alpha:.10,priority:1,seed:seed+21});
    box(r,x-face*.18,.775,z,.48,.025,.22,{color:r.style.wash,alpha:.09,priority:0,seed:seed+22});
    r.blob(v(x-face*.52,.79,z+.21),{radius:.034,stretch:1.05,color:r.style.warm,alpha:.20,priority:0,seed:seed+23});
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
    const s=p.height*scale,build=p.build,anim=t*.001*(.90+hash(p.seed,30)*.45);
    let px=x,pz=z,hip=.62*s,chest=1.03*s,head=1.42*s,arm=0,leg=0;
    if(state==='walk'){px+=Math.sin(anim*.72+p.seed)*.45;pz+=Math.sin(anim*.36+p.seed)*.07;arm=Math.sin(anim*3.0)*.16;leg=Math.sin(anim*3.0)*.17;}
    if(state==='sit'||state==='type'){hip*=.86;chest*=.94;head*=.95;}
    r.shadow(v(px,0,pz),{rx:.25*build,ry:.07,alpha:.055,seed:p.seed+90});
    box(r,px,.86*s,pz,.33*build,.52*s,.20,{color:p.suit,alpha:.18,priority:1,seed:p.seed,edgeAlpha:.22});
    box(r,px,1.04*s,pz-.115,.20*build,.26*s,.025,{color:p.shirt,alpha:.18,priority:0,seed:p.seed+2,edgeAlpha:.16});
    r.blob(v(px,head,pz),{radius:.10*s,stretch:1.02,color:r.style.inkSoft,alpha:.38,priority:1,seed:p.seed+4});
    r.blob(v(px,head+.075*s,pz-.01),{radius:.073*s,stretch:.72+(p.hair%3)*.16,color:r.style.ink,alpha:.40,priority:0,seed:p.seed+5});

    const shL=v(px-.17*build,chest,pz),shR=v(px+.17*build,chest,pz);
    let handL=v(px-.28+arm,.72*s,pz-.05),handR=v(px+.28-arm,.72*s,pz+.05);
    if(state==='type'){handL=v(px+side*.25,.76*s,pz-.16);handR=v(px+side*.29,.77*s,pz+.12);}
    if(state==='coffee'){handR=v(px+.17,.98*s,pz-.03);r.blob(v(handR.x+.035,handR.y+.02,handR.z),{radius:.035,stretch:1,color:r.style.warm,alpha:.26,priority:0,seed:p.seed+18});}
    r.line(shL,handL,{width:.029,alpha:.43,priority:1,seed:p.seed+20});r.line(shR,handR,{width:.029,alpha:.43,priority:1,seed:p.seed+21});

    const kL=v(px-.09,.37*s,pz-leg),kR=v(px+.10,.37*s,pz+leg),fL=v(px-.13,.04,pz-.07-leg),fR=v(px+.14,.04,pz+.08+leg);
    r.line(v(px-.08,hip,pz),kL,{width:.035,alpha:.43,priority:1,seed:p.seed+22});r.line(kL,fL,{width:.030,alpha:.43,priority:1,seed:p.seed+23});
    r.line(v(px+.08,hip,pz),kR,{width:.035,alpha:.43,priority:1,seed:p.seed+24});r.line(kR,fR,{width:.030,alpha:.43,priority:1,seed:p.seed+25});
    if(p.accessory==='badge') box(r,px+.09,.96*s,pz-.13,.08,.07,.015,{color:r.style.screen,alpha:.23,priority:0,seed:p.seed+30,edges:false});
    if(p.accessory==='glasses'){
      r.line(v(px-.075,head+.01*s,pz-.11),v(px-.015,head+.01*s,pz-.11),{width:.006,alpha:.38,priority:0,seed:p.seed+31});
      r.line(v(px+.015,head+.01*s,pz-.11),v(px+.075,head+.01*s,pz-.11),{width:.006,alpha:.38,priority:0,seed:p.seed+32});
    }
    if((p.accessory==='briefcase'||p.accessory==='folder')&&state==='walk')
      box(r,handR.x,.36*s,pz-.03,.28,.24,.08,{color:p.suit,alpha:.15,priority:0,seed:p.seed+33});
  }

  function moduleAt(r,z,seed,t,people,startIndex){
    roomShell(r,z,seed,-1);roomShell(r,z,seed+200,1);
    // corridor floor and ceiling rhythm
    box(r,0,-.04,z,3.0,.06,9.4,{color:r.style.warm,alpha:.045,priority:2,seed:seed+300,edgeAlpha:.06});
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

    const slots=[
      [-4.75,z-1.82,'type',1,1.00],[-3.55,z+1.15,'sit',-1,.97],
      [4.0,z-1.25,'meeting',1,.94],[4.85,z-1.5,'talk',-1,.92],
      [-5.15,z+2.9,'coffee',1,.95],[.05,z-.8,'walk',1,1.03],
      [5.7,z+3.35,'printer',-1,.90],[3.8,z+2.55,'sit',1,.92]
    ];
    slots.forEach((q,i)=>{
      const p=people[(startIndex+i)%people.length];
      human(r,p,q[0],q[1],q[2],t,p.seed%2?1:-1,q[4]);
    });
  }

  function renderOffice(r,recipe,t){
    const seed=recipe.seed||12345;
    r.begin();
    const people=Array.from({length:24},(_,i)=>personProfile(seed,i));
    const moduleSize=10;
    const center=Math.floor((r.camera.z+2)/moduleSize);
    let rendered=0;
    for(let m=center-1;m<=center+4;m++){
      if(m<0) continue;
      moduleAt(r,5+m*moduleSize,seed+m*701,t,people,m*8);
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
      renderedModules:rendered,
      camera:{...r.camera}
    };
  }

  function ensureTouchHud(){
    if(typeof document==='undefined') return null;
    let hud=document.getElementById('living-ink-touch-hud');
    if(hud) return hud;
    hud=document.createElement('div');hud.id='living-ink-touch-hud';
    hud.innerHTML='<div class="li-stick li-left"><div class="li-knob"></div></div><div class="li-look">LOOK</div>';
    const style=document.createElement('style');
    style.textContent=`
      #living-ink-touch-hud{position:fixed;inset:0;pointer-events:none;z-index:8}
      .li-stick{position:absolute;left:max(20px,env(safe-area-inset-left));bottom:max(28px,env(safe-area-inset-bottom));width:118px;height:118px;border:1px solid rgba(49,72,95,.20);border-radius:50%;background:rgba(248,245,239,.18);box-shadow:inset 0 0 28px rgba(49,72,95,.04)}
      .li-knob{position:absolute;left:39px;top:39px;width:40px;height:40px;border-radius:50%;border:1px solid rgba(49,72,95,.27);background:rgba(248,245,239,.42);transform:translate(0,0)}
      .li-look{position:absolute;right:max(18px,env(safe-area-inset-right));bottom:max(39px,env(safe-area-inset-bottom));font:700 9px system-ui;letter-spacing:.12em;color:rgba(49,72,95,.22)}
      @media (pointer:fine){#living-ink-touch-hud{display:none}}
    `;
    document.head.appendChild(style);document.body.appendChild(hud);return hud;
  }

  function installInteraction(r,canvas){
    const keys=Object.create(null),active=new Map(),move={x:0,y:0},hud=ensureTouchHud();
    const knob=()=>hud?.querySelector('.li-knob');
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
    r.camera={x:0,y:1.58,z:-2.15,yaw:0,pitch:.035};
    const input=installInteraction(r,canvas);
    let last=0,frames=0,startAt=performance.now(),frameTimes=[];
    function tick(t){
      const dt=Math.min(.033,last?(t-last)/1000:0);last=t;input(dt);
      const result=renderOffice(r,recipe,t);frames++;frameTimes.push(dt*1000);if(frameTimes.length>180)frameTimes.shift();
      const sorted=frameTimes.slice().sort((a,b)=>a-b),p95=sorted[Math.floor(sorted.length*.95)]||0,elapsed=Math.max(.001,(t-startAt)/1000);
      window.__livingInkMetrics={fps:frames/elapsed,p95FrameMs:p95,drawCalls:result.stats.drawCalls,primitives:result.stats.primitives,standalone:true,seed:recipe.seed};
      window.__livingInkScene=result;requestAnimationFrame(tick);
    }
    addEventListener('resize',()=>r.resize());requestAnimationFrame(tick);return r;
  }
  return {ACTIONS,personProfile,behaviorAt,renderOffice,installInteraction,start};
});
