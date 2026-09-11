(function (global) {
  'use strict';
  const STANDARD=Object.freeze({
    id:'golden-painting-atmosphere-v2',version:'2.0.0',
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
  const SURFACE_PBR=Object.freeze({
    metal:{roughness:.34,metalness:.72,variation:.055,normal:.045,roughJitter:.04},
    stone:{roughness:.82,metalness:.02,variation:.13,normal:.085,roughJitter:.075},
    wood:{roughness:.77,metalness:.01,variation:.12,normal:.070,roughJitter:.065},
    vegetation:{roughness:.88,metalness:0,variation:.16,normal:.060,roughJitter:.085},
    earth:{roughness:.91,metalness:0,variation:.14,normal:.065,roughJitter:.080},
    fabric:{roughness:.90,metalness:0,variation:.09,normal:.040,roughJitter:.055},
    skin:{roughness:.62,metalness:0,variation:.045,normal:.025,roughJitter:.025},
    default:{roughness:.80,metalness:.02,variation:.075,normal:.045,roughJitter:.045}
  });
  const LUT_SIZE=8; const SH_C0=0.886227,SH_C1=1.023328;
  const adapters=new Set(); let layer=null,started=false,lastTick=-Infinity;
  const cycleStartedAt=(global.performance?.now?.()||0)-(Date.now()%(STANDARD.cycle.total*1000));
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
  function currentState(nowMs){const now=Number(nowMs)||(global.performance?.now?.()||0);return forcedState()||getState(Math.max(0,now-cycleStartedAt)/1000);}
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
    const d=document.getElementById('goldenAtmosphereDebug');if(d)d.textContent=`${s.phase.toUpperCase()} ${Math.ceil(s.duration-s.elapsedInPhase)}s ? Golden Painting`;
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
  function createPaintingUniforms(T){
    return{
      nearTint:{value:new T.Color(0xffddb2)},
      farTint:{value:new T.Color(0x9fd0e9)},
      ranges:{value:new T.Vector4(4,20,52,130)},
      grade:{value:new T.Vector4(1.34,.56,1.22,.62)},
      strength:{value:1}
    };
  }
  function inferSurfaceSemantic(o,m){
    const label=`${o?.name||''} ${o?.parent?.name||''} ${m?.name||''}`.toLowerCase();
    if(/metal|iron|steel|armor|weapon|blade|ore/.test(label)||Number(m?.metalness)>.38)return'metal';
    if(/leaf|grass|bush|plant|moss|foliage|crown/.test(label))return'vegetation';
    if(/wood|tree|trunk|plank|door|timber/.test(label))return'wood';
    if(/stone|rock|brick|masonry|concrete/.test(label))return'stone';
    if(/earth|soil|dirt|ground|sand/.test(label))return'earth';
    if(/cloth|fabric|shirt|pants|robe/.test(label))return'fabric';
    if(/skin|face|head|hand|body/.test(label))return'skin';
    const c=m?.color;if(c){
      if(c.g>c.r*1.14&&c.g>c.b*1.13)return'vegetation';
      if(Math.max(c.r,c.g,c.b)-Math.min(c.r,c.g,c.b)<.10&&c.r<.72)return'stone';
      if(c.r>c.g*1.16&&c.g>c.b*1.08&&c.r<.72)return'wood';
    }
    return'default';
  }
  function tuneTexture(a,tex){
    if(!tex?.isTexture||tex.isVideoTexture||tex.userData?.goldenTextureQuality)return;
    tex.userData=tex.userData||{};tex.userData.goldenTextureQuality=true;
    const T=a.THREE,maxA=Math.max(1,Math.min(a.mobile?2:4,a.maxAnisotropy||1));
    if('anisotropy'in tex)tex.anisotropy=maxA;
    if(!tex.isCompressedTexture&&!tex.isDataTexture&&!tex.isData3DTexture&&!tex.isDepthTexture){
      tex.generateMipmaps=true;
      if(T.LinearMipmapLinearFilter!==undefined)tex.minFilter=T.LinearMipmapLinearFilter;
      if(T.LinearFilter!==undefined)tex.magFilter=T.LinearFilter;
    }
    tex.needsUpdate=true;a.textureTunes=(a.textureTunes||0)+1;
  }
  function surfaceSeed(label='default'){let h=2166136261;for(const ch of String(label)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
  function surfaceNoise(x,y,seed){let h=(Math.imul(x+17,374761393)^Math.imul(y+31,668265263)^seed)>>>0;h=Math.imul(h^(h>>>13),1274126177)>>>0;return((h^(h>>>16))>>>0)/4294967295;}
  function makeSurfaceCanvas(size){
    if(typeof OffscreenCanvas!=='undefined'){
      try{return{canvas:new OffscreenCanvas(size,size),offscreen:true};}catch(e){/* fall through to document canvas */}
    }
    if(!global.document)return null;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size;return{canvas,offscreen:false};
  }
  function proceduralSurfaceTexture(a,semantic,kind){
    if(a.lowPower)return null;
    const key=`${semantic}:${kind}`;if(a.proceduralMaps.has(key))return a.proceduralMaps.get(key);
    const size=32,made=makeSurfaceCanvas(size);if(!made)return null;
    const{canvas,offscreen}=made,ctx=canvas.getContext('2d');if(!ctx)return null;
    const image=ctx.createImageData(size,size),seed=surfaceSeed(semantic),profile=SURFACE_PBR[semantic]||SURFACE_PBR.default;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const i=(y*size+x)*4,n=surfaceNoise(x,y,seed);
      if(kind==='normal'){
        const nx=(surfaceNoise((x+1)%size,y,seed)-n)*.55,ny=(surfaceNoise(x,(y+1)%size,seed)-n)*.55;
        const iz=1/Math.hypot(nx,ny,1);image.data[i]=Math.round((-.5*nx*iz+.5)*255);image.data[i+1]=Math.round((-.5*ny*iz+.5)*255);image.data[i+2]=Math.round((.5*iz+.5)*255);
      }else{
        const v=clamp(.90+(n-.5)*profile.roughJitter*1.8,.72,1);image.data[i]=image.data[i+1]=image.data[i+2]=Math.round(v*255);
      }
      image.data[i+3]=255;
    }
    ctx.putImageData(image,0,0);const tex=new a.THREE.CanvasTexture(canvas);tex.wrapS=tex.wrapT=a.THREE.RepeatWrapping;tex.repeat?.set?.(2,2);tex.userData={...(tex.userData||{}),goldenProceduralSurface:true,semantic,kind,offscreenCanvas:offscreen};
    tuneTexture(a,tex);a.proceduralMaps.set(key,tex);a.canvasTexturesBuilt=(a.canvasTexturesBuilt||0)+1;if(offscreen)a.offscreenCanvasUsed=(a.offscreenCanvasUsed||0)+1;return tex;
  }
  function attachProceduralMaps(a,o,m,semantic){
    if(a.lowPower||!o?.geometry?.getAttribute?.('uv'))return;
    if(!m.normalMap){const tex=proceduralSurfaceTexture(a,semantic,'normal');if(tex){m.normalMap=tex;m.normalScale?.setScalar?.(.22);a.normalMaps=(a.normalMaps||0)+1;}}
    if(!m.roughnessMap){const tex=proceduralSurfaceTexture(a,semantic,'roughness');if(tex){m.roughnessMap=tex;a.roughnessMaps=(a.roughnessMaps||0)+1;}}
    m.needsUpdate=true;
  }
  function tunePbrMaterial(a,o,m){
    if(!m||(!m.isMeshStandardMaterial&&!m.isMeshPhysicalMaterial)||m.transparent||Number(m.opacity??1)<.995)return null;
    m.userData=m.userData||{};
    const semantic=inferSurfaceSemantic(o,m),p=SURFACE_PBR[semantic]||SURFACE_PBR.default;
    if(!m.userData.goldenPbrBase)m.userData.goldenPbrBase={roughness:Number(m.roughness??p.roughness),metalness:Number(m.metalness??p.metalness)};
    if(!m.userData.goldenPbrTuned){
      const b=m.userData.goldenPbrBase;
      m.roughness=lerp(b.roughness,p.roughness,.34);
      m.metalness=lerp(b.metalness,p.metalness,.28);
      m.userData.goldenPbrTuned=true;m.userData.goldenPbrSemantic=semantic;a.pbrMaterials=(a.pbrMaterials||0)+1;
    }
    attachProceduralMaps(a,o,m,semantic);
    for(const key of ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap','alphaMap'])tuneTexture(a,m[key]);
    return p;
  }
  function patchPaintingMaterial(a,m,surface=SURFACE_PBR.default){
    if(!m||m.userData?.goldenPaintingDepthV2||m.isShaderMaterial||m.isRawShaderMaterial||!('fog' in m))return;
    m.userData=m.userData||{};m.userData.goldenPaintingDepthV2=true;m.fog=true;a.patchedMaterials=(a.patchedMaterials||0)+1;
    const previous=m.onBeforeCompile,pbrCapable=Boolean(m.isMeshStandardMaterial||m.isMeshPhysicalMaterial);
    m.onBeforeCompile=function(shader,renderer){
      previous?.call(this,shader,renderer);
      const marker='#include <fog_fragment>';
      if(!shader.fragmentShader.includes(marker))return;
      shader.uniforms.goldenNearTint=a.paintingUniforms.nearTint;
      shader.uniforms.goldenFarTint=a.paintingUniforms.farTint;
      shader.uniforms.goldenRanges=a.paintingUniforms.ranges;
      shader.uniforms.goldenGrade=a.paintingUniforms.grade;
      shader.uniforms.goldenStrength=a.paintingUniforms.strength;
      shader.fragmentShader=`uniform vec3 goldenNearTint;\nuniform vec3 goldenFarTint;\nuniform vec4 goldenRanges;\nuniform vec4 goldenGrade;\nuniform float goldenStrength;\n${shader.fragmentShader}`;
      const useLut=Boolean(a.lutTexture)&&!a.lowPower;
      if(useLut){
        shader.uniforms.goldenLutMap={value:a.lutTexture};
        shader.uniforms.goldenLutSize={value:LUT_SIZE};
        shader.uniforms.goldenLutStrength={value:.5};
        shader.fragmentShader=`uniform sampler2D goldenLutMap;\nuniform float goldenLutSize;\nuniform float goldenLutStrength;\nvec3 goldenLutSample(sampler2D lut,vec3 c,float size){float bz=clamp(c.b,0.0,1.0)*(size-1.0);float z0=floor(bz);float z1=min(z0+1.0,size-1.0);float zf=bz-z0;float px=clamp(c.r,0.0,1.0)*(size-1.0)+0.5;float py=(clamp(c.g,0.0,1.0)*(size-1.0)+0.5)/size;vec2 uv0=vec2((px+z0*size)/(size*size),py);vec2 uv1=vec2((px+z1*size)/(size*size),py);vec3 c0=texture2D(lut,uv0).rgb;vec3 c1=texture2D(lut,uv1).rgb;return mix(c0,c1,zf);}\n${shader.fragmentShader}`;
        a.lutMaterials=(a.lutMaterials||0)+1;
      }
      if(pbrCapable&&!a.lowPower&&shader.vertexShader.includes('#include <worldpos_vertex>')){
        const normalScale=m.userData?.__uvmState?surface.normal*.34:surface.normal;
        shader.uniforms.goldenSurfaceVariation={value:a.mobile?surface.variation*.72:surface.variation};
        shader.uniforms.goldenSurfaceNormal={value:a.mobile?normalScale*.70:normalScale};
        shader.uniforms.goldenSurfaceRough={value:a.mobile?surface.roughJitter*.70:surface.roughJitter};
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vGoldenSurfacePos;');
        shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvGoldenSurfacePos=(modelMatrix*vec4(transformed,1.0)).xyz;');
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 vGoldenSurfacePos;\nuniform float goldenSurfaceVariation;\nuniform float goldenSurfaceNormal;\nuniform float goldenSurfaceRough;\nfloat goldenSurfaceHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}`);
        const colorNeedle='#include <color_fragment>';
        if(shader.fragmentShader.includes(colorNeedle))shader.fragmentShader=shader.fragmentShader.replace(colorNeedle,`${colorNeedle}\nfloat goldenSurfaceN=goldenSurfaceHash(floor(vGoldenSurfacePos*3.7));\ndiffuseColor.rgb*=1.0+(goldenSurfaceN-.5)*goldenSurfaceVariation;`);
        const normalNeedle='#include <normal_fragment_maps>';
        if(shader.fragmentShader.includes(normalNeedle))shader.fragmentShader=shader.fragmentShader.replace(normalNeedle,`${normalNeedle}\nfloat goldenN0=goldenSurfaceHash(floor(vGoldenSurfacePos*5.3));\nfloat goldenNx=goldenSurfaceHash(floor(vGoldenSurfacePos*5.3)+vec3(1.,0.,0.));\nfloat goldenNy=goldenSurfaceHash(floor(vGoldenSurfacePos*5.3)+vec3(0.,1.,0.));\nnormal=normalize(normal+vec3(goldenNx-goldenN0,goldenNy-goldenN0,0.)*goldenSurfaceNormal);`);
        const roughNeedle='#include <roughnessmap_fragment>';
        if(shader.fragmentShader.includes(roughNeedle))shader.fragmentShader=shader.fragmentShader.replace(roughNeedle,`${roughNeedle}\nroughnessFactor=clamp(roughnessFactor+(goldenSurfaceN-.5)*goldenSurfaceRough,0.04,1.0);`);
        a.surfaceDetailMaterials=(a.surfaceDetailMaterials||0)+1;
      }
      shader.fragmentShader=shader.fragmentShader.replace(marker,`
#ifdef USE_FOG
  float gpNear=1.0-smoothstep(goldenRanges.x,goldenRanges.y,vFogDepth);
  float gpFar=smoothstep(goldenRanges.z,goldenRanges.w,vFogDepth);
  float gpMid=clamp(1.0-gpNear-gpFar,0.0,1.0);
  float gpLum=dot(gl_FragColor.rgb,vec3(0.2126,0.7152,0.0722));
  float gpSat=gpNear*goldenGrade.x+gpMid*0.92+gpFar*goldenGrade.y;
  vec3 gpCol=mix(vec3(gpLum),gl_FragColor.rgb,gpSat);
  float gpContrast=gpNear*goldenGrade.z+gpMid*0.94+gpFar*goldenGrade.w;
  gpCol=(gpCol-vec3(0.5))*gpContrast+vec3(0.5);
  gpCol=mix(gpCol,goldenNearTint,gpNear*0.13*goldenStrength);
  gpCol=mix(gpCol,goldenFarTint,gpFar*0.46*goldenStrength);
${useLut?'  gpCol=mix(gpCol,goldenLutSample(goldenLutMap,clamp(gpCol,0.0,1.0),goldenLutSize),goldenLutStrength*goldenStrength);\n':''}  gl_FragColor.rgb=max(gpCol,vec3(0.0));
#endif
${marker}`);
    };
    m.needsUpdate=true;
  }
  function patchSceneMaterials(a){
    a.scene.traverse(o=>{
      if(!o.material)return;
      let parent=o,insideNight=false;while(parent){if(parent===a.nightGroup){insideNight=true;break;}parent=parent.parent;}
      if(insideNight)return;
      const ms=Array.isArray(o.material)?o.material:[o.material];
      ms.forEach(m=>{const surface=tunePbrMaterial(a,o,m)||SURFACE_PBR.default;patchPaintingMaterial(a,m,surface);});
    });
  }
  function updatePaintingUniforms(a,s,camera){
    const u=a.paintingUniforms;if(!u||!camera)return;
    u.nearTint.value.setHex(mixHex(0xffdfb4,s.sun,.46));u.farTint.value.setHex(s.fog);
    let effectiveFar=Math.min(Number(camera.far)||360,520);
    if(a.baseFog?.type==='linear')effectiveFar=Math.min(effectiveFar,Math.max(70,a.baseFog.far));
    else if(a.baseFog?.type==='exp2')effectiveFar=Math.min(effectiveFar,Math.max(70,3.2/Math.max(.001,a.baseFog.density)));
    const nearEnd=Math.max(14,effectiveFar*.16),farStart=Math.max(nearEnd+10,effectiveFar*.34),farEnd=Math.max(farStart+18,effectiveFar*.78);
    u.ranges.value.set(Math.max(2,nearEnd*.22),nearEnd,farStart,farEnd);
    const phaseStrength=s.phase==='night'?.90:1;
    u.grade.value.set(1.34,.56,1.22,.62);u.strength.value=phaseStrength;
  }
  function buildProceduralLut(a){
    const T=a.THREE;if(!T?.DataTexture)return null;
    const size=LUT_SIZE,data=new Uint8Array(size*size*size*4);
    for(let gy=0;gy<size;gy++){
      const g=gy/(size-1);
      for(let bz=0;bz<size;bz++){
        const b=bz/(size-1);
        for(let rx=0;rx<size;rx++){
          const r=rx/(size-1),lum=r*.2126+g*.7152+b*.0722;
          let rr=lerp(lum,r,1.06),gg=lerp(lum,g,1.03),bb=lerp(lum,b,.97);
          rr=clamp((rr-.5)*1.05+.5+.015,0,1);gg=clamp((gg-.5)*1.05+.5,0,1);bb=clamp((bb-.5)*1.05+.5-.01,0,1);
          const idx=gy*size*size+bz*size+rx,p=idx*4;
          data[p]=Math.round(rr*255);data[p+1]=Math.round(gg*255);data[p+2]=Math.round(bb*255);data[p+3]=255;
        }
      }
    }
    const tex=new T.DataTexture(data,size*size,size,T.RGBAFormat);
    tex.needsUpdate=true;tex.generateMipmaps=false;
    if(T.LinearFilter!==undefined){tex.minFilter=T.LinearFilter;tex.magFilter=T.LinearFilter;}
    if(T.ClampToEdgeWrapping!==undefined){tex.wrapS=tex.wrapT=T.ClampToEdgeWrapping;}
    a.lutBuilds=(a.lutBuilds||0)+1;
    return tex;
  }
  function ensureLightProbe(a){
    const T=a.THREE;if(a.lightProbe||!T?.LightProbe||!T?.SphericalHarmonics3)return;
    const probe=new T.LightProbe(new T.SphericalHarmonics3(),1);
    probe.name='GoldenLightProbe';a.scene.add(probe);a.lightProbe=probe;
  }
  function updateLightProbe(a,s){
    const probe=a.lightProbe;if(!probe?.sh?.coefficients)return;
    const strength=(a.mobile ? .35 : .5)*clamp(s.lightLevel,0,1),sky=rgb(s.sky),fog=rgb(s.fog);
    const up=[sky[0]/255*strength,sky[1]/255*strength,sky[2]/255*strength];
    const down=[fog[0]/255*strength*.55,fog[1]/255*strength*.55,fog[2]/255*strength*.55];
    const c=probe.sh.coefficients;
    c[0].set((up[0]+down[0])/(2*SH_C0),(up[1]+down[1])/(2*SH_C0),(up[2]+down[2])/(2*SH_C0));
    c[1].set((up[0]-down[0])/(2*SH_C1),(up[1]-down[1])/(2*SH_C1),(up[2]-down[2])/(2*SH_C1));
    probe.intensity=1;
  }
  function registerThree(options){
    if(!options?.THREE||!options?.scene||!options?.renderer)return null;
    for(const old of adapters)if(old.scene===options.scene)return old;
    const f=options.scene.fog;
    const baseFog=f?(f.isFogExp2?{type:'exp2',density:f.density}:{type:'linear',near:f.near,far:f.far}):null;
    const mobile=Boolean(global.matchMedia?.('(pointer:coarse)').matches||(global.innerWidth||9999)<760);
    const maxAnisotropy=Number(options.renderer.capabilities?.getMaxAnisotropy?.()||1);
    const forceHigh=new URLSearchParams(global.location?.search||'').get('goldenGraphics')==='high';
    const lowPower=!forceHigh&&(mobile||Number(global.navigator?.hardwareConcurrency||8)<=4);
    const a={...options,baseFog,mobile,lowPower,maxAnisotropy,currentExposure:Number(options.renderer.toneMappingExposure||1),proceduralMaps:new Map(),lightBases:new WeakMap(),lights:[],nightGroup:null,patchedMaterials:0,pbrMaterials:0,textureTunes:0,normalMaps:0,roughnessMaps:0,surfaceDetailMaterials:0,registeredAt:global.performance?.now?.()||0,lastMaterialAudit:-Infinity,paintingUniforms:createPaintingUniforms(options.THREE),lutTexture:null,lutBuilds:0,lightProbe:null,offscreenCanvasUsed:0,canvasTexturesBuilt:0,assetCodec:null};
    if('outputColorSpace'in options.renderer&&options.THREE.SRGBColorSpace!==undefined)options.renderer.outputColorSpace=options.THREE.SRGBColorSpace;
    if('toneMapping'in options.renderer&&options.THREE.ACESFilmicToneMapping!==undefined)options.renderer.toneMapping=options.THREE.ACESFilmicToneMapping;
    if(options.renderer.shadowMap?.enabled&&options.THREE.PCFSoftShadowMap!==undefined)options.renderer.shadowMap.type=options.THREE.PCFSoftShadowMap;
    options.renderer.domElement?.setAttribute('data-golden-three','1');if(global.document&&options.worldId!=='world-sharabass')document.body.dataset.goldenThreeWorld='1';adapters.add(a);ensureThreeNight(a);
    options.scene.traverse(o=>{if(o.isLight)a.lights.push(o);});patchSceneMaterials(a);
    if(!a.lowPower){
      a.lutTexture=buildProceduralLut(a);
      ensureLightProbe(a);
      if(global.GoldenAssetCodec?.prewarm){
        a.assetCodec=global.GoldenAssetCodec;
        try{global.GoldenAssetCodec.prewarm({renderer:options.renderer,worldId:options.worldId});}catch(e){/* offline-safe */}
      }
    }
    return a;
  }
  function applyThree(a,s,now){
    const T=a.THREE,scene=a.scene,renderer=a.renderer,camera=a.getCamera?.()||a.camera;if(!scene||!renderer)return;
    if(scene.background?.isColor)scene.background.setHex(s.sky);else if(!scene.background)scene.background=new T.Color(s.sky);
    if(scene.fog?.isFogExp2){scene.fog.color.setHex(s.fog);if(a.baseFog?.type==='exp2')scene.fog.density=a.baseFog.density*(s.phase==='night'?1.32:1.12);}
    else if(scene.fog?.isFog){scene.fog.color.setHex(s.fog);if(a.baseFog?.type==='linear'){scene.fog.near=a.baseFog.near*.88;scene.fog.far=a.baseFog.far*(s.phase==='night'?.76:.90);}}
    else if(camera?.far){const far=Math.max(80,Math.min(camera.far*.52,520));scene.fog=new T.Fog(s.fog,far*.16,far);}
    if('toneMapping'in renderer&&T.ACESFilmicToneMapping!==undefined)renderer.toneMapping=T.ACESFilmicToneMapping;
    if('toneMappingExposure'in renderer){a.currentExposure=lerp(a.currentExposure,s.exposure,s.phase==='night'?.16:.10);renderer.toneMappingExposure=a.currentExposure;}
    updatePaintingUniforms(a,s,camera);
    updateLightProbe(a,s);
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
    const auditEvery=((now||0)-a.registeredAt)<12000?400:2500;
    if((now||0)-a.lastMaterialAudit>auditEvery){a.lastMaterialAudit=now||0;patchSceneMaterials(a);}
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
  function diagnostics(){return{phase:currentState().phase,cycleAlive:true,adapters:[...adapters].map(a=>({worldId:a.worldId||'unknown',patchedMaterials:a.patchedMaterials||0,pbrMaterials:a.pbrMaterials||0,surfaceDetailMaterials:a.surfaceDetailMaterials||0,normalMaps:a.normalMaps||0,roughnessMaps:a.roughnessMaps||0,textureTunes:a.textureTunes||0,maxAnisotropy:a.maxAnisotropy||1,surfaceDetailEnabled:!a.lowPower,aces:true,exposureAdaptation:true,softShadows:Boolean(a.renderer?.shadowMap?.enabled),depthGrading:true,foreground:{saturation:1.34,contrast:1.22},background:{saturation:.56,contrast:.62,atmosphereTint:true},lut:{enabled:Boolean(a.lutTexture),size:a.lutTexture?LUT_SIZE:0,materials:a.lutMaterials||0,builds:a.lutBuilds||0},lightProbe:{enabled:Boolean(a.lightProbe),approxBands:a.lightProbe?2:0},offscreenCanvas:{supported:typeof OffscreenCanvas!=='undefined',used:a.offscreenCanvasUsed||0,textures:a.canvasTexturesBuilt||0},assetCodec:(a.assetCodec&&typeof a.assetCodec.diagnostics==='function')?a.assetCodec.diagnostics():null}))};}
  const api={STANDARD,PHASE_ORDER:ORDER,PALETTES:P,phaseAt,getState,currentState,registerThree,start,diagnostics};
  global.GoldenPaintingAtmosphere=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(global.document){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
    else start();
  }
})(typeof window!=='undefined'?window:globalThis);
