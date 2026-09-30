(function(root,factory){
  const api=factory(root.LivingInkCore || (typeof require==='function'?require('./living-ink-core.js'):null));
  if(typeof module==='object'&&module.exports) module.exports=api;
  root.LivingInkOffice=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Core){
  'use strict';
  if(!Core) throw new Error('LivingInkCore is required');
  const {v,hash,clamp}=Core;
  const ACTIONS=['idle','walk','sit','type','coffee','talk','listen','meeting','whiteboard','printer','carry-folder','open-door','look-around'];

  function personProfile(seed,index=0){
    const s=seed+index*977;
    return {
      id:`employee-${index+1}`,seed:s,height:.90+hash(s,1)*.27,build:.82+hash(s,2)*.52,
      shoulders:.92+hash(s,3)*.18,legRatio:.94+hash(s,4)*.13,hair:Math.floor(hash(s,5)*5),
      gender:Math.floor(hash(s,6)*3),
      suit:['#506579','#667684','#756c66','#58695f','#445a70','#68717d'][Math.floor(hash(s,7)*6)],
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

  function lineBox(r,x1,x2,z1,z2,y,seed,alpha=.22){
    const p=[v(x1,y,z1),v(x2,y,z1),v(x2,y,z2),v(x1,y,z2)];
    for(let i=0;i<4;i++) r.line(p[i],p[(i+1)%4],{alpha,priority:1,seed:seed+i});
  }

  function architecture(r,seed){
    const ink=r.style.inkSoft,warm=r.style.warm;
    for(let z=1;z<=18;z+=1) r.line(v(-8,0,z),v(8,0,z),{width:.006,color:warm,alpha:.075,priority:2,seed:seed+z});
    for(let x=-8;x<=8;x+=1.6) r.line(v(x,0,1),v(x,0,18),{width:.005,color:warm,alpha:.055,priority:2,seed:seed+60+Math.round(x*10)});
    r.line(v(-8,3.25,2),v(8,3.25,2),{width:.008,color:ink,alpha:.20,priority:1,seed:seed+90});
    r.line(v(-8,0,2),v(-8,3.25,2),{alpha:.24,priority:1,seed:seed+91});
    r.line(v(8,0,2),v(8,3.25,2),{alpha:.24,priority:1,seed:seed+92});

    const rooms=[
      [-7.1,-2.1,5.4,9.2],[-1.7,2.8,6.7,10.3],[3.3,7.3,5.9,9.6]
    ];
    rooms.forEach((q,i)=>{
      const [x1,x2,z1,z2]=q;
      r.glass([v(x1,0,z1),v(x2,0,z1),v(x2,2.85,z1),v(x1,2.85,z1)],{seed:seed+110+i*20});
      r.line(v(x1,0,z1),v(x1,2.85,z1),{alpha:.28,priority:1,seed:seed+111+i*20});
      r.line(v(x2,0,z1),v(x2,2.85,z1),{alpha:.28,priority:1,seed:seed+112+i*20});
      r.line(v(x1,2.85,z1),v(x2,2.85,z1),{alpha:.22,priority:1,seed:seed+113+i*20});
      r.line(v(x2,0,z1),v(x2,2.85,z2),{alpha:.14,priority:1,seed:seed+114+i*20});
    });

    for(let i=0;i<5;i++){
      const x=-6.4+i*3.2,z=3.1+(i%2)*.6;
      r.line(v(x,3.25,z),v(x,2.78,z),{width:.008,alpha:.18,priority:1,seed:seed+200+i});
      r.blob(v(x,2.72,z),{radius:.18,stretch:.22,color:r.style.wash,alpha:.18,priority:1,seed:seed+210+i});
    }
    r.text(v(.45,2.36,6.66),'ASQURA',{size:.16,alpha:.52,priority:1});
    r.text(v(-5.35,2.15,5.35),'ASQURA',{size:.12,alpha:.36,priority:1});
  }

  function table(r,x,z,w,d,seed,y=.73){
    r.shadow(v(x,0,z),{rx:w*.52,ry:d*.22,alpha:.055,seed});
    r.poly([v(x-w/2,y,z-d/2),v(x+w/2,y,z-d/2),v(x+w/2,y,z+d/2),v(x-w/2,y,z+d/2)],
      {color:r.style.warm,alpha:.13,priority:1,seed});
    for(const sx of [-w*.42,w*.42]) for(const sz of [-d*.34,d*.34])
      r.line(v(x+sx,y,z+sz),v(x+sx,.03,z+sz),{alpha:.28,priority:1,seed:seed+20+Math.round((sx+sz)*10)});
  }

  function monitor(r,x,z,seed,scale=1){
    const w=.72*scale,h=.44*scale,y=.89;
    r.poly([v(x-w/2,y,z),v(x+w/2,y,z),v(x+w/2,y+h,z),v(x-w/2,y+h,z)],
      {color:r.style.screen,alpha:.58,priority:1,seed});
    const pts=[[x-w/2,y],[x+w/2,y],[x+w/2,y+h],[x-w/2,y+h]];
    for(let i=0;i<4;i++) r.line(v(pts[i][0],pts[i][1],z),v(pts[(i+1)%4][0],pts[(i+1)%4][1],z),
      {width:.008,alpha:.48,priority:1,seed:seed+i+1});
    r.line(v(x,y,z),v(x,.76,z),{alpha:.28,priority:1,seed:seed+7});
    r.text(v(x,y+h*.50,z-.008),'ASQURA',{size:.065*scale,alpha:.56,priority:0});
  }

  function chair(r,x,z,seed,rot=0){
    r.blob(v(x,.54,z),{radius:.24,stretch:1.32,color:'#8998a5',alpha:.13,priority:1,seed});
    r.line(v(x,.44,z),v(x,.10,z),{alpha:.27,priority:1,seed:seed+1});
    const ca=Math.cos(rot),sa=Math.sin(rot);
    r.line(v(x,.10,z),v(x-.24*ca,.025,z-.16*sa),{alpha:.22,priority:1,seed:seed+2});
    r.line(v(x,.10,z),v(x+.24*ca,.025,z+.16*sa),{alpha:.22,priority:1,seed:seed+3});
  }

  function deskStation(r,x,z,side,seed){
    table(r,x,z,1.55,.70,seed);
    const face=side<0?1:-1;
    monitor(r,x+face*.28,z,seed+30,.92);
    r.line(v(x-face*.18,.755,z-.19),v(x-face*.18,.755,z+.19),{width:.012,alpha:.24,priority:0,seed:seed+41});
    r.blob(v(x-face*.50,.79,z+.20),{radius:.035,stretch:1.1,color:r.style.wash,alpha:.20,priority:0,seed:seed+42});
    r.poly([v(x-.34,.765,z-.30),v(x+.02,.765,z-.30),v(x+.02,.765,z-.12),v(x-.34,.765,z-.12)],
      {color:r.style.wash,alpha:.09,priority:0,seed:seed+43});
  }

  function plant(r,x,z,seed,scale=1){
    r.poly([v(x-.18*scale,.02,z),v(x+.18*scale,.02,z),v(x+.14*scale,.30*scale,z),v(x-.14*scale,.30*scale,z)],
      {color:r.style.wash,alpha:.17,priority:1,seed});
    const stems=7;
    for(let i=0;i<stems;i++){
      const ang=(i/(stems-1)-.5)*1.4,tipX=x+Math.sin(ang)*.34*scale,tipY=.58*scale+Math.cos(ang)*.48*scale;
      r.line(v(x,.28*scale,z),v(tipX,tipY,z+(hash(seed,i,8)-.5)*.10),{width:.012,alpha:.28,priority:i<5?1:0,seed:seed+10+i});
      r.blob(v(tipX,tipY,z),{radius:.13*scale,stretch:.46,color:r.style.plant,alpha:.24,priority:i<5?1:0,seed:seed+30+i});
    }
  }

  function coffeePoint(r,x,z,seed){
    table(r,x,z,1.55,.72,seed,.72);
    r.poly([v(x-.30,.73,z-.03),v(x+.30,.73,z-.03),v(x+.30,1.28,z-.03),v(x-.30,1.28,z-.03)],
      {color:r.style.wash,alpha:.18,priority:1,seed:seed+1});
    r.line(v(x-.30,.73,z-.03),v(x-.30,1.28,z-.03),{alpha:.35,priority:1,seed:seed+2});
    r.line(v(x+.30,.73,z-.03),v(x+.30,1.28,z-.03),{alpha:.35,priority:1,seed:seed+3});
    r.blob(v(x,1.12,z-.04),{radius:.07,stretch:.55,color:r.style.ink,alpha:.25,priority:0,seed:seed+4});
    for(let i=0;i<3;i++) r.blob(v(x-.25+i*.24,.80,z-.20),{radius:.045,stretch:.72,color:r.style.warm,alpha:.28,priority:0,seed:seed+8+i});
    r.line(v(x-.52,1.48,z),v(x+.52,1.48,z),{alpha:.24,priority:1,seed:seed+15});
    for(let i=0;i<4;i++) r.blob(v(x-.37+i*.24,1.54,z-.01),{radius:.045,stretch:.74,color:r.style.wash,alpha:.20,priority:0,seed:seed+16+i});
  }

  function printer(r,x,z,seed){
    r.poly([v(x-.35,.46,z),v(x+.35,.46,z),v(x+.35,.92,z),v(x-.35,.92,z)],
      {color:r.style.wash,alpha:.14,priority:1,seed});
    r.line(v(x-.28,.72,z-.01),v(x+.28,.72,z-.01),{alpha:.30,priority:0,seed:seed+1});
    for(let i=0;i<3;i++) r.line(v(x-.24,.60-i*.07,z-.02),v(x+.24,.60-i*.07,z-.02),{alpha:.18,priority:0,seed:seed+3+i});
  }

  function meetingRoom(r,x,z,seed){
    table(r,x,z,2.15,.95,seed,.72);
    for(const dx of [-.78,-.26,.26,.78]) chair(r,x+dx,z+.72,seed+10+Math.round(dx*10));
    for(const dx of [-.62,.62]) chair(r,x+dx,z-.64,seed+30+Math.round(dx*10));
    r.poly([v(x-.62,1.22,z+.48),v(x+.62,1.22,z+.48),v(x+.62,2.02,z+.48),v(x-.62,2.02,z+.48)],
      {color:r.style.screen,alpha:.18,priority:1,seed:seed+50});
    r.line(v(x-.50,1.42,z+.46),v(x-.12,1.72,z+.46),{alpha:.26,priority:0,seed:seed+51});
    r.line(v(x-.12,1.72,z+.46),v(x+.18,1.51,z+.46),{alpha:.26,priority:0,seed:seed+52});
    r.line(v(x+.18,1.51,z+.46),v(x+.46,1.87,z+.46),{alpha:.26,priority:0,seed:seed+53});
  }

  function lounge(r,x,z,seed){
    r.shadow(v(x,0,z),{rx:1.25,ry:.28,alpha:.05,seed});
    r.poly([v(x-1.15,.08,z),v(x+1.15,.08,z),v(x+1.05,.52,z),v(x-1.05,.52,z)],
      {color:r.style.wash,alpha:.12,priority:1,seed});
    for(const dx of [-.68,0,.68]) r.blob(v(x+dx,.47,z),{radius:.34,stretch:.64,color:r.style.wash,alpha:.13,priority:1,seed:seed+4+Math.round(dx*10)});
    table(r,x+.10,z-.95,1.35,.62,seed+20,.40);
    r.blob(v(x-.20,.43,z-.95),{radius:.055,stretch:.78,color:r.style.warm,alpha:.24,priority:0,seed:seed+26});
  }

  function human(r,p,x,z,state,t,side=1,scale=1){
    const s=p.height*scale,build=p.build,anim=t*.001*(.90+hash(p.seed,30)*.45);
    const lod=Core.selectArtisticLod(Math.max(.1,z-r.camera.z));
    let px=x,pz=z,hip=.62*s,chest=1.02*s,head=1.38*s,arm=.0,leg=.0;
    if(state==='walk'){px+=Math.sin(anim*.72+p.seed)*.52; pz+=Math.sin(anim*.36+p.seed)*.05; arm=Math.sin(anim*3.0)*.16; leg=Math.sin(anim*3.0)*.17;}
    if(state==='sit'||state==='type'){hip*=.86;chest*=.94;head*=.95;}
    r.shadow(v(px,0,pz),{rx:.26*build,ry:.07,alpha:.065,seed:p.seed+90});
    if(lod===2){
      r.blob(v(px,chest*.92,pz),{radius:.15*build,stretch:1.75,color:p.suit,alpha:.34,priority:2,seed:p.seed});
      r.blob(v(px,head,pz),{radius:.085*s,stretch:1,color:r.style.ink,alpha:.46,priority:2,seed:p.seed+1});
      r.line(v(px,hip,pz),v(px-.09,.04,pz-.04),{width:.026,alpha:.36,priority:2,seed:p.seed+2});
      r.line(v(px,hip,pz),v(px+.10,.04,pz+.05),{width:.026,alpha:.36,priority:2,seed:p.seed+3});
      return;
    }

    const shoulder=.22*build*p.shoulders,waist=.15*build;
    r.poly([v(px-shoulder,chest+.08*s,pz),v(px+shoulder,chest+.08*s,pz),v(px+waist,.72*s,pz),v(px-waist,.72*s,pz)],
      {color:p.suit,alpha:.28,priority:1,seed:p.seed});
    r.poly([v(px-.105,chest+.03*s,pz-.01),v(px+.105,chest+.03*s,pz-.01),v(px+.055,.78*s,pz-.01),v(px-.055,.78*s,pz-.01)],
      {color:p.shirt,alpha:.22,priority:0,seed:p.seed+1});
    r.line(v(px-.09,chest+.05*s,pz-.02),v(px-.012,.80*s,pz-.02),{width:.010,alpha:.45,priority:0,seed:p.seed+2});
    r.line(v(px+.09,chest+.05*s,pz-.02),v(px+.012,.80*s,pz-.02),{width:.010,alpha:.45,priority:0,seed:p.seed+3});
    r.poly([v(px-.018,chest*.995,pz-.025),v(px+.018,chest*.995,pz-.025),v(px+.035,.82*s,pz-.025),v(px,.76*s,pz-.025),v(px-.035,.82*s,pz-.025)],
      {color:r.style.ink,alpha:.28,priority:0,seed:p.seed+4});

    r.blob(v(px,head,pz),{radius:.105*s,stretch:1.03,color:r.style.inkSoft,alpha:.42,priority:1,seed:p.seed+5});
    if(p.hair===0) r.blob(v(px,head+.075*s,pz-.01),{radius:.073*s,stretch:.72,color:r.style.ink,alpha:.46,priority:0,seed:p.seed+6});
    else if(p.hair===1) r.blob(v(px-.045*s,head+.045*s,pz-.01),{radius:.09*s,stretch:1.15,color:r.style.ink,alpha:.43,priority:0,seed:p.seed+7});
    else for(let i=0;i<3;i++) r.blob(v(px-.05*s+i*.045*s,head+.065*s+(i%2)*.015*s,pz-.01),{radius:.043*s,stretch:.78,color:r.style.ink,alpha:.42,priority:0,seed:p.seed+8+i});

    const shL=v(px-shoulder*.82,chest,pz),shR=v(px+shoulder*.82,chest,pz);
    let handL=v(px-.27+arm,.72*s,pz-.05),handR=v(px+.27-arm,.72*s,pz+.05);
    if(state==='type'){handL=v(px+side*.25,.76*s,pz-.16);handR=v(px+side*.29,.77*s,pz+.12);}
    if(state==='coffee'){handR=v(px+.17,.98*s,pz-.03);r.blob(v(handR.x+.035,handR.y+.02,handR.z),{radius:.035,stretch:1.0,color:r.style.warm,alpha:.30,priority:0,seed:p.seed+18});}
    r.line(shL,handL,{width:.029,alpha:.46,priority:1,seed:p.seed+20});r.line(shR,handR,{width:.029,alpha:.46,priority:1,seed:p.seed+21});

    const hipP=v(px,hip,pz),kL=v(px-.09,.37*s,pz-leg),kR=v(px+.10,.37*s,pz+leg),fL=v(px-.13,.04,pz-.07-leg),fR=v(px+.14,.04,pz+.08+leg);
    r.poly([v(px-.13,hip,pz),v(px-.015,hip,pz),v(kL.x+.045,kL.y,kL.z),v(kL.x-.055,kL.y,kL.z)],
      {color:p.suit,alpha:.20,priority:1,seed:p.seed+22});
    r.poly([v(px+.015,hip,pz),v(px+.13,hip,pz),v(kR.x+.055,kR.y,kR.z),v(kR.x-.045,kR.y,kR.z)],
      {color:p.suit,alpha:.20,priority:1,seed:p.seed+23});
    r.line(kL,fL,{width:.030,alpha:.43,priority:1,seed:p.seed+24});r.line(kR,fR,{width:.030,alpha:.43,priority:1,seed:p.seed+25});
    r.line(v(fL.x-.05,fL.y,fL.z),v(fL.x+.07,fL.y,fL.z),{width:.028,alpha:.46,priority:0,seed:p.seed+26});
    r.line(v(fR.x-.05,fR.y,fR.z),v(fR.x+.07,fR.y,fR.z),{width:.028,alpha:.46,priority:0,seed:p.seed+27});

    if(lod===0){
      if(p.accessory==='watch') r.blob(v(handL.x,handL.y,handL.z),{radius:.017,stretch:.45,color:r.style.ink,alpha:.55,priority:0,seed:p.seed+31});
      if(p.accessory==='badge') r.poly([v(px+.06,.99*s,pz-.025),v(px+.13,.99*s,pz-.025),v(px+.13,.92*s,pz-.025),v(px+.06,.92*s,pz-.025)],
        {color:r.style.screen,alpha:.38,priority:0,seed:p.seed+32});
      if((p.accessory==='briefcase'||p.accessory==='folder')&&state==='walk')
        r.poly([v(handR.x-.13,.47*s,pz-.03),v(handR.x+.13,.47*s,pz-.03),v(handR.x+.13,.25*s,pz-.03),v(handR.x-.13,.25*s,pz-.03)],
          {color:p.suit,alpha:.24,priority:0,seed:p.seed+33});
      if(p.accessory==='glasses'){
        r.line(v(px-.075,head+.01*s,pz-.03),v(px-.015,head+.01*s,pz-.03),{width:.006,alpha:.42,priority:0,seed:p.seed+34});
        r.line(v(px+.015,head+.01*s,pz-.03),v(px+.075,head+.01*s,pz-.03),{width:.006,alpha:.42,priority:0,seed:p.seed+35});
      }
    }
  }

  function renderOffice(r,recipe,t){
    const seed=recipe.seed||12345;
    r.begin();architecture(r,seed);

    lounge(r,-6.05,4.35,seed+300);
    meetingRoom(r,-4.55,7.45,seed+340);

    deskStation(r,-.65,5.05,1,seed+400);
    deskStation(r,1.20,5.20,-1,seed+420);
    deskStation(r,-.45,8.20,1,seed+440);
    deskStation(r,1.45,8.45,-1,seed+460);
    deskStation(r,4.30,5.15,1,seed+480);

    coffeePoint(r,5.95,7.80,seed+520);
    printer(r,6.65,6.35,seed+540);

    [[-7.25,5.35,1.1],[-2.1,6.2,.9],[2.65,6.05,.82],[3.15,9.0,.75],[7.0,8.85,.95],[.25,10.45,.65]]
      .forEach((p,i)=>plant(r,p[0],p[1],seed+580+i*11,p[2]));

    const people=Array.from({length:10},(_,i)=>personProfile(seed,i));
    human(r,people[0],-.95,5.00,'type',t,1,1.03);
    human(r,people[1],1.52,5.18,'sit',t,-1,.98);
    human(r,people[2],4.05,5.18,'type',t,1,1.02);
    human(r,people[3],5.55,7.72,'coffee',t,-1,.96);
    human(r,people[4],6.35,6.30,'printer',t,-1,.94);
    human(r,people[5],-4.85,7.35,'meeting',t,1,.90);
    human(r,people[6],-4.10,7.55,'meeting',t,-1,.87);
    human(r,people[7],-.15,8.18,'type',t,1,.82);
    human(r,people[8],1.67,8.42,'sit',t,-1,.80);
    human(r,people[9],.35,6.55,'walk',t,1,1.00);

    r.text(v(5.75,2.15,9.40),'ASQURA',{size:.13,alpha:.42,priority:1});
    const stats=r.end();
    return {
      stats,
      people:people.map(p=>({id:p.id,height:p.height,build:p.build,gender:p.gender,suit:p.suit,accessory:p.accessory})),
      actions:ACTIONS.slice(),
      lodLevels:['near-detail','medium-simplified','far-ink'],
      props:['desks','computers','chairs','plants','coffee-machine','printer','meeting-room','lounge','glass-walls','pendant-lights']
    };
  }

  function installInteraction(r,canvas){
    const keys=Object.create(null),pointer={down:false,x:0,y:0};
    addEventListener('keydown',e=>keys[e.key]=true);addEventListener('keyup',e=>keys[e.key]=false);
    canvas.addEventListener('pointerdown',e=>{pointer.down=true;pointer.x=e.clientX;pointer.y=e.clientY;canvas.setPointerCapture?.(e.pointerId);});
    canvas.addEventListener('pointerup',()=>pointer.down=false);canvas.addEventListener('pointercancel',()=>pointer.down=false);
    canvas.addEventListener('pointermove',e=>{
      if(!pointer.down)return;
      const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;pointer.x=e.clientX;pointer.y=e.clientY;
      r.camera.yaw=clamp(r.camera.yaw+dx*.0015,-.18,.18);
      r.camera.pitch=clamp(r.camera.pitch+dy*.0011,-.06,.16);
    },{passive:true});
    return function updateInput(dt){
      const f=(keys.w||keys.W||keys.ArrowUp?1:0)-(keys.s||keys.S||keys.ArrowDown?1:0);
      const s=(keys.d||keys.D?1:0)-(keys.a||keys.A?1:0),speed=1.15;
      const fx=Math.sin(r.camera.yaw),fz=Math.cos(r.camera.yaw),rx=Math.sin(r.camera.yaw+Math.PI/2),rz=Math.cos(r.camera.yaw+Math.PI/2);
      r.camera.x=clamp(r.camera.x+(fx*f+rx*s)*speed*dt,-2.2,2.2);
      r.camera.z=clamp(r.camera.z+(fz*f+rz*s)*speed*dt,-2.15,2.2);
    };
  }

  function start(canvas,recipe){
    const r=new Core.LivingInkRenderer(canvas,{seed:recipe.seed||12345,style:recipe.style||{}});
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
