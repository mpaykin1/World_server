(function (global) {
  'use strict';
  const STANDARD=Object.freeze({
    id:'golden-painting-atmosphere-v1',version:'1.0.0',
    cycle:Object.freeze({day:60,sunset:60,night:10,sunrise:60,total:190}),
    painting:Object.freeze({
      foreground:'warmer, strongest local colour, highest contrast and sharpest useful detail',
      midground:'moderate warmth, contrast and detail; preserve the compositional focus',
      background:'more atmosphere-tinted, usually cooler, less saturated, lower contrast, softer and less detailed',
      exception:'distance follows the atmosphere; sunset, sunrise, fog, smoke and dust may warm or neutralise the background'
    }),
    nightEmitters:Object.freeze(['bright stars','moon and moonlight','meteor streaks','aurora glow','fireflies','luminous spores','bioluminescent wisps','luminous crystals','lanterns and beacons','campfires and embers','lit windows','distant comets'])
  });
  const ORDER=['day','sunset','night','sunrise'];
  const P={
    day:{sky:0x82c9f4,fog:0x9fd0e9,sun:0xfff1d0,exposure:1.04,saturation:1.07,contrast:1.04,brightness:1,warmth:.34,lightLevel:1,keyScale:1,hemiScale:1,night:0},
    sunset:{sky:0xf28c73,fog:0xd9a081,sun:0xff9a52,exposure:.96,saturation:1.10,contrast:1.02,brightness:.94,warmth:.88,lightLevel:.72,keyScale:.72,hemiScale:.62,night:.16},
    night:{sky:0x030817,fog:0x0b1730,sun:0x91bfff,exposure:.78,saturation:.90,contrast:.96,brightness:.72,warmth:.08,lightLevel:.28,keyScale:.13,hemiScale:.30,night:1},
    sunrise:{sky:0xf4a06f,fog:0xdab18a,sun:0xffb05e,exposure:.93,saturation:1.08,contrast:1,brightness:.92,warmth:.82,lightLevel:.68,keyScale:.66,hemiScale:.58,night:.12}
  };
  const adapters=new Set(); let layer=null,started=false,lastAudit=0,lastTick=-Infinity;
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t; const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
  const rgb=h=>[(h>>16)&255,(h>>8)&255,h&255];
  const hex=a=>((Math.round(a[0])<<16)|(Math.round(a[1])<<8)|Math.round(a[2]))>>>0;
  const mixHex=(a,b,t)=>{const x=rgb(a),y=rgb(b),u=smooth(t);return hex([lerp(x[0],y[0],u),lerp(x[1],y[1],u),lerp(x[2],y[2],u)]);};
  const css=h=>`#${h.toString(16).padStart(6,'0')}`;  function phaseAt(seconds){
    const total=STANDARD.cycle.total; let s=((Number(seconds)||0)%total+total)%total;
    for(const phase of ORDER){const duration=STANDARD.cycle[phase];if(s<duration)return{phase,progress:s/duration,elapsedInPhase:s,duration,elapsedInCycle:((Number(seconds)||0)%total+total)%total};s-=duration;}
    return{phase:'day',progress:0,elapsedInPhase:0,duration:60,elapsedInCycle:0};
  }
  function blend(a,b,t){const u=smooth(t),o={};for(const k of ['sky','fog','sun'])o[k]=mixHex(a[k],b[k],u);for(const k of ['exposure','saturation','contrast','brightness','warmth','lightLevel','keyScale','hemiScale','night'])o[k]=lerp(a[k],b[k],u);return o;}
  function getState(seconds){
    const ph=phaseAt(seconds);let v;
    if(ph.phase==='day'||ph.phase==='night')v={...P[ph.phase]};
    else if(ph.phase==='sunset')v=blend(P.day,P.night,ph.progress);
    else v=blend(P.night,P.day,ph.progress);
    if(ph.phase==='sunset'){const g=Math.sin(Math.PI*ph.progress);v.sky=mixHex(v.sky,P.sunset.sky,g*.78);v.fog=mixHex(v.fog,P.sunset.fog,g*.72);v.sun=mixHex(v.sun,P.sunset.sun,g*.92);v.warmth=Math.max(v.warmth,P.sunset.warmth*g);v.saturation+=g*.08;}
    if(ph.phase==='sunrise'){const g=Math.sin(Math.PI*ph.progress);v.sky=mixHex(v.sky,P.sunrise.sky,g*.82);v.fog=mixHex(v.fog,P.sunrise.fog,g*.70);v.sun=mixHex(v.sun,P.sunrise.sun,g*.90);v.warmth=Math.max(v.warmth,P.sunrise.warmth*g);v.saturation+=g*.07;}
    return{...v,...ph,skyCss:css(v.sky),fogCss:css(v.fog),sunCss:css(v.sun),nightVisibility:v.night};
  }
  function forcedState(){
    if(!global.location)return null;const q=new URLSearchParams(global.location.search||''),phase=q.get('goldenPhase');if(!ORDER.includes(phase))return null;
    const progress=clamp(Number(q.get('goldenProgress')||.5));let offset=0;for(const p of ORDER){if(p===phase)break;offset+=STANDARD.cycle[p];}return getState(offset+STANDARD.cycle[phase]*progress);
  }
  function currentState(nowMs){return forcedState()||getState((Number(nowMs)||(global.performance?.now?.()||0))/1000);}
  function ensureLayer(){
    if(!global.document||layer)return layer;
    const style=document.createElement('style');style.id='golden-painting-atmosphere-style';
    style.textContent=`#goldenAtmosphereLayer{position:fixed;inset:0;pointer-events:none;z-index:1;overflow:hidden;opacity:0;transition:opacity .5s linear}#goldenAtmosphereLayer .gp-stars{position:absolute;inset:-20%;background-image:radial-gradient(circle,#fff 0 1px,transparent 1.6px),radial-gradient(circle,#b9dcff 0 1.3px,transparent 2px),radial-gradient(circle,#fff3be 0 .8px,transparent 1.4px);background-size:43px 47px,71px 67px,97px 89px;background-position:0 0,21px 17px,47px 33px;filter:drop-shadow(0 0 4px #cfe8ff);animation:gpTwinkle 2.4s ease-in-out infinite alternate}#goldenAtmosphereLayer .gp-moon{position:absolute;width:min(14vw,110px);aspect-ratio:1;border-radius:50%;right:9vw;top:8vh;background:radial-gradient(circle at 36% 35%,#fff 0 22%,#dfeeff 48%,#9fc7ff 75%,rgba(130,180,255,.25) 76%);box-shadow:0 0 25px #d8ecff,0 0 70px rgba(140,190,255,.75)}#goldenAtmosphereLayer .gp-aurora{position:absolute;left:-15%;right:-15%;top:5%;height:34%;background:linear-gradient(115deg,transparent 14%,rgba(76,255,194,.14) 34%,rgba(146,110,255,.16) 50%,rgba(74,220,255,.12) 67%,transparent 83%);filter:blur(18px);animation:gpAurora 6s ease-in-out infinite alternate}`;
    document.head.appendChild(style);    style.textContent += `
#goldenAtmosphereLayer .gp-meteor{position:absolute;width:130px;height:2px;background:linear-gradient(90deg,transparent,#dff3ff,#fff);box-shadow:0 0 10px #bfe5ff;transform:rotate(-28deg);animation:gpMeteor 3.1s linear infinite;opacity:0}
.gp-meteor.m1{top:15%;left:20%}.gp-meteor.m2{top:23%;left:63%;animation-delay:1.2s}.gp-meteor.m3{top:34%;left:42%;animation-delay:2.2s}
#goldenAtmosphereLayer .gp-fireflies{position:absolute;left:8%;right:8%;bottom:7%;height:32%;background-image:radial-gradient(circle,#fff6a4 0 1px,rgba(255,224,80,.8) 2px,transparent 4px),radial-gradient(circle,#85f7ff 0 1px,rgba(80,220,255,.7) 2px,transparent 4px);background-size:91px 73px,137px 101px;filter:drop-shadow(0 0 5px #ffe993);animation:gpFirefly 4s ease-in-out infinite alternate}
#goldenAtmosphereDebug{position:fixed;right:8px;top:8px;z-index:100000;padding:6px 9px;border-radius:9px;background:rgba(0,0,0,.66);color:#fff;font:12px/1.25 system-ui;pointer-events:none}
@keyframes gpTwinkle{from{opacity:.62}to{opacity:1}}
@keyframes gpAurora{from{transform:translateX(-3%) skewY(-4deg)}to{transform:translateX(4%) skewY(2deg)}}
@keyframes gpMeteor{0%,66%{opacity:0;transform:translate(0,0) rotate(-28deg)}70%{opacity:1}88%{opacity:.9;transform:translate(38vw,22vh) rotate(-28deg)}100%{opacity:0;transform:translate(46vw,27vh) rotate(-28deg)}}
@keyframes gpFirefly{from{transform:translateY(2px);opacity:.55}to{transform:translateY(-9px);opacity:1}}
@media(prefers-reduced-motion:reduce){#goldenAtmosphereLayer *{animation:none!important}}
`;
    layer=document.createElement('div');
    layer.id='goldenAtmosphereLayer';
    layer.setAttribute('aria-hidden','true');
    layer.innerHTML='<div class="gp-stars"></div><div class="gp-aurora"></div><div class="gp-moon"></div><div class="gp-meteor m1"></div><div class="gp-meteor m2"></div><div class="gp-meteor m3"></div><div class="gp-fireflies"></div>';
    document.body.appendChild(layer);
    if(new URLSearchParams(location.search).get('goldenAtmosphereDebug')==='1'){
      const d=document.createElement('div');d.id='goldenAtmosphereDebug';document.body.appendChild(d);
    }
    return layer;
  }
  function updateDom(s){
    const l=ensureLayer();if(!l)return;l.style.opacity=document.body?.dataset.goldenThreeWorld==='1'?'0':String(clamp(s.nightVisibility));
    document.documentElement.style.setProperty('--golden-sky',s.skyCss);
    document.documentElement.style.setProperty('--golden-fog',s.fogCss);
    document.documentElement.style.setProperty('--golden-warmth',s.warmth.toFixed(3));
    document.querySelectorAll('canvas:not([data-golden-three="1"])').forEach(c=>{c.style.filter=`saturate(${s.saturation.toFixed(3)}) contrast(${s.contrast.toFixed(3)}) brightness(${s.brightness.toFixed(3)})`;});
    const d=document.getElementById('goldenAtmosphereDebug');if(d)d.textContent=`${s.phase.toUpperCase()} ${Math.ceil(s.duration-s.elapsedInPhase)}s Р’В· Golden Painting`;
    if(document.body)document.body.dataset.goldenPhase=s.phase;
  }  function seeded(seed){let s=seed>>>0;return()=>((s=Math.imul(1664525,s)+1013904223>>>0)/4294967296);}
  function ensureThreeNight(a){
    if(a.nightGroup||!a.THREE)return;
    const T=a.THREE,r=seeded(0x51a7c0de),g=new T.Group();g.name='GoldenNightSky';g.frustumCulled=false;
    const n=global.matchMedia?.('(pointer:coarse)').matches?320:620;
    const p=new Float32Array(n*3),co=new Float32Array(n*3);
    for(let i=0;i<n;i++){
      const rr=130+r()*150,ang=r()*Math.PI*2,y=38+r()*155;
      p[i*3]=Math.cos(ang)*rr;p[i*3+1]=y;p[i*3+2]=Math.sin(ang)*rr;
      const c=r()>.82?[1,.88,.58]:r()>.62?[.65,.82,1]:[1,1,1];
      co[i*3]=c[0];co[i*3+1]=c[1];co[i*3+2]=c[2];
    }
    const sg=new T.BufferGeometry();sg.setAttribute('position',new T.BufferAttribute(p,3));sg.setAttribute('color',new T.BufferAttribute(co,3));
    const stars=new T.Points(sg,new T.PointsMaterial({size:1.1,vertexColors:true,transparent:true,opacity:1,depthWrite:false,blending:T.AdditiveBlending,fog:false,toneMapped:false}));g.add(stars);
    const moon=new T.Mesh(new T.SphereGeometry(6,20,14),new T.MeshBasicMaterial({color:0xffffff,fog:false,toneMapped:false}));
    moon.position.set(78,88,-145);moon.name='GoldenMoon';g.add(moon);
    const meteors=new T.Group();
    for(let i=0;i<5;i++){
      const geom=new T.BufferGeometry().setFromPoints([new T.Vector3(-9,0,0),new T.Vector3(9,0,0)]);
      const mat=new T.LineBasicMaterial({color:i%2?0xbbe6ff:0xfff0c4,transparent:true,opacity:.9,blending:T.AdditiveBlending,fog:false,toneMapped:false});
      const m=new T.Line(geom,mat);m.position.set(-110+r()*220,65+r()*85,-120+r()*180);m.rotation.z=-.45;m.userData.speed=18+r()*23;meteors.add(m);
    }
    g.add(meteors);
    const fn=global.matchMedia?.('(pointer:coarse)').matches?18:36,fp=new Float32Array(fn*3);
    for(let i=0;i<fn;i++){fp[i*3]=(r()-.5)*34;fp[i*3+1]=1+r()*5;fp[i*3+2]=(r()-.5)*34;}
    const fg=new T.BufferGeometry();fg.setAttribute('position',new T.BufferAttribute(fp,3));
    const fireflies=new T.Points(fg,new T.PointsMaterial({size:.18,color:0xffef75,transparent:true,opacity:.78,depthWrite:false,blending:T.AdditiveBlending,fog:false,toneMapped:false}));g.add(fireflies);    const moonLight=new T.DirectionalLight(0xaad5ff,.9);moonLight.position.set(55,80,-45);moonLight.castShadow=false;g.add(moonLight);
    const wispA=new T.PointLight(0x82eaff,1.3,22,2);wispA.position.set(7,3,-5);wispA.castShadow=false;g.add(wispA);
    const wispB=new T.PointLight(0xffd27a,1.05,18,2);wispB.position.set(-8,2,6);wispB.castShadow=false;g.add(wispB);
    a.scene.add(g);a.nightGroup=g;a.stars=stars;a.meteors=meteors;a.fireflies=fireflies;a.moonLight=moonLight;a.wisps=[wispA,wispB];
  }
  function registerThree(options){
    if(!options?.THREE||!options?.scene||!options?.renderer)return null;
    for(const old of adapters)if(old.scene===options.scene)return old;
    const f=options.scene.fog;
    const baseFog=f?(f.isFogExp2?{type:'exp2',density:f.density}:{type:'linear',near:f.near,far:f.far}):null;
    const a={...options,baseFog,lightBases:new WeakMap(),lights:[],nightGroup:null};
    options.renderer.domElement?.setAttribute('data-golden-three','1');if(global.document&&options.worldId!=='world-sharabass')document.body.dataset.goldenThreeWorld='1';adapters.add(a);ensureThreeNight(a);
    options.scene.traverse(o=>{if(o.isLight)a.lights.push(o);if((o.parent?.name==='GoldenNightSky'||o.parent?.parent?.name==='GoldenNightSky'))return;if(o.material){const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>{if('fog'in m)m.fog=true;});}});
    return a;
  }
  function applyThree(a,s,now){
    const T=a.THREE,scene=a.scene,renderer=a.renderer,camera=a.getCamera?.()||a.camera;if(!scene||!renderer)return;
    if(scene.background?.isColor)scene.background.setHex(s.sky);else if(!scene.background)scene.background=new T.Color(s.sky);
    if(scene.fog?.isFogExp2){scene.fog.color.setHex(s.fog);if(a.baseFog?.type==='exp2')scene.fog.density=a.baseFog.density*(s.phase==='night'?1.18:1);}
    else if(scene.fog?.isFog){scene.fog.color.setHex(s.fog);if(a.baseFog?.type==='linear'){scene.fog.near=a.baseFog.near;scene.fog.far=a.baseFog.far*(s.phase==='night'?.84:1);}}
    else if(camera?.far){const far=Math.max(80,Math.min(camera.far*.52,520));scene.fog=new T.Fog(s.fog,far*.16,far);}
    if('toneMapping'in renderer&&T.ACESFilmicToneMapping!==undefined)renderer.toneMapping=T.ACESFilmicToneMapping;
    if('toneMappingExposure'in renderer)renderer.toneMappingExposure=s.exposure;
    for(const o of a.lights){
      if(!a.lightBases.has(o))a.lightBases.set(o,{intensity:o.intensity,color:o.color?.getHex?.(),ground:o.groundColor?.getHex?.()});
      const b=a.lightBases.get(o);
      if(o.isDirectionalLight&&o!==a.moonLight){o.intensity=b.intensity*s.keyScale;o.color?.setHex(mixHex(b.color||0xffffff,s.sun,.62));}
      else if(o.isHemisphereLight){o.intensity=b.intensity*s.hemiScale;o.color?.setHex(mixHex(b.color||0xffffff,s.sky,.45));if(o.groundColor&&b.ground)o.groundColor.setHex(mixHex(b.ground,0x293343,.38));}
      else if(o.isAmbientLight)o.intensity=b.intensity*(s.phase==='night'?.48:s.hemiScale);
    }    ensureThreeNight(a);
    const v=clamp(s.nightVisibility),g=a.nightGroup;
    if(g){
      g.visible=v>.015;
      if(camera)g.position.copy(camera.position);
      a.stars.material.opacity=v;
      a.fireflies.material.opacity=.9*v;
      a.moonLight.intensity=.95*v;
      a.wisps.forEach((w,i)=>{w.intensity=(i ? .95 : 1.2)*v;});
    }
    if(g){
      const t=(now||0)/1000;
      a.meteors.children.forEach((m,i)=>{
        m.visible=v>.3;
        m.position.x+=m.userData.speed*.016;
        if(m.position.x>140)m.position.x=-140;
        m.position.y+=Math.sin(t*1.7+i)*.015;
      });
      g.rotation.y=Math.sin((now||0)*.00004)*.035;
    }
    if((now||0)-lastAudit>2000){
      lastAudit=now||0;
      scene.traverse(o=>{
        if(!o.material)return;
        let p=o,insideNight=false;
        while(p){if(p===a.nightGroup){insideNight=true;break;}p=p.parent;}
        const ms=Array.isArray(o.material)?o.material:[o.material];
        ms.forEach(m=>{if('fog' in m)m.fog=!insideNight;if(insideNight&&'toneMapped' in m)m.toneMapped=false;});
      });
    }
  }
  function tick(now){
    if((now-lastTick)>=100){
      lastTick=now;
      const s=currentState(now);
      updateDom(s);
      adapters.forEach(a=>applyThree(a,s,now));
    }
    global.requestAnimationFrame?.(tick);
  }
  function start(){
    if(started||!global.document)return;
    started=true;ensureLayer();global.requestAnimationFrame?.(tick);
  }
  const api={STANDARD,PHASE_ORDER:ORDER,PALETTES:P,phaseAt,getState,currentState,registerThree,start};
  global.GoldenPaintingAtmosphere=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(global.document){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
    else start();
  }
})(typeof window!=='undefined'?window:globalThis);
