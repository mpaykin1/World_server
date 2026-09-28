// Living Watercolor 3D — deterministic NPR layer for Three.js scenes.
// No external assets: paper grain, ink wobble and brush sprites are procedural.
const DEFAULT_STYLE=Object.freeze({
  inkColor:'#24364f',paperColor:'#f6f1e7',washColor:'#8794a4',
  washOpacity:.72,washLayers:6,edgeWidth:.022,edgeJitter:.17,
  granulation:.26,bleed:.16,shadowWash:.16,motion:.18,seed:73194217,
  lod:{near:18,mid:42,far:82,billboard:140}
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
const lerp=(a,b,t)=>a+(b-a)*t;

export function stableSeed(value=0){
  let h=2166136261;
  for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
  return h>>>0;
}
export function hash01(x=0,y=0,z=0,seed=0){
  let h=(Math.imul((x*997)|0,374761393)^Math.imul((y*991)|0,668265263)^Math.imul((z*983)|0,2147483647)^(seed|0))|0;
  h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return(h>>>0)/4294967295;
}
export function coherentWobble(seed,timeMs=0,speed=.00018){
  const s=(stableSeed(seed)%10000)*.001;
  return Math.sin(timeMs*speed+s)*.68+Math.sin(timeMs*speed*.47+s*1.73)*.32;
}
function validHex(value,fallback){return /^#[0-9a-f]{6}$/i.test(String(value||''))?String(value):fallback;}
export function createWatercolorStyle(overrides={}){
  const lod={...DEFAULT_STYLE.lod,...(overrides.lod||{})};
  return Object.freeze({
    ...DEFAULT_STYLE,...overrides,
    inkColor:validHex(overrides.inkColor,DEFAULT_STYLE.inkColor),
    paperColor:validHex(overrides.paperColor,DEFAULT_STYLE.paperColor),
    washColor:validHex(overrides.washColor,DEFAULT_STYLE.washColor),
    washOpacity:clamp(overrides.washOpacity??DEFAULT_STYLE.washOpacity,.05,1),
    washLayers:Math.round(clamp(overrides.washLayers??DEFAULT_STYLE.washLayers,1,12)),
    edgeWidth:clamp(overrides.edgeWidth??DEFAULT_STYLE.edgeWidth,.002,.08),
    edgeJitter:clamp(overrides.edgeJitter??DEFAULT_STYLE.edgeJitter,0,.5),
    granulation:clamp(overrides.granulation??DEFAULT_STYLE.granulation,0,.8),
    bleed:clamp(overrides.bleed??DEFAULT_STYLE.bleed,0,.7),
    shadowWash:clamp(overrides.shadowWash??DEFAULT_STYLE.shadowWash,0,.6),
    motion:clamp(overrides.motion??DEFAULT_STYLE.motion,0,.8),
    seed:stableSeed(overrides.seed??DEFAULT_STYLE.seed),lod:Object.freeze(lod)
  });
}
export function watercolorLodForDistance(distance,lod=DEFAULT_STYLE.lod){
  const d=Math.max(0,Number(distance)||0);
  if(d<=lod.near)return'near';if(d<=lod.mid)return'mid';
  if(d<=lod.far)return'far';return'budget';
}

function colorVec3(THREE,hex){const c=new THREE.Color(hex);return new THREE.Vector3(c.r,c.g,c.b);}
function makeCanvas(size){
  if(typeof OffscreenCanvas!=='undefined')return new OffscreenCanvas(size,size);
  if(typeof document!=='undefined'){const c=document.createElement('canvas');c.width=c.height=size;return c;}
  return null;
}
function makeBrushTexture(THREE,style,seed=0,size=128){
  const canvas=makeCanvas(size);if(!canvas)return null;
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  const rng=n=>hash01(n,n*7,n*13,seed);
  ctx.clearRect(0,0,size,size);ctx.globalCompositeOperation='source-over';
  for(let i=0;i<26;i++){
    const x=size*(.5+(rng(i)-.5)*.18),y=size*(.5+(rng(i+31)-.5)*.18);
    const rx=size*(.28+rng(i+67)*.18),ry=size*(.18+rng(i+91)*.22);
    ctx.save();ctx.translate(x,y);ctx.rotate((rng(i+121)-.5)*.7);
    ctx.globalAlpha=.025+rng(i+151)*.035;ctx.fillStyle=style.inkColor;
    ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.needsUpdate=true;
  texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;return texture;
}
function makeWashTexture(THREE,style,seed=0,size=192){
  const canvas=makeCanvas(size);if(!canvas)return null;
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,size,size);
  for(let i=0;i<44;i++){
    const x=hash01(i,41,7,seed)*size,y=hash01(i,43,11,seed)*size;
    const rx=size*(.08+hash01(i,47,13,seed)*.22),ry=size*(.06+hash01(i,53,17,seed)*.18);
    const a=.035+hash01(i,59,19,seed)*.095;
    ctx.save();ctx.translate(x,y);ctx.rotate((hash01(i,61,23,seed)-.5)*1.2);
    ctx.fillStyle=`rgba(70,88,112,${a})`;ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  for(let i=0;i<20;i++){
    const x=hash01(i,67,29,seed)*size,y=hash01(i,71,31,seed)*size,r=size*(.035+hash01(i,73,37,seed)*.09);
    const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(255,255,255,.20)');g.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(1.8,1.8);
  if('colorSpace' in texture)texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;return texture;
}

function makePaperTexture(THREE,style,seed=0,size=128){
  const canvas=makeCanvas(size);if(!canvas)return null;
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  ctx.fillStyle=style.paperColor;ctx.fillRect(0,0,size,size);
  for(let i=0;i<260;i++){
    const a=.012+hash01(i,7,9,seed)*.022,x=hash01(i,11,5,seed)*size,y=hash01(i,17,3,seed)*size;
    ctx.strokeStyle=`rgba(36,54,79,${a})`;ctx.lineWidth=.35+hash01(i,23,2,seed)*.7;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+6+hash01(i,29,1,seed)*24,y+(hash01(i,31,4,seed)-.5)*2);ctx.stroke();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.repeat?.set?.(7,7);texture.needsUpdate=true;return texture;
}
function patchWatercolorMaterial(THREE,material,style,seed,states,washTexture){
  if(!material||material.userData?.livingWatercolorPatched)return material;
  if(!material.isMeshStandardMaterial&&!material.isMeshPhysicalMaterial&&!material.isMeshLambertMaterial)return material;
  const m=material.clone();m.userData={...(material.userData||{}),livingWatercolorPatched:true};
  const state={uniforms:null,seed:stableSeed(seed),baseOpacity:Number(m.opacity??1)};states.add(state);
  const previous=m.onBeforeCompile,previousKey=m.customProgramCacheKey?.bind(m);
  m.onBeforeCompile=(shader,...rest)=>{
    previous?.(shader,...rest);
    Object.assign(shader.uniforms,{
      uWcTime:{value:0},uWcSeed:{value:(state.seed%10000)/10000},
      uWcPaper:{value:colorVec3(THREE,style.paperColor)},uWcInk:{value:colorVec3(THREE,style.inkColor)},uWcWashColor:{value:colorVec3(THREE,style.washColor)},
      uWcWash:{value:style.washOpacity},uWcGran:{value:style.granulation},uWcBleed:{value:style.bleed},uWcQuality:{value:1}
    });
    state.uniforms=shader.uniforms;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWcWorld;');
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvWcWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 vWcWorld;\nuniform float uWcTime,uWcSeed,uWcWash,uWcGran,uWcBleed,uWcQuality;\nuniform vec3 uWcPaper,uWcInk,uWcWashColor;\nfloat wcHash(vec3 p){p=fract(p*.1031+uWcSeed);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}`);
    const needle='#include <color_fragment>';
    if(shader.fragmentShader.includes(needle))shader.fragmentShader=shader.fragmentShader.replace(needle,`${needle}\nfloat wcFlow1=sin(dot(vWcWorld,vec3(1.73,2.11,.87))+uWcSeed*19.0);\nfloat wcFlow2=sin(dot(vWcWorld,vec3(-2.37,.91,1.41))+uWcSeed*11.0);\nfloat wcFlow3=sin(dot(vWcWorld,vec3(.63,-1.57,2.83))+uWcSeed*7.0);\nfloat wcGrain=sin(dot(vWcWorld,vec3(7.7,6.3,8.9))+uWcSeed*29.0)*.5+.5;\nfloat wcFlow=(wcFlow1+wcFlow2*.72+wcFlow3*.48)/2.2;\nfloat wcDensity=clamp(uWcWash+wcFlow*uWcGran*.62+(wcGrain-.5)*uWcBleed*.34,.16,.96);\nvec3 wcPigment=mix(uWcWashColor,diffuseColor.rgb,.46);\ndiffuseColor.rgb=mix(uWcPaper,wcPigment,wcDensity);`);
  };
  m.customProgramCacheKey=()=>`${previousKey?.()||''}|living-watercolor-3d:${state.seed}:${style.washOpacity}`;
  if(!m.map&&washTexture)m.map=washTexture;m.roughness=Math.max(Number(m.roughness??.85),.92);m.metalness=Math.min(Number(m.metalness??0),.03);m.needsUpdate=true;
  return m;
}
function addInkShell(THREE,mesh,style,seed,outlineStates){
  if(mesh.userData?.livingWatercolorOutline||!mesh.geometry?.attributes?.normal)return null;
  const shells=[],passes=[[.82,.22],[1.0,.34],[1.24,.18]];
  for(let pass=0;pass<passes.length;pass++){
    const [widthScale,opacity]=passes[pass],passSeed=stableSeed(`${seed}:${pass}`);
    const uniforms={uTime:{value:0},uSeed:{value:(passSeed%10000)/10000},uWidth:{value:style.edgeWidth*widthScale},uJitter:{value:style.edgeJitter},uOpacity:{value:opacity},uInk:{value:colorVec3(THREE,style.inkColor)}};
    const material=new THREE.ShaderMaterial({
      uniforms,side:THREE.BackSide,transparent:true,depthWrite:false,depthTest:true,
      vertexShader:`uniform float uTime,uSeed,uWidth,uJitter;\nfloat h(vec3 p){p=fract(p*.1031+uSeed);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}\nvoid main(){float n=h(position*4.2),n2=h(position*11.7+vec3(uSeed));float breathe=sin(uTime*.11+uSeed*31.0)*.22;float w=uWidth*(.88+(n-.5)*uJitter*1.25+(n2-.5)*uJitter*.45+breathe*uJitter);vec3 p=position+normal*w;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`,
      fragmentShader:`uniform vec3 uInk;uniform float uOpacity;void main(){gl_FragColor=vec4(uInk,uOpacity);}`
    });
    const shell=new THREE.Mesh(mesh.geometry,material);shell.name='__livingWatercolorOutline';
    shell.frustumCulled=mesh.frustumCulled;shell.renderOrder=(mesh.renderOrder||0)-1-pass;shell.userData.livingWatercolorOutline=true;
    mesh.add(shell);outlineStates.add({mesh:shell,uniforms,baseOpacity:opacity});shells.push(shell);
  }
  return shells;
}

export function createLivingWatercolor3D({THREE,renderer,scene,camera,style:inputStyle={},autoQuality=true}={}){
  if(!THREE||!renderer)throw new Error('LivingWatercolor3D: THREE + renderer required');
  const style=createWatercolorStyle(inputStyle),materialStates=new Set(),outlineStates=new Set(),emitters=new Set(),roots=new Set();
  let quality=1,disposed=false;
  renderer.setClearColor?.(style.paperColor,1);if(renderer.domElement?.style)renderer.domElement.style.background=style.paperColor;
  const paperTexture=makePaperTexture(THREE,style,style.seed),brushTexture=makeBrushTexture(THREE,style,style.seed^0x51f15e),washTexture=makeWashTexture(THREE,style,style.seed^0x7f4a7c15);
  if(paperTexture&&'colorSpace' in paperTexture)paperTexture.colorSpace=THREE.SRGBColorSpace;
  if(scene&&!scene.background)scene.background=paperTexture||new THREE.Color(style.paperColor);

  function apply(root,{seed=style.seed,outline=true}={}){
    if(!root)return root;roots.add(root);let i=0;
    root.traverse?.(obj=>{
      if(!obj?.isMesh||obj.userData?.livingWatercolorOutline)return;
      obj.userData=obj.userData||{};if(!obj.userData.__livingWatercolorOriginalMaterial)obj.userData.__livingWatercolorOriginalMaterial=obj.material;
      const mats=Array.isArray(obj.material)?obj.material:[obj.material];
      const patched=mats.map((m,mi)=>patchWatercolorMaterial(THREE,m,style,stableSeed(`${seed}:${i}:${mi}`),materialStates));
      obj.material=Array.isArray(obj.material)?patched:patched[0];if(outline)addInkShell(THREE,obj,style,stableSeed(`${seed}:ink:${i}`),outlineStates);i++;
    });
    return root;
  }
  function addGroundWash(parent,{x=0,y=.012,z=0,width=3,depth=2,opacity=style.shadowWash,seed=style.seed}={}){
    const tex=makeBrushTexture(THREE,style,stableSeed(seed),128)||brushTexture;
    const mat=new THREE.SpriteMaterial({map:tex,color:style.inkColor,transparent:true,opacity,depthWrite:false});
    const sprite=new THREE.Sprite(mat);sprite.name='__livingWatercolorGroundWash';sprite.position.set(x,y,z);sprite.scale.set(width,depth,1);sprite.material.rotation=0;
    const holder=new THREE.Group();holder.rotation.x=-Math.PI/2;holder.add(sprite);parent?.add?.(holder);return holder;
  }
  function createBrushEmitter({parent,origin=new THREE.Vector3(),count=9,scale=.8,rise=.42,spread=.35,wind=.08,seed=style.seed,opacity=.15}={}){
    const group=new THREE.Group();group.position.copy(origin);parent?.add?.(group);const particles=[];
    for(let i=0;i<count;i++){
      const s=stableSeed(`${seed}:${i}`),mat=new THREE.SpriteMaterial({map:brushTexture,color:style.inkColor,transparent:true,depthWrite:false,opacity});
      const sprite=new THREE.Sprite(mat),phase=hash01(i,2,3,s),life=.65+hash01(i,7,11,s)*.9;
      sprite.scale.setScalar(scale*(.65+hash01(i,13,17,s)*.7));group.add(sprite);particles.push({sprite,phase,life,s});
    }
    const emitter={group,particles,origin:origin.clone?.()||origin,rise,spread,wind,scale,opacity,seed:stableSeed(seed)};emitters.add(emitter);return emitter;
  }
  function updateEmitter(e,timeMs){
    const seconds=timeMs/1000;
    e.particles.forEach((p,i)=>{
      const t=(seconds*.18+p.phase)%1,fade=Math.sin(Math.PI*t),side=(hash01(i,23,29,p.s)-.5)*e.spread;
      p.sprite.position.set(side+e.wind*t*2,t*e.rise*8,(hash01(i,31,37,p.s)-.5)*e.spread);
      const s=e.scale*(.55+t*1.25);p.sprite.scale.setScalar(s);p.sprite.material.opacity=e.opacity*fade*(.7+.3*quality);
    });
  }
  function tick(timeMs=performance.now()){
    if(disposed)return;
    const seconds=timeMs/1000;
    for(const s of materialStates)if(s.uniforms){s.uniforms.uWcTime.value=seconds;s.uniforms.uWcQuality.value=quality;}
    for(const s of outlineStates){s.uniforms.uTime.value=seconds;const d=camera&&s.mesh.getWorldPosition?camera.position.distanceTo(s.mesh.getWorldPosition(new THREE.Vector3())):0;const lod=watercolorLodForDistance(d,style.lod);s.uniforms.uOpacity.value=s.baseOpacity*(lod==='near'?1:lod==='mid'?.8:lod==='far'?.52:.25);s.uniforms.uJitter.value=style.edgeJitter*(.72+.28*quality);}
    for(const e of emitters)updateEmitter(e,timeMs);
  }
  function setQuality(value){quality=clamp(value,.35,1);return quality;}
  let qualityListener=null;
  if(autoQuality&&typeof window!=='undefined'){
    qualityListener=e=>setQuality(e?.detail?.quality??1);window.addEventListener('goldenqualitychange',qualityListener);
  }
  function diagnostics(){return{style,quality,roots:roots.size,materials:materialStates.size,outlines:outlineStates.size,emitters:emitters.size,paperTexture:Boolean(paperTexture),brushTexture:Boolean(brushTexture),washTexture:Boolean(washTexture)};}
  function dispose(){
    disposed=true;if(qualityListener&&typeof window!=='undefined')window.removeEventListener('goldenqualitychange',qualityListener);
    for(const s of outlineStates){s.mesh.material?.dispose?.();s.mesh.removeFromParent?.();}
    for(const e of emitters){for(const p of e.particles)p.sprite.material?.dispose?.();e.group.removeFromParent?.();}
    paperTexture?.dispose?.();brushTexture?.dispose?.();washTexture?.dispose?.();outlineStates.clear();emitters.clear();materialStates.clear();roots.clear();
  }
  return{style,apply,tick,setQuality,addGroundWash,createBrushEmitter,diagnostics,dispose,paperTexture,brushTexture,washTexture};
}

export{DEFAULT_STYLE};
