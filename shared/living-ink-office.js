(function(root,factory){
  const api=factory(root.LivingInkCore || (typeof require==='function'?require('./living-ink-core.js'):null));
  if(typeof module==='object'&&module.exports) module.exports=api;
  root.LivingInkOffice=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Core){
  'use strict';
  if(!Core) throw new Error('LivingInkCore is required');
  const {v,hash,clamp,TAU}=Core;
  const ACTIONS=['idle','walk','sit','type','coffee','talk','listen','meeting','whiteboard','printer','carry-folder','open-door','look-around'];
  function personProfile(seed,index=0){
    const s=seed+index*977;
    return {
      id:`employee-${index+1}`, seed:s,
      height:.90+hash(s,1)*.27, build:.82+hash(s,2)*.58, shoulders:.9+hash(s,3)*.22,
      legRatio:.92+hash(s,4)*.15, hair:Math.floor(hash(s,5)*5), gender:Math.floor(hash(s,6)*3),
      suit:['#4d6176','#647280','#746961','#53635d','#43566c'][Math.floor(hash(s,7)*5)],
      shirt:['#eef1f1','#f2eee7','#e7ecef','#ece8e1'][Math.floor(hash(s,8)*4)],
      accessory:['watch','glasses','badge','briefcase'][Math.floor(hash(s,9)*4)]
    };
  }
  function behaviorAt(seed,t,phase=0){
    const cycle=[['type',9],['walk',4],['coffee',5],['walk',4],['sit',4],['type',8],['talk',5]];
    const total=cycle.reduce((n,x)=>n+x[1],0),time=((t*.001)+phase+hash(seed,22)*5)%total;
    let a=0; for(const [state,d] of cycle){if(time<a+d)return {state,local:(time-a)/d};a+=d;} return {state:'idle',local:0};
  }
  function floorAndRoom(r,seed){
    const ink=r.style.ink,warm=r.style.warm;
    for(let z=1;z<=16;z+=1) r.line(v(-6.6,0,z),v(6.6,0,z),{width:.006,color:warm,alpha:.09,priority:2,seed:seed+z});
    for(let x=-6;x<=6;x+=2) r.line(v(x,0,1),v(x,0,16),{width:.006,color:warm,alpha:.08,priority:2,seed:seed+50+x});
    r.line(v(-6.6,0,2),v(-6.6,3,2),{alpha:.22,seed:seed+61}); r.line(v(6.6,0,2),v(6.6,3,2),{alpha:.22,seed:seed+62});
    r.line(v(-6.6,3,2),v(6.6,3,2),{alpha:.18,seed:seed+63});
    r.glass([v(-2.2,0,7.1),v(2.2,0,7.1),v(2.2,2.7,7.1),v(-2.2,2.7,7.1)],{seed:seed+70});
    r.line(v(-2.2,0,7.1),v(-2.2,2.7,7.1),{alpha:.25,priority:1,seed:seed+71});
    r.text(v(0,2.16,7.08),'ASQURA',{size:.16,alpha:.55,priority:1});
  }
  function desk(r,x,z,side,seed){
    const w=1.65,d=.72,y=.74,face=side<0?1:-1;
    r.shadow(v(x,0,z),{rx:.9,ry:.16,alpha:.06,seed});
    r.poly([v(x-w/2,y,z-d/2),v(x+w/2,y,z-d/2),v(x+w/2,y,z+d/2),v(x-w/2,y,z+d/2)],{color:r.style.warm,alpha:.13,priority:1,seed});
    for(const sx of [-.7,.7]) for(const sz of [-.26,.26]) r.line(v(x+sx,y,z+sz),v(x+sx,.02,z+sz),{alpha:.3,seed:seed+10+sx*4+sz*9});
    const mx=x+face*.34,mz=z,mw=.76,mh=.48;
    r.poly([v(mx-mw/2,.88,mz),v(mx+mw/2,.88,mz),v(mx+mw/2,1.36,mz),v(mx-mw/2,1.36,mz)],{color:r.style.screen,alpha:.58,priority:1,seed:seed+20});
    r.line(v(mx-mw/2,.88,mz),v(mx+mw/2,.88,mz),{alpha:.55,priority:1,seed:seed+21});
    r.line(v(mx+mw/2,.88,mz),v(mx+mw/2,1.36,mz),{alpha:.55,priority:1,seed:seed+22});
    r.line(v(mx+mw/2,1.36,mz),v(mx-mw/2,1.36,mz),{alpha:.55,priority:1,seed:seed+23});
    r.line(v(mx-mw/2,1.36,mz),v(mx-mw/2,.88,mz),{alpha:.55,priority:1,seed:seed+24});
    r.line(v(mx,1.12,mz),v(mx,.76,mz),{alpha:.32,priority:1,seed:seed+25});
    r.text(v(mx,1.12,mz-.005),'ASQURA',{size:.08,alpha:.72,priority:1});
    r.line(v(x-face*.16,.765,z-.20),v(x-face*.16,.765,z+.20),{width:.012,alpha:.28,priority:1,seed:seed+27});
    r.blob(v(x-face*.53,.80,z+.22),{radius:.035,stretch:1.2,color:r.style.wash,alpha:.18,priority:1,seed:seed+28});
  }
  function plant(r,x,z,seed){
    r.poly([v(x-.2,.02,z),v(x+.2,.02,z),v(x+.15,.32,z),v(x-.15,.32,z)],{color:r.style.wash,alpha:.15,priority:1,seed});
    r.line(v(x,.32,z),v(x,.96,z),{width:.015,alpha:.28,priority:1,seed:seed+1});
    for(let i=0;i<5;i++) r.blob(v(x+(hash(seed,i)-.5)*.45,.64+i*.1,z+(hash(seed,i,2)-.5)*.12),{radius:.11,stretch:.5,color:r.style.plant,alpha:.22,priority:i<3?1:0,seed:seed+5+i});
  }
  function coffeeMachine(r,x,z,seed){
    r.shadow(v(x,0,z),{rx:.4,ry:.09,alpha:.05,seed});
    r.poly([v(x-.32,.72,z),v(x+.32,.72,z),v(x+.32,1.32,z),v(x-.32,1.32,z)],{color:r.style.wash,alpha:.18,priority:1,seed});
    r.line(v(x-.32,.72,z),v(x-.32,1.32,z),{alpha:.36,priority:1,seed:seed+1});
    r.line(v(x+.32,.72,z),v(x+.32,1.32,z),{alpha:.36,priority:1,seed:seed+2});
    r.blob(v(x,1.16,z-.01),{radius:.07,stretch:.55,color:r.style.ink,alpha:.26,priority:0,seed:seed+3});
    r.line(v(x-.12,.92,z-.02),v(x+.12,.92,z-.02),{alpha:.36,priority:0,seed:seed+4});
    r.blob(v(x,.80,z-.02),{radius:.05,stretch:.65,color:'#a99a8c',alpha:.25,priority:0,seed:seed+5});
  }
  function chair(r,x,z,seed){
    r.blob(v(x,.56,z),{radius:.26,stretch:1.35,color:'#8998a5',alpha:.12,priority:1,seed});
    r.line(v(x,.47,z),v(x,.08,z),{alpha:.3,priority:1,seed:seed+1});
    r.line(v(x,.08,z),v(x-.25,.02,z-.14),{alpha:.24,priority:1,seed:seed+2});
    r.line(v(x,.08,z),v(x+.25,.02,z+.14),{alpha:.24,priority:1,seed:seed+3});
  }
  function human(r,p,x,z,state,t,side=1){
    const lod=Core.selectArtisticLod(Math.max(.1,z-r.camera.z)),s=p.height,build=p.build,anim=t*.001*(.9+hash(p.seed,30)*.5);
    let px=x,pz=z,hip=.63*s,chest=1.02*s,head=1.35*s,lean=0,armSwing=0,legSwing=0;
    if(state==='walk'){px+=Math.sin(anim*.85+p.seed)*.62; pz+=Math.sin(anim*.43+p.seed)*.08; armSwing=Math.sin(anim*3.1)*.20;legSwing=Math.sin(anim*3.1)*.20;}
    if(state==='sit'||state==='type'){hip*=.88;chest*=.93;head*=.94;lean=.025*side;}
    if(state==='coffee') armSwing=.16+Math.sin(anim*2)*.03;
    r.shadow(v(px,0,pz),{rx:.28*build,ry:.07,alpha:.07,seed:p.seed+90});
    if(lod===2){
      r.blob(v(px,chest*.95,pz),{radius:.15*build,stretch:1.7,color:p.suit,alpha:.32,priority:2,seed:p.seed});
      r.blob(v(px,head,pz),{radius:.085*s,stretch:1,color:r.style.ink,alpha:.44,priority:2,seed:p.seed+1});
      r.line(v(px,hip,pz),v(px-.09,.04,pz-.05),{width:.026,alpha:.34,priority:2,seed:p.seed+2});
      r.line(v(px,hip,pz),v(px+.10,.04,pz+.05),{width:.026,alpha:.34,priority:2,seed:p.seed+3});
      return;
    }
    const torso=.19*build*p.shoulders;
    r.blob(v(px+lean,chest*.94,pz),{radius:torso,stretch:1.58,color:p.suit,alpha:.42,priority:1,seed:p.seed});
    r.blob(v(px+lean*.5,chest*1.01,pz-.005),{radius:torso*.60,stretch:.92,color:p.shirt,alpha:.18,priority:0,seed:p.seed+1});
    r.blob(v(px,head,pz),{radius:.105*s,stretch:1.03,color:r.style.ink,alpha:.54,priority:1,seed:p.seed+2});
    if(p.hair===0) r.blob(v(px,head+.075,pz-.01),{radius:.07*s,stretch:.9,color:r.style.ink,alpha:.45,priority:0,seed:p.seed+3});
    else if(p.hair===1) r.blob(v(px-.045,head+.035,pz-.01),{radius:.09*s,stretch:1.22,color:r.style.ink,alpha:.40,priority:0,seed:p.seed+4});
    else for(let i=0;i<3;i++) r.blob(v(px-.05+i*.045,head+.065+(i%2)*.018,pz-.01),{radius:.043*s,stretch:.8,color:r.style.ink,alpha:.38,priority:0,seed:p.seed+5+i});
    const shoulderL=v(px-torso*.75,chest,pz),shoulderR=v(px+torso*.75,chest,pz),hipP=v(px,hip,pz);
    let handL=v(px-.26+armSwing,.72*s,pz-.06),handR=v(px+.26-armSwing,.72*s,pz+.06);
    if(state==='type'){handL=v(px+side*.28,.75*s,pz-.16);handR=v(px+side*.30,.76*s,pz+.14);}
    if(state==='coffee'){handR=v(px+.18,.98*s,pz-.04); r.blob(v(handR.x+.035,handR.y+.02,handR.z),{radius:.035,stretch:1.05,color:r.style.warm,alpha:.28,priority:0,seed:p.seed+12});}
    r.line(shoulderL,handL,{width:.032,alpha:.48,priority:1,seed:p.seed+20}); r.line(shoulderR,handR,{width:.032,alpha:.48,priority:1,seed:p.seed+21});
    const kneeL=v(px-.09,.36*s,pz-legSwing),kneeR=v(px+.10,.36*s,pz+legSwing);
    const footL=v(px-.12,.04,pz-.08-legSwing),footR=v(px+.14,.04,pz+.08+legSwing);
    r.line(hipP,kneeL,{width:.035,alpha:.45,priority:1,seed:p.seed+22});r.line(kneeL,footL,{width:.031,alpha:.45,priority:1,seed:p.seed+23});
    r.line(hipP,kneeR,{width:.035,alpha:.45,priority:1,seed:p.seed+24});r.line(kneeR,footR,{width:.031,alpha:.45,priority:1,seed:p.seed+25});
    if(lod===0){
      r.line(v(px-.09,chest*1.04,pz-.012),v(px-.015,.80*s,pz-.015),{width:.012,alpha:.5,priority:0,seed:p.seed+31});
      r.line(v(px+.09,chest*1.04,pz-.012),v(px+.015,.80*s,pz-.015),{width:.012,alpha:.5,priority:0,seed:p.seed+32});
      r.line(v(px,.98*s,pz-.018),v(px,.82*s,pz-.02),{width:.014,alpha:.55,priority:0,seed:p.seed+33});
      if(p.accessory==='watch') r.blob(v(handL.x,handL.y,handL.z),{radius:.018,stretch:.45,color:r.style.ink,alpha:.55,priority:0,seed:p.seed+34});
      if(p.accessory==='badge') r.poly([v(px+.06,.99*s,pz-.02),v(px+.13,.99*s,pz-.02),v(px+.13,.92*s,pz-.02),v(px+.06,.92*s,pz-.02)],{color:r.style.screen,alpha:.34,priority:0,seed:p.seed+35});
      if(p.accessory==='briefcase'&&state==='walk'){
        r.poly([v(handR.x-.12,.45*s,pz-.03),v(handR.x+.12,.45*s,pz-.03),v(handR.x+.12,.24*s,pz-.03),v(handR.x-.12,.24*s,pz-.03)],{color:p.suit,alpha:.22,priority:0,seed:p.seed+36});
      }
    }
  }
  function renderOffice(r,recipe,t){
    const seed=recipe.seed||12345;r.begin();floorAndRoom(r,seed);
    desk(r,-3.45,5.0,1,seed+101);desk(r,3.35,5.25,-1,seed+102);chair(r,-4.05,5.0,seed+110);chair(r,4.0,5.25,seed+111);
    plant(r,-5.6,6.15,seed+120);plant(r,5.5,6.6,seed+121);coffeeMachine(r,4.75,8.65,seed+130);
    r.poly([v(4.2,.72,8.35),v(5.35,.72,8.35),v(5.35,.72,9.02),v(4.2,.72,9.02)],{color:r.style.warm,alpha:.11,priority:1,seed:seed+140});
    const people=(recipe.characters||[0,1,2]).map((_,i)=>personProfile(seed,i));
    const b0=behaviorAt(people[0].seed,t,0),b1=behaviorAt(people[1].seed,t,7),b2=behaviorAt(people[2].seed,t,14);
    human(r,people[0],-4.02,5.0,b0.state==='walk'?'walk':'type',t,1);
    human(r,people[1],b1.state==='coffee'?4.38:.35,b1.state==='coffee'?8.45:6.55,b1.state==='coffee'?'coffee':'walk',t,-1);
    human(r,people[2],3.95,5.28,b2.state==='walk'?'walk':'sit',t,-1);
    r.text(v(-5.4,2.15,9.4),'ASQURA',{size:.15,alpha:.5,priority:1});
    const stats=r.end();
    return {stats,people:people.map(p=>({id:p.id,height:p.height,build:p.build,gender:p.gender,suit:p.suit,accessory:p.accessory})),actions:ACTIONS.slice(),lodLevels:['near-detail','medium-simplified','far-ink']};
  }
  function installInteraction(r,canvas){
    const keys=Object.create(null),pointer={down:false,x:0,y:0};
    addEventListener('keydown',e=>keys[e.key]=true);addEventListener('keyup',e=>keys[e.key]=false);
    canvas.addEventListener('pointerdown',e=>{pointer.down=true;pointer.x=e.clientX;pointer.y=e.clientY;canvas.setPointerCapture?.(e.pointerId);});
    canvas.addEventListener('pointerup',()=>pointer.down=false);canvas.addEventListener('pointercancel',()=>pointer.down=false);
    canvas.addEventListener('pointermove',e=>{if(!pointer.down)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;pointer.x=e.clientX;pointer.y=e.clientY;r.camera.yaw+=dx*.0022;r.camera.pitch=clamp(r.camera.pitch+dy*.0014,-.13,.2);},{passive:true});
    return function updateInput(dt){
      const f=(keys.w||keys.W||keys.ArrowUp?1:0)-(keys.s||keys.S||keys.ArrowDown?1:0),s=(keys.d||keys.D?1:0)-(keys.a||keys.A?1:0),speed=1.5;
      const fx=Math.sin(r.camera.yaw),fz=Math.cos(r.camera.yaw),rx=Math.sin(r.camera.yaw+Math.PI/2),rz=Math.cos(r.camera.yaw+Math.PI/2);
      r.camera.x=clamp(r.camera.x+(fx*f+rx*s)*speed*dt,-4.8,4.8);r.camera.z=clamp(r.camera.z+(fz*f+rz*s)*speed*dt,-1.8,5.2);
    };
  }
  function start(canvas,recipe){
    const r=new Core.LivingInkRenderer(canvas,{seed:recipe.seed||12345,style:recipe.style||{}}),input=installInteraction(r,canvas);let last=0,frames=0,startAt=performance.now(),frameTimes=[];
    function tick(t){const dt=Math.min(.033,last?(t-last)/1000:0);last=t;input(dt);const result=renderOffice(r,recipe,t);frames++;frameTimes.push(dt*1000);if(frameTimes.length>240)frameTimes.shift();
      const sorted=frameTimes.slice().sort((a,b)=>a-b),p95=sorted[Math.floor(sorted.length*.95)]||0,elapsed=Math.max(.001,(t-startAt)/1000);
      window.__livingInkMetrics={fps:frames/elapsed,p95FrameMs:p95,drawCalls:result.stats.drawCalls,primitives:result.stats.primitives,standalone:true,seed:recipe.seed};
      window.__livingInkScene=result;requestAnimationFrame(tick);}
    addEventListener('resize',()=>r.resize());requestAnimationFrame(tick);return r;
  }
  return {ACTIONS,personProfile,behaviorAt,renderOffice,installInteraction,start};
});
