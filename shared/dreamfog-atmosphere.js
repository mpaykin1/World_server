'use strict';

const TIERS = Object.freeze({
  cinematic: { fogBanks:10, particles:4200, weather:1200, creatures:30, lights:4, post:true, pixelRatioCap:1.8, fogDensity:.026 },
  balanced:  { fogBanks:7,  particles:2600, weather:800,  creatures:24, lights:3, post:true, pixelRatioCap:1.55, fogDensity:.029 },
  mobile:    { fogBanks:5,  particles:1400, weather:420,  creatures:18, lights:2, post:false,pixelRatioCap:1.3, fogDensity:.032 },
  low:       { fogBanks:3,  particles:700,  weather:180,  creatures:12, lights:1, post:false,pixelRatioCap:1.0, fogDensity:.035 }
});

function mulberry32(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function hexColor(n){return '#'+(Number(n)>>>0).toString(16).padStart(6,'0').slice(-6);}
function colorFromCss(THREE,value,fallback){try{return new THREE.Color(value??fallback);}catch{return new THREE.Color(fallback);}}

function makeNoiseTexture(THREE,rng,size=192){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d',{alpha:true});const img=ctx.createImageData(size,size);
  for(let i=0;i<size*size;i++){
    const x=i%size,y=(i/size)|0;
    const low=Math.sin(x*.067)+Math.cos(y*.051)+Math.sin((x+y)*.029);
    const grain=(rng()-.5)*1.1;
    const v=clamp(Math.round(132+low*25+grain*42),0,255);
    const a=clamp(Math.round(45+Math.abs(low)*18+rng()*90),0,210);
    const o=i*4;img.data[o]=v;img.data[o+1]=v;img.data[o+2]=v;img.data[o+3]=a;
  }
  ctx.putImageData(img,0,0);
  const tex=new THREE.CanvasTexture(canvas);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;tex.colorSpace=THREE.SRGBColorSpace;tex.needsUpdate=true;return tex;
}

function makeGlowTexture(THREE){
  const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');
  const g=x.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,246,255,.9)');g.addColorStop(.14,'rgba(224,192,242,.46)');g.addColorStop(.55,'rgba(180,138,205,.12)');g.addColorStop(1,'rgba(120,90,150,0)');x.fillStyle=g;x.fillRect(0,0,128,128);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}

class DreamFogPostFX{
  constructor(THREE,renderer,camera){
    this.THREE=THREE;this.renderer=renderer;this.camera=camera;this.supported=!!(renderer.capabilities?.isWebGL2||renderer.extensions?.has?.('WEBGL_depth_texture'));this.enabled=this.supported;
    this.target=new THREE.WebGLRenderTarget(Math.max(2,innerWidth),Math.max(2,innerHeight),{depthBuffer:true});
    this.target.depthTexture=new THREE.DepthTexture(Math.max(2,innerWidth),Math.max(2,innerHeight),THREE.UnsignedIntType);
    this.scene=new THREE.Scene();this.cam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{
      tDiffuse:{value:this.target.texture},tDepth:{value:this.target.depthTexture},resolution:{value:new THREE.Vector2(innerWidth,innerHeight)},time:{value:0},strength:{value:.34}
    },vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader:`
      precision highp float;varying vec2 vUv;uniform sampler2D tDiffuse;uniform sampler2D tDepth;uniform vec2 resolution;uniform float time;uniform float strength;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
      void main(){
        vec4 base=texture2D(tDiffuse,vUv);float d=texture2D(tDepth,vUv).x;
        float farMask=smoothstep(.968,.9985,d);vec2 px=1.0/max(resolution,vec2(1.));
        vec3 blur=base.rgb*0.30;blur+=texture2D(tDiffuse,vUv+vec2(px.x*1.7,0.)).rgb*.175;blur+=texture2D(tDiffuse,vUv-vec2(px.x*1.7,0.)).rgb*.175;blur+=texture2D(tDiffuse,vUv+vec2(0.,px.y*1.7)).rgb*.175;blur+=texture2D(tDiffuse,vUv-vec2(0.,px.y*1.7)).rgb*.175;
        float lum=dot(base.rgb,vec3(.2126,.7152,.0722));float bloom=smoothstep(.62,1.,lum)*.06;
        vec3 col=mix(base.rgb,blur,farMask*strength);col+=bloom*vec3(1.,.88,1.05);
        float grain=(hash(gl_FragCoord.xy+time*17.3)-.5)*.014;col+=grain*(.35+.65*farMask);
        float vig=smoothstep(.88,.22,length(vUv-.5));col*=mix(.84,1.,vig);
        gl_FragColor=vec4(col,base.a);
      }`});
    this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);this.scene.add(this.quad);
  }
  resize(w,h){this.target.setSize(Math.max(2,w),Math.max(2,h));this.material.uniforms.resolution.value.set(w,h);}
  render(scene,camera,time){
    if(!this.enabled){this.renderer.setRenderTarget(null);this.renderer.render(scene,camera);return;}
    this.material.uniforms.time.value=time;
    this.renderer.setRenderTarget(this.target);this.renderer.render(scene,camera);this.renderer.setRenderTarget(null);this.renderer.render(this.scene,this.cam);
  }
  dispose(){this.target.dispose();this.quad.geometry.dispose();this.material.dispose();}
}

export function createDreamFogAtmosphere(THREE,{scene,camera,renderer,seed=771923,manifest=null,assetBase='/apps/dreamfog-world/assets/generated/',onQualityChange=()=>{}}={}){
  if(!THREE||!scene||!camera||!renderer)throw new Error('DreamFog requires THREE, scene, camera and renderer');
  const rng=mulberry32(Number(seed)||771923);
  const coarse=matchMedia('(pointer:coarse)').matches;
  const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
  const memory=Number(navigator.deviceMemory||4);
  const initialTier=coarse?(memory<=2?'low':'mobile'):(memory>=8?'cinematic':'balanced');
  let tier=initialTier;
  const generatedTheme=manifest?.theme||{};
  const theme={
    fog:generatedTheme.fog||'#7b6b86', sky:generatedTheme.sky||'#8b7a97', water:generatedTheme.water||'#493d59', creature:generatedTheme.creature||'#2d2136', glow:generatedTheme.glow||'#dcc9eb'
  };
  scene.background=colorFromCss(THREE,theme.sky,'#8b7a97');scene.fog=new THREE.FogExp2(colorFromCss(THREE,theme.fog,'#7b6b86'),TIERS[tier].fogDensity);

  const root=new THREE.Group();root.name='DreamFogAtmosphere';scene.add(root);
  const hemi=new THREE.HemisphereLight(colorFromCss(THREE,'#c9b4d5','#c9b4d5'),colorFromCss(THREE,'#251d2b','#251d2b'),1.35);root.add(hemi);
  const moon=new THREE.DirectionalLight(colorFromCss(THREE,'#e9d9ef','#e9d9ef'),1.8);moon.position.set(-18,34,-26);root.add(moon);

  const noiseTex=makeNoiseTexture(THREE,rng);const fogBanks=[];const fogGeom=new THREE.PlaneGeometry(1,1,1,1);
  for(let i=0;i<TIERS.cinematic.fogBanks;i++){
    const mat=new THREE.MeshBasicMaterial({color:colorFromCss(THREE,theme.fog,'#7b6b86'),alphaMap:noiseTex,transparent:true,opacity:.075+rng()*.085,depthWrite:false,depthTest:true,side:THREE.DoubleSide,fog:true});
    const m=new THREE.Mesh(fogGeom,mat);m.name=`DreamFogBank${i}`;m.userData.phase=rng()*Math.PI*2;m.userData.radius=12+rng()*42;m.userData.angle=rng()*Math.PI*2;m.userData.y=.6+rng()*8;m.userData.speed=.035+rng()*.075;m.scale.set(26+rng()*34,9+rng()*17,1);root.add(m);fogBanks.push(m);
  }

  const maxParticles=TIERS.cinematic.particles;const particlePos=new Float32Array(maxParticles*3);
  for(let i=0;i<maxParticles;i++){const r=5+rng()*82,a=rng()*Math.PI*2;particlePos[i*3]=Math.cos(a)*r;particlePos[i*3+1]=.1+rng()*13;particlePos[i*3+2]=Math.sin(a)*r;}
  const particleGeo=new THREE.BufferGeometry();particleGeo.setAttribute('position',new THREE.BufferAttribute(particlePos,3));
  const particleMat=new THREE.PointsMaterial({color:colorFromCss(THREE,'#eadff0','#eadff0'),size:.075,transparent:true,opacity:.21,depthWrite:false,fog:true,sizeAttenuation:true});
  const particles=new THREE.Points(particleGeo,particleMat);particles.name='DreamFogMistParticles';root.add(particles);

  // Lightweight weather field (ash / fine rain / drifting dust) entirely in the vertex shader.
  const maxWeather=TIERS.cinematic.weather;const weatherPos=new Float32Array(maxWeather*3);
  for(let i=0;i<maxWeather;i++){weatherPos[i*3]=(rng()-.5)*120;weatherPos[i*3+1]=rng()*20;weatherPos[i*3+2]=(rng()-.5)*120;}
  const weatherGeo=new THREE.BufferGeometry();weatherGeo.setAttribute('position',new THREE.BufferAttribute(weatherPos,3));
  const weatherMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:true,uniforms:{time:{value:0},color:{value:colorFromCss(THREE,'#e7dce9','#e7dce9')}},vertexShader:`uniform float time;varying float vA;void main(){vec3 p=position;p.y=mod(position.y-time*.23+20.,20.);p.x+=sin(time*.17+position.z*.08)*.35;vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=clamp(18.0/-mv.z,1.0,3.0);gl_Position=projectionMatrix*mv;vA=.08+.11*fract(position.x*.173+position.z*.119);}`,fragmentShader:`uniform vec3 color;varying float vA;void main(){vec2 q=gl_PointCoord-.5;if(dot(q,q)>.24)discard;gl_FragColor=vec4(color,vA);}`});
  const weather=new THREE.Points(weatherGeo,weatherMat);weather.name='DreamFogWeatherField';root.add(weather);

  const maxCreatures=TIERS.cinematic.creatures;const coreGeo=new THREE.SphereGeometry(1,18,12);const limbGeo=new THREE.CylinderGeometry(.42,.68,2.6,10,2,false);const haloGeo=new THREE.TorusGeometry(1,.14,7,28);
  const creatureMat=new THREE.MeshStandardMaterial({color:colorFromCss(THREE,theme.creature,'#2d2136'),roughness:.86,metalness:.03,transparent:true,opacity:.62,depthWrite:false,fog:true});
  const core=new THREE.InstancedMesh(coreGeo,creatureMat,maxCreatures);const limb=new THREE.InstancedMesh(limbGeo,creatureMat,maxCreatures);const halo=new THREE.InstancedMesh(haloGeo,creatureMat,maxCreatures);core.name='DreamFogCreatureCores';limb.name='DreamFogCreatureLimbs';halo.name='DreamFogCreatureHalos';root.add(core,limb,halo);
  core.instanceMatrix.setUsage(THREE.DynamicDrawUsage);limb.instanceMatrix.setUsage(THREE.DynamicDrawUsage);halo.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const creatures=[];const colliders=[];
  for(let i=0;i<maxCreatures;i++){
    const a=rng()*Math.PI*2,r=10+rng()*66,scale=.7+rng()*2.5,tall=1.7+rng()*6.4;
    const x=Math.cos(a)*r,z=Math.sin(a)*r,solid=i%5===0&&r<46;
    creatures.push({x,z,scale,tall,phase:rng()*Math.PI*2,lean:(rng()-.5)*.42,halo:i%3===0,solid});if(solid)colliders.push({x,z,radius:Math.max(.7,scale*.63)});
  }
  const dummy=new THREE.Object3D();

  const waterMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:true,uniforms:{time:{value:0},base:{value:colorFromCss(THREE,theme.water,'#493d59')},glow:{value:colorFromCss(THREE,theme.glow,'#dcc9eb')}},vertexShader:`
    uniform float time;varying vec3 vWorld;varying float vWave;
    void main(){vec3 p=position;float w=sin(p.x*.18+time*.56)*.045+sin(p.y*.23-time*.41)*.035;p.z+=w;vWave=w;vec4 world=modelMatrix*vec4(p,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader:`uniform vec3 base;uniform vec3 glow;uniform float time;varying vec3 vWorld;varying float vWave;void main(){float r=.5+.5*sin(vWorld.x*.25+vWorld.z*.17+time*.33);float shine=smoothstep(.82,1.,r)*.26;vec3 c=mix(base,glow,.10+shine+abs(vWave)*1.7);gl_FragColor=vec4(c,.78);}`});
  const water=new THREE.Mesh(new THREE.PlaneGeometry(190,190,84,84),waterMat);water.rotation.x=-Math.PI/2;water.position.y=0;water.name='DreamFogWater';root.add(water);

  const glowTex=makeGlowTexture(THREE),lightSprites=[],lights=[];
  for(let i=0;i<TIERS.cinematic.lights;i++){
    const a=rng()*Math.PI*2,r=14+rng()*46;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:colorFromCss(THREE,theme.glow,'#dcc9eb'),transparent:true,opacity:.22,depthWrite:false,blending:THREE.AdditiveBlending}));
    sprite.position.set(Math.cos(a)*r,2+rng()*8,Math.sin(a)*r);sprite.scale.setScalar(6+rng()*8);root.add(sprite);lightSprites.push(sprite);
    const light=new THREE.PointLight(colorFromCss(THREE,theme.glow,'#dcc9eb'),.65,21,2.2);light.position.copy(sprite.position);root.add(light);lights.push(light);
  }

  const anomalyMat=new THREE.MeshBasicMaterial({color:colorFromCss(THREE,'#201825','#201825'),transparent:true,opacity:0,depthWrite:false,fog:true,side:THREE.DoubleSide});
  const anomalies=[];
  for(let i=0;i<4;i++){const m=new THREE.Mesh(new THREE.PlaneGeometry(2.2+i*.5,7+i*1.3),anomalyMat.clone());const a=rng()*Math.PI*2,r=22+rng()*36;m.position.set(Math.cos(a)*r,3.3,Math.sin(a)*r);root.add(m);anomalies.push({mesh:m,phase:rng()*100,active:false});}
  let nextAnomaly=8+rng()*15;

  // Optional LDI cards generated from the existing Depth Anything worker. They are additive to the procedural world, not a metric-3D claim.
  const depthLayerGroup=new THREE.Group();depthLayerGroup.name='DreamFogDepthLayers';root.add(depthLayerGroup);
  let depthLayerCount=0;
  if(Array.isArray(manifest?.layers)&&manifest.layers.length){
    const loader=new THREE.TextureLoader();const aspect=Math.max(.35,Number(manifest.width||1)/Math.max(1,Number(manifest.height||1)));
    manifest.layers.slice(0,12).forEach((layer,i)=>{loader.load(assetBase+encodeURIComponent(layer.file),tex=>{tex.colorSpace=THREE.SRGBColorSpace;const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,opacity:.16+Math.min(.20,i*.018),depthWrite:false,fog:true,side:THREE.DoubleSide});const plane=new THREE.Mesh(new THREE.PlaneGeometry(24*aspect,24),mat);plane.position.set((i%2?-.25:.25)*i,7.2,-14-i*4.4);plane.scale.setScalar(1+i*.055);depthLayerGroup.add(plane);depthLayerCount++;state.depthLayers=depthLayerCount;},undefined,()=>{});});
  }

  const post=new DreamFogPostFX(THREE,renderer,camera);
  const state={tier,seed:Number(seed)||771923,fogBanks:0,particles:0,weather:0,creatures:0,lights:0,postFX:false,anomalyActive:false,depthLayers:0,theme:Object.fromEntries(Object.entries(theme).map(([k,v])=>[k,String(v)]))};

  function setTier(next,reason='manual'){
    if(!TIERS[next])return;const q=TIERS[next];tier=next;state.tier=next;scene.fog.density=q.fogDensity;
    fogBanks.forEach((m,i)=>m.visible=i<q.fogBanks);particles.geometry.setDrawRange(0,q.particles);weather.geometry.setDrawRange(0,q.weather);core.count=limb.count=halo.count=q.creatures;
    lightSprites.forEach((s,i)=>s.visible=i<q.lights);lights.forEach((l,i)=>l.visible=i<q.lights);post.enabled=q.post&&!coarse&&post.supported;
    renderer.setPixelRatio(Math.min(renderer.getPixelRatio?.()||devicePixelRatio||1,q.pixelRatioCap));renderer.setSize(innerWidth,innerHeight,false);
    state.fogBanks=q.fogBanks;state.particles=q.particles;state.weather=q.weather;state.creatures=q.creatures;state.lights=q.lights;state.postFX=post.enabled;onQualityChange({...state,reason});
    window.dispatchEvent(new CustomEvent('dreamfogquality',{detail:{...state,reason}}));
  }

  let lowHits=0,highHits=0;
  const perfHandler=e=>{
    const ema=Number(e.detail?.ema||0);if(!ema)return;
    if(ema<28){lowHits++;highHits=0;}else if(ema>52){highHits++;lowHits=0;}else{lowHits=Math.max(0,lowHits-1);highHits=Math.max(0,highHits-1);}
    if(lowHits>=2){lowHits=0;if(tier==='cinematic')setTier('balanced','fps');else if(tier==='balanced')setTier(coarse?'low':'mobile','fps');else if(tier==='mobile')setTier('low','fps');}
    if(highHits>=4&&!coarse){highHits=0;if(tier==='low')setTier('mobile','fps-recover');else if(tier==='mobile')setTier('balanced','fps-recover');else if(tier==='balanced')setTier('cinematic','fps-recover');}
  };window.addEventListener('goldenperformance',perfHandler);

  let audio=null;
  async function enableAudio(){
    if(audio)return audio;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;
    const ctx=new AC();await ctx.resume();const master=ctx.createGain();master.gain.value=.018;master.connect(ctx.destination);
    const osc=ctx.createOscillator();const filter=ctx.createBiquadFilter();const gain=ctx.createGain();osc.type='sine';osc.frequency.value=43;filter.type='lowpass';filter.frequency.value=150;gain.gain.value=.34;osc.connect(filter);filter.connect(gain);gain.connect(master);osc.start();
    const len=Math.floor(ctx.sampleRate*2),buf=ctx.createBuffer(1,len,ctx.sampleRate),d=buf.getChannelData(0);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*.12;const src=ctx.createBufferSource();src.buffer=buf;src.loop=true;const nf=ctx.createBiquadFilter();nf.type='lowpass';nf.frequency.value=420;src.connect(nf);nf.connect(master);src.start();audio={ctx,master,osc,src};return audio;
  }

  function update(time,dt){
    const t=time*.001,speed=reduced?.25:1;
    waterMat.uniforms.time.value=t*speed;weatherMat.uniforms.time.value=t*speed;
    for(let i=0;i<fogBanks.length;i++){const m=fogBanks[i],u=m.userData;const a=u.angle+t*u.speed*speed;m.position.set(camera.position.x+Math.cos(a)*u.radius,u.y+Math.sin(t*.17+u.phase)*.35,camera.position.z+Math.sin(a)*u.radius);m.lookAt(camera.position.x,m.position.y,camera.position.z);m.material.opacity=(.075+(i%4)*.018)*(1+.12*Math.sin(t*.21+u.phase));}
    for(let i=0;i<core.count;i++){
      const c=creatures[i],wave=Math.sin(t*(.18+(i%5)*.013)*speed+c.phase),sway=Math.sin(t*.11*speed+c.phase)*.12;
      dummy.position.set(c.x,c.tall*.44+.18+wave*.08,c.z);dummy.rotation.set(sway,c.lean+sway,Math.sin(c.phase+t*.09)*.08);dummy.scale.set(c.scale*(1+wave*.045),c.tall*.42*(1-wave*.03),c.scale*(.8+wave*.035));dummy.updateMatrix();core.setMatrixAt(i,dummy.matrix);
      dummy.position.set(c.x,c.tall*.19,c.z);dummy.rotation.set(c.lean*.7,0,sway);dummy.scale.set(c.scale*.72,c.tall*.42,c.scale*.72);dummy.updateMatrix();limb.setMatrixAt(i,dummy.matrix);
      if(c.halo){dummy.position.set(c.x,c.tall*.72,c.z);dummy.rotation.set(Math.PI/2+sway,c.phase*.2,sway);dummy.scale.setScalar(c.scale*1.05);}else{dummy.position.set(c.x,-50,c.z);dummy.scale.setScalar(.001);}dummy.updateMatrix();halo.setMatrixAt(i,dummy.matrix);
    }
    core.instanceMatrix.needsUpdate=limb.instanceMatrix.needsUpdate=halo.instanceMatrix.needsUpdate=true;
    particleMat.opacity=.18+.035*Math.sin(t*.23);
    for(const s of lightSprites){const ph=s.position.x*.1+s.position.z*.13;s.material.opacity=.17+.08*(.5+.5*Math.sin(t*.37+ph));}
    nextAnomaly-=dt;
    if(nextAnomaly<=0){const target=anomalies[(rng()*anomalies.length)|0];target.active=true;target.phase=t;nextAnomaly=16+rng()*28;}
    let any=false;
    for(const a of anomalies){a.mesh.lookAt(camera.position.x,a.mesh.position.y,camera.position.z);if(!a.active){a.mesh.material.opacity=0;continue;}const age=t-a.phase;const fade=age<1.2?age/1.2:age<4.8?1:Math.max(0,1-(age-4.8)/2);a.mesh.material.opacity=.12*fade;any=any||fade>0;if(age>6.8)a.active=false;}
    state.anomalyActive=any;
  }

  function render(time){post.render(scene,camera,time*.001);}
  function resize(w=innerWidth,h=innerHeight){post.resize(w,h);}
  function dispose(){window.removeEventListener('goldenperformance',perfHandler);post.dispose();noiseTex.dispose();glowTex.dispose();particleGeo.dispose();particleMat.dispose();weatherGeo.dispose();weatherMat.dispose();coreGeo.dispose();limbGeo.dispose();haloGeo.dispose();creatureMat.dispose();fogGeom.dispose();fogBanks.forEach(x=>x.material.dispose());water.geometry.dispose();waterMat.dispose();anomalies.forEach(a=>{a.mesh.geometry.dispose();a.mesh.material.dispose();});if(audio){try{audio.osc.stop();audio.src.stop();audio.ctx.close();}catch{}}scene.remove(root);}

  setTier(initialTier,'initial');
  return {state,colliders,update,render,resize,dispose,setTier,enableAudio,theme,tiers:TIERS,debug:{fogBanks,particles,core,limb,halo,water,anomalies}};
}

export {TIERS};
