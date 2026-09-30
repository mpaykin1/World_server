(function(root,factory){
  const api=factory(root.LivingInkCore || (typeof require==='function'?require('./living-ink-core.js'):null));
  if(typeof module==='object'&&module.exports) module.exports=api;
  root.LivingInkQuality=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Core){
  'use strict';
  if(!Core) throw new Error('LivingInkCore is required');
  const {v,hash,clamp,selectArtisticLod}=Core;

  const SYSTEMS=[
    'volumetric-human-silhouette',
    'architectural-glass-partitions',
    'tonal-hierarchy',
    'watercolor-mass-layer',
    'semantic-prop-density',
    'contact-shadow-grounding',
    'artistic-lod-2',
    'shot-aware-composition',
    'behavioral-scene-direction',
    'dual-mode-camera'
  ];

  function projected(r,p){return r.project(p);}
  function detailBudget(r,p,importance=1){
    const q=projected(r,p); if(!q)return {lod:3,detail:0,alpha:0};
    const lod=selectArtisticLod(q.z,10.5,22);
    const dx=Math.abs(q.x-r.W*.5)/(r.W*.5||1),dy=Math.abs(q.y-r.H*.49)/(r.H*.55||1);
    const focal=clamp(1-Math.hypot(dx*.72,dy*.55),.22,1);
    const distance=clamp(1-(q.z-5)/38,.18,1);
    return {lod,detail:clamp((1-lod*.30)*distance*(.72+.28*focal)*importance,.08,1),alpha:clamp((.55+.45*focal)*distance,.18,1),z:q.z};
  }

  function watercolorMass(r,p,rx,ry,color,alpha,seed,importance=1){
    const b=detailBudget(r,p,importance); if(b.detail<.12)return;
    r.wash(p,{rx,ry,color,alpha:alpha*b.alpha,priority:b.lod===2?2:1,seed,blur:b.lod===0?11:7});
  }

  function ground(r,p,rx,ry,seed,importance=1){
    const b=detailBudget(r,p,importance); if(b.detail<.08)return;
    r.shadow(p,{rx,ry,alpha:.14*b.alpha,seed});
    if(b.lod===0) r.wash(v(p.x,.012,p.z),{rx:rx*.88,ry:ry*.75,color:r.style.warm,alpha:.055*b.alpha,priority:1,seed:seed+1,blur:7});
  }

  function glassPartition(r,{x,z,w=3.2,h=2.75,axis='x',seed=1,label='',doorGap=.9}){
    const near=detailBudget(r,v(x,1.3,z),1.15),frame=r.style.inkSoft,glass=r.style.glass;
    const panels=Math.max(2,Math.round(w/1.15)),half=w/2,gap=doorGap/2;
    watercolorMass(r,v(x,1.25,z),axis==='x'?w*.52:.12,axis==='x'?.45:h*.10,glass,.08,seed+2,1.2);
    for(let i=0;i<=panels;i++){
      const t=-half+w*i/panels;
      if(Math.abs(t)<gap*.78)continue;
      if(axis==='x') r.line(v(x+t,0,z),v(x+t,h,z),{width:.010,color:frame,alpha:.33*near.alpha,priority:1,seed:seed+10+i});
      else r.line(v(x,0,z+t),v(x,h,z+t),{width:.010,color:frame,alpha:.33*near.alpha,priority:1,seed:seed+10+i});
    }
    if(axis==='x'){
      r.line(v(x-half,0,z),v(x+half,0,z),{width:.009,color:frame,alpha:.21,priority:1,seed:seed+30});
      r.line(v(x-half,h,z),v(x+half,h,z),{width:.009,color:frame,alpha:.31,priority:1,seed:seed+31});
      r.line(v(x-half,0,z),v(x-half,h,z),{width:.009,color:frame,alpha:.28,priority:1,seed:seed+32});
      r.line(v(x+half,0,z),v(x+half,h,z),{width:.009,color:frame,alpha:.28,priority:1,seed:seed+33});
      r.line(v(x-gap,0,z-.012),v(x-gap,2.15,z-.012),{width:.012,color:frame,alpha:.42,priority:0,seed:seed+34});
      r.line(v(x+gap,0,z-.012),v(x+gap,2.15,z-.012),{width:.012,color:frame,alpha:.42,priority:0,seed:seed+35});
    }
    if(label) r.text(v(x,h*.75,z-.02),label,{size:.10,alpha:.36*near.alpha,priority:1});
  }

  function humanSilhouette(r,p,x,z,state,t,side=1,scale=1){
    const s=p.height*scale,build=p.build,anim=t*.001*(.92+hash(p.seed,30)*.42);
    let px=x,pz=z,hip=.64*s,waist=.84*s,chest=1.06*s,head=1.43*s,armSwing=0,legSwing=0,lean=0;
    if(state==='walk'){px+=Math.sin(anim*.72+p.seed)*.42;pz+=Math.sin(anim*.34+p.seed)*.065;armSwing=Math.sin(anim*3.15)*.18;legSwing=Math.sin(anim*3.15)*.17;lean=.025*side;}
    if(state==='sit'||state==='type'){hip*=.86;waist*=.90;chest*=.94;head*=.95;lean=.035*side;}
    const b=detailBudget(r,v(px,chest,pz),1.22);
    if(!b.detail)return;

    ground(r,v(px,0,pz),.29*build,.085,p.seed+90,1.2);
    watercolorMass(r,v(px,.88*s,pz),.23*build,.43*s,p.suit,.115,p.seed+80,1.25);

    if(b.lod===2){
      r.blob(v(px,chest*.94,pz),{radius:.155*build,stretch:1.72,color:p.suit,alpha:.46*b.alpha,priority:2,seed:p.seed});
      r.blob(v(px,head,pz),{radius:.082*s,stretch:1,color:r.style.inkSoft,alpha:.52*b.alpha,priority:2,seed:p.seed+1});
      r.line(v(px,hip,pz),v(px-.09,.04,pz-.04),{width:.028,alpha:.42*b.alpha,priority:2,seed:p.seed+2});
      r.line(v(px,hip,pz),v(px+.10,.04,pz+.05),{width:.028,alpha:.42*b.alpha,priority:2,seed:p.seed+3});
      return;
    }

    const shoulder=.23*build*p.shoulders,wa=.145*build;
    const jacket=[v(px-shoulder+lean,chest+.08*s,pz),v(px+shoulder+lean,chest+.08*s,pz),v(px+wa,waist-.10*s,pz),v(px-wa,waist-.10*s,pz)];
    r.poly(jacket,{color:p.suit,alpha:.32*b.alpha,priority:1,seed:p.seed});
    r.poly([v(px-.11+lean,chest+.03*s,pz-.012),v(px+.11+lean,chest+.03*s,pz-.012),v(px+.05,waist-.08*s,pz-.012),v(px-.05,waist-.08*s,pz-.012)],
      {color:p.shirt,alpha:.25*b.alpha,priority:0,seed:p.seed+1});
    r.line(v(px-.10+lean,chest+.05*s,pz-.018),v(px-.012,waist-.10*s,pz-.018),{width:.011,alpha:.55*b.alpha,priority:0,seed:p.seed+2});
    r.line(v(px+.10+lean,chest+.05*s,pz-.018),v(px+.012,waist-.10*s,pz-.018),{width:.011,alpha:.55*b.alpha,priority:0,seed:p.seed+3});
    r.poly([v(px-.018,chest*.99,pz-.024),v(px+.018,chest*.99,pz-.024),v(px+.035,waist-.02*s,pz-.024),v(px,waist-.11*s,pz-.024),v(px-.035,waist-.02*s,pz-.024)],
      {color:r.style.ink,alpha:.34*b.alpha,priority:0,seed:p.seed+4});

    r.blob(v(px,head,pz),{radius:.103*s,stretch:1.05,color:r.style.inkSoft,alpha:.48*b.alpha,priority:1,seed:p.seed+5});
    const hairStretch=[.72,1.08,.88,1.24,.80][p.hair%5];
    r.blob(v(px-(p.hair===1?.035:0),head+.073*s,pz-.008),{radius:.078*s,stretch:hairStretch,color:r.style.ink,alpha:.50*b.alpha,priority:0,seed:p.seed+6});
    if(b.lod===0){
      r.line(v(px-.028,head-.015*s,pz-.105),v(px-.010,head-.015*s,pz-.105),{width:.004,alpha:.28*b.alpha,priority:0,seed:p.seed+7});
      r.line(v(px+.010,head-.015*s,pz-.105),v(px+.028,head-.015*s,pz-.105),{width:.004,alpha:.28*b.alpha,priority:0,seed:p.seed+8});
    }

    const shL=v(px-shoulder*.82+lean,chest,pz),shR=v(px+shoulder*.82+lean,chest,pz);
    let handL=v(px-.29+armSwing,.73*s,pz-.055),handR=v(px+.29-armSwing,.73*s,pz+.055);
    if(state==='type'){handL=v(px+side*.23,.77*s,pz-.17);handR=v(px+side*.30,.78*s,pz+.12);}
    if(state==='coffee'){handR=v(px+.17,.99*s,pz-.04);r.blob(v(handR.x+.035,handR.y+.02,handR.z),{radius:.036,stretch:1,color:r.style.warm,alpha:.34*b.alpha,priority:0,seed:p.seed+18});}
    r.line(shL,handL,{width:.032,alpha:.52*b.alpha,priority:1,seed:p.seed+20});r.line(shR,handR,{width:.032,alpha:.52*b.alpha,priority:1,seed:p.seed+21});

    const kL=v(px-.09,.38*s,pz-legSwing),kR=v(px+.10,.38*s,pz+legSwing);
    const fL=v(px-.13,.04,pz-.075-legSwing),fR=v(px+.14,.04,pz+.085+legSwing);
    r.poly([v(px-.13,hip,pz),v(px-.015,hip,pz),v(kL.x+.045,kL.y,kL.z),v(kL.x-.055,kL.y,kL.z)],{color:p.suit,alpha:.25*b.alpha,priority:1,seed:p.seed+22});
    r.poly([v(px+.015,hip,pz),v(px+.13,hip,pz),v(kR.x+.055,kR.y,kR.z),v(kR.x-.045,kR.y,kR.z)],{color:p.suit,alpha:.25*b.alpha,priority:1,seed:p.seed+23});
    r.line(kL,fL,{width:.032,alpha:.49*b.alpha,priority:1,seed:p.seed+24});r.line(kR,fR,{width:.032,alpha:.49*b.alpha,priority:1,seed:p.seed+25});
    r.line(v(fL.x-.055,fL.y,fL.z),v(fL.x+.075,fL.y,fL.z),{width:.028,alpha:.52*b.alpha,priority:0,seed:p.seed+26});
    r.line(v(fR.x-.055,fR.y,fR.z),v(fR.x+.075,fR.y,fR.z),{width:.028,alpha:.52*b.alpha,priority:0,seed:p.seed+27});

    if(b.lod===0){
      if(p.accessory==='watch') r.blob(handL,{radius:.017,stretch:.45,color:r.style.ink,alpha:.58*b.alpha,priority:0,seed:p.seed+31});
      if(p.accessory==='badge') r.poly([v(px+.055,.99*s,pz-.025),v(px+.13,.99*s,pz-.025),v(px+.13,.915*s,pz-.025),v(px+.055,.915*s,pz-.025)],
        {color:r.style.screen,alpha:.40*b.alpha,priority:0,seed:p.seed+32});
      if(p.accessory==='glasses'){
        r.line(v(px-.075,head+.01*s,pz-.105),v(px-.015,head+.01*s,pz-.105),{width:.006,alpha:.47*b.alpha,priority:0,seed:p.seed+33});
        r.line(v(px+.015,head+.01*s,pz-.105),v(px+.075,head+.01*s,pz-.105),{width:.006,alpha:.47*b.alpha,priority:0,seed:p.seed+34});
      }
    }
  }

  function propScatter(r,x,z,seed,side=1){
    const b=detailBudget(r,v(x,.78,z),1.05); if(b.lod>1)return;
    const n=b.lod===0?7:3;
    for(let i=0;i<n;i++){
      const px=x+(hash(seed,i,1)-.5)*.90,pz=z+(hash(seed,i,2)-.5)*.42;
      if(i%4===0) r.blob(v(px,.79,pz),{radius:.028,stretch:.95,color:r.style.warm,alpha:.30*b.alpha,priority:0,seed:seed+10+i});
      else if(i%4===1) r.poly([v(px-.10,.765,pz),v(px+.10,.765,pz),v(px+.10,.765,pz+.14),v(px-.10,.765,pz+.14)],{color:r.style.wash,alpha:.10*b.alpha,priority:0,seed:seed+20+i});
      else if(i%4===2) r.line(v(px-.08,.775,pz),v(px+.08,.775,pz),{width:.010,alpha:.28*b.alpha,priority:0,seed:seed+30+i});
      else r.poly([v(px-.05,.77,pz),v(px+.05,.77,pz),v(px+.04,.88,pz),v(px-.04,.88,pz)],{color:r.style.screen,alpha:.13*b.alpha,priority:0,seed:seed+40+i});
    }
    if(b.lod===0) r.line(v(x-side*.35,.77,z-.20),v(x-side*.12,.77,z-.20),{width:.009,alpha:.26*b.alpha,priority:0,seed:seed+60});
  }

  function compositionPlan(moduleZ,moduleIndex=0){
    const shift=(moduleIndex%2?-.24:.18);
    return {
      hero:{x:shift,z:moduleZ-.55,scale:1.08},
      secondary:[
        {x:-4.45,z:moduleZ-1.65,state:'type',scale:1.00},
        {x:4.10,z:moduleZ-1.20,state:'meeting',scale:.94},
        {x:-5.15,z:moduleZ+2.85,state:'coffee',scale:.95},
        {x:4.65,z:moduleZ+2.40,state:'sit',scale:.91}
      ],
      washCenters:[
        {x:-4.2,z:moduleZ-.4,rx:2.15,ry:.80},
        {x:4.15,z:moduleZ+.35,rx:2.25,ry:.84}
      ]
    };
  }

  function stagedBehavior(index,t,seed){
    const groups=[
      ['walk','walk','type','coffee','talk','sit'],
      ['type','meeting','listen','coffee','walk','printer'],
      ['sit','talk','type','walk','meeting','coffee']
    ];
    const g=groups[(Math.floor(t/7000)+Math.floor(hash(seed,index)*3))%groups.length];
    return g[index%g.length];
  }

  function applyIllustrationCamera(r,enabled){
    if(!enabled)return;
    const portrait=r.W<r.H;
    r.camera.y=portrait?1.50:1.56;
    r.camera.pitch=portrait?.015:.025;
    r.F=portrait?Math.min(r.H*.72,r.W*1.46):Math.min(r.W,r.H)*1.02;
  }

  return {
    SYSTEMS,detailBudget,watercolorMass,ground,glassPartition,humanSilhouette,
    propScatter,compositionPlan,stagedBehavior,applyIllustrationCamera
  };
});
