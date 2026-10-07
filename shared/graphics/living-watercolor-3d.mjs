// Provenance: runtime facade adapted from mpaykin1/scratch-chain-reaction
// commit 761f993e00d7b4d479756a3957f01ada928a6e7b
import {
  DEFAULT_STYLE,clamp,stableSeed,hash01,createWatercolorStyle,watercolorLodForDistance,
  makePaperTexture,makeBrushTexture,makeWashTexture,patchWatercolorMaterial,addInkShell,createPaperCompositor
} from './living-watercolor-primitives.mjs';
export {DEFAULT_STYLE,stableSeed,hash01,coherentWobble,createWatercolorStyle,watercolorLodForDistance} from './living-watercolor-primitives.mjs';

export function createLivingWatercolor3D({THREE,renderer,scene,camera,style:inputStyle={},autoQuality=true}={}){
  if(!THREE||!renderer)throw new Error('LivingWatercolor3D: THREE + renderer required');
  const style=createWatercolorStyle(inputStyle),materialStates=new Set(),outlineStates=new Set(),emitters=new Set(),roots=new Set();
  let quality=1,disposed=false,compositor=null;
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
      const patched=obj.userData.watercolorSkipWash?mats:mats.map((m,mi)=>patchWatercolorMaterial(THREE,m,style,stableSeed(`${seed}:${i}:${mi}`),materialStates,washTexture));
      obj.material=Array.isArray(obj.material)?patched:patched[0];
      if(outline&&obj.userData.watercolorOutline!==false)addInkShell(THREE,obj,style,stableSeed(`${seed}:ink:${i}`),outlineStates);i++;
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
  function attachCompositor(options={}){if(!compositor)compositor=createPaperCompositor(renderer.domElement,style,()=>quality,options);return compositor;}
  function present(timeMs=performance.now()){compositor?.present?.(timeMs);}
  function captureImageData(){return compositor?.captureImageData?.()||null;}
  let qualityListener=null;
  if(autoQuality&&typeof window!=='undefined'){
    qualityListener=e=>setQuality(e?.detail?.quality??1);window.addEventListener('goldenqualitychange',qualityListener);
  }
  function diagnostics(){return{style,quality,roots:roots.size,materials:materialStates.size,outlines:outlineStates.size,emitters:emitters.size,paperTexture:Boolean(paperTexture),brushTexture:Boolean(brushTexture),washTexture:Boolean(washTexture)};}
  function dispose(){
    disposed=true;if(qualityListener&&typeof window!=='undefined')window.removeEventListener('goldenqualitychange',qualityListener);
    for(const s of outlineStates){s.mesh.material?.dispose?.();s.mesh.removeFromParent?.();}
    for(const e of emitters){for(const p of e.particles)p.sprite.material?.dispose?.();e.group.removeFromParent?.();}
    compositor?.dispose?.();compositor=null;paperTexture?.dispose?.();brushTexture?.dispose?.();washTexture?.dispose?.();outlineStates.clear();emitters.clear();materialStates.clear();roots.clear();
  }
  return{style,apply,tick,setQuality,addGroundWash,createBrushEmitter,attachCompositor,present,captureImageData,diagnostics,dispose,paperTexture,brushTexture,washTexture};
}

