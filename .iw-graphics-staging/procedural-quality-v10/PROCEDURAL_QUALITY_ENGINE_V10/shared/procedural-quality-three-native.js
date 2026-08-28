(() => {
'use strict';
const G=globalThis;if(G.WorldProceduralThreeNative?.version==='8.0.0')return;
const attached=new WeakMap();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function hashColor(id){let x=(Number(id)||1)*2654435761>>>0;return[((x>>>16)&255)/255,((x>>>8)&255)/255,(x&255)/255]}
function attach(renderer,THREE,opts={}){
  if(!renderer?.domElement||!THREE?.WebGLRenderTarget||!THREE?.ShaderMaterial)return null;
  if(attached.has(renderer))return attached.get(renderer);
  const canvas=renderer.domElement, originalRender=renderer.render.bind(renderer);
  let lastScene=null,lastCamera=null,frameIndex=0,captureIndex=0,aux=false,targets=null;
  let prevModels=new WeakMap(),currModels=new WeakMap(),prevVP=new THREE.Matrix4(),currVP=new THREE.Matrix4();
  let lastNative=null;
  const savedMaterials=new Map(), semanticMats=new Map(), reactiveMats=new Map(), transparencyMats=new Map(), motionMats=new Map();
  const depthMat=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});
  const normalMat=new THREE.MeshNormalMaterial();
  function dims(){const s=renderer.getDrawingBufferSize(new THREE.Vector2());return{width:Math.max(1,s.x|0),height:Math.max(1,s.y|0)}}
  function makeTarget(w,h){const rt=new THREE.WebGLRenderTarget(w,h,{depthBuffer:true,stencilBuffer:false});rt.texture.generateMipmaps=false;return rt}
  function ensureTargets(w,h){
    if(targets&&targets.w===w&&targets.h===h)return targets;
    if(targets)for(const k of Object.keys(targets))if(targets[k]?.dispose)targets[k].dispose();
    targets={w,h,depth:makeTarget(w,h),normal:makeTarget(w,h),semantic:makeTarget(w,h),motion:makeTarget(w,h),reactive:makeTarget(w,h),transparency:makeTarget(w,h)};
    return targets;
  }
  function viewProj(camera){
    const out=new THREE.Matrix4();out.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);return out;
  }
  function snapshotScene(scene,camera){
    G.WorldProceduralSkinnedVelocity?.prepare?.(scene,THREE);
    prevModels=currModels;currModels=new WeakMap();
    scene.updateMatrixWorld?.(true);camera.updateMatrixWorld?.(true);
    scene.traverse?.(o=>{if(o?.isObject3D)currModels.set(o,o.matrixWorld.clone())});
    prevVP.copy(currVP);currVP.copy(viewProj(camera));
  }
  function eachRenderable(scene,fn){scene.traverse?.(o=>{if(o?.isMesh||o?.isPoints||o?.isLine)fn(o)})}
  function swap(scene,kind){
    savedMaterials.clear();
    eachRenderable(scene,o=>{
      savedMaterials.set(o,o.material);
      if(kind==='semantic'){
        let m=semanticMats.get(o);if(!m){const c=hashColor(o.id);m=new THREE.MeshBasicMaterial({color:new THREE.Color(c[0],c[1],c[2]),toneMapped:false});semanticMats.set(o,m)}o.material=m;
      }else if(kind==='reactive'){
        const arr=Array.isArray(o.material)?o.material:[o.material];
        const reactive=G.WorldProceduralSkinnedVelocity?.shouldReactive?.(o)||arr.some(m=>m?.transparent||Number(m?.opacity??1)<.999||m?.emissiveIntensity>0||m?.userData?.proceduralReactive);
        let m=reactiveMats.get(reactive);if(!m){m=new THREE.MeshBasicMaterial({color:reactive?0xffffff:0x000000,toneMapped:false});reactiveMats.set(reactive,m)}o.material=m;
      }else if(kind==='transparency'){
        const arr=Array.isArray(o.material)?o.material:[o.material],transparent=arr.some(m=>m?.transparent||Number(m?.opacity??1)<.999);
        let m=transparencyMats.get(transparent);if(!m){m=new THREE.MeshBasicMaterial({color:transparent?0xffffff:0x000000,toneMapped:false});transparencyMats.set(transparent,m)}o.material=m;
      }else if(kind==='motion'){
        let m=null;
        if(o.isSkinnedMesh&&G.WorldProceduralSkinnedVelocity){
          m=G.WorldProceduralSkinnedVelocity.materialFor(o,THREE,{prevModel:prevModels.get(o)||o.matrixWorld,prevVP,currVP});
        }
        if(!m)m=motionMats.get(o);
        if(!m){
          m=new THREE.ShaderMaterial({
            depthTest:true,depthWrite:true,toneMapped:false,
            uniforms:{pqPrevModel:{value:new THREE.Matrix4()},pqPrevVP:{value:new THREE.Matrix4()},pqCurrVP:{value:new THREE.Matrix4()}},
            vertexShader:`uniform mat4 pqPrevModel; uniform mat4 pqPrevVP; uniform mat4 pqCurrVP;
varying vec4 pqCurrClip; varying vec4 pqPrevClip;
void main(){vec4 local=vec4(position,1.0);vec4 world=modelMatrix*local;pqCurrClip=pqCurrVP*world;pqPrevClip=pqPrevVP*pqPrevModel*local;gl_Position=pqCurrClip;}`,
            fragmentShader:`precision highp float;varying vec4 pqCurrClip;varying vec4 pqPrevClip;
void main(){vec2 c=pqCurrClip.xy/max(1e-5,pqCurrClip.w);vec2 p=pqPrevClip.xy/max(1e-5,pqPrevClip.w);vec2 v=clamp((c-p)*0.5+0.5,0.0,1.0);gl_FragColor=vec4(v,0.0,1.0);}`
          });
          motionMats.set(o,m);
        }
        if(m.uniforms?.pqPrevModel)m.uniforms.pqPrevModel.value.copy(prevModels.get(o)||o.matrixWorld);
        if(m.uniforms?.pqPrevVP)m.uniforms.pqPrevVP.value.copy(prevVP);
        if(m.uniforms?.pqCurrVP)m.uniforms.pqCurrVP.value.copy(currVP);
        o.material=m;
      }
    });
  }
  function restore(){for(const[o,m]of savedMaterials)o.material=m;savedMaterials.clear()}
  function pass(scene,camera,target,kind){
    const oldTarget=renderer.getRenderTarget(),oldOverride=scene.overrideMaterial,oldAuto=renderer.autoClear;
    renderer.autoClear=true;renderer.setRenderTarget(target);renderer.clear(true,true,true);
    if(kind==='depth')scene.overrideMaterial=depthMat;
    else if(kind==='normal')scene.overrideMaterial=normalMat;
    else swap(scene,kind);
    aux=true;try{originalRender(scene,camera)}finally{aux=false;if(kind!=='depth'&&kind!=='normal')restore();scene.overrideMaterial=oldOverride;renderer.setRenderTarget(oldTarget);renderer.autoClear=oldAuto}
  }
  function captureFrame(){
    if(!lastScene||!lastCamera)return lastNative;
    const {width,height}=dims(),T=ensureTargets(width,height);
    pass(lastScene,lastCamera,T.depth,'depth');
    pass(lastScene,lastCamera,T.normal,'normal');
    pass(lastScene,lastCamera,T.semantic,'semantic');
    pass(lastScene,lastCamera,T.motion,'motion');
    pass(lastScene,lastCamera,T.reactive,'reactive');
    pass(lastScene,lastCamera,T.transparency,'transparency');
    const jit=G.WorldProceduralRendererContract?.jitter?.(frameIndex,width,height)||{x:0,y:0};
    lastNative={width,height,frameIndex:captureIndex++,backend:'three-webgl-native-v8',native:true,jitter:jit,
      color:{width,height,format:'canvas-rgba8',source:canvas},
      depth:{width,height,format:'rgba8-packed-depth',texture:T.depth.texture,renderTarget:T.depth},
      normal:{width,height,format:'rgba8-view-normal',texture:T.normal.texture,renderTarget:T.normal},
      semantic:{width,height,format:'rgba8-object-id',texture:T.semantic.texture,renderTarget:T.semantic},
      motion:{width,height,format:'rg8-velocity-encoded',texture:T.motion.texture,renderTarget:T.motion},
      reactive:{width,height,format:'r8unorm',texture:T.reactive.texture,renderTarget:T.reactive},
      transparency:{width,height,format:'r8unorm',texture:T.transparency.texture,renderTarget:T.transparency},
      meta:{sourceJitter:true,objectVelocity:true,skinnedPerPixelVelocity:true,proceduralDeformationReactive:true,renderer:'three',capturePasses:6}};
    return lastNative;
  }
  renderer.render=function(scene,camera){
    if(aux)return originalRender(scene,camera);
    lastScene=scene;lastCamera=camera;snapshotScene(scene,camera);
    const {width,height}=dims(),j=G.WorldProceduralRendererContract?.jitter?.(frameIndex,width,height)||{x:0,y:0};
    const pe=camera?.projectionMatrix?.elements,inv=camera?.projectionMatrixInverse,backup=pe?camera.projectionMatrix.clone():null;
    if(backup&&opts.sourceJitter!==false){camera.projectionMatrix.elements[8]+=j.x*2;camera.projectionMatrix.elements[9]+=j.y*2;if(inv?.copy)inv.copy(camera.projectionMatrix).invert()}
    try{return originalRender(scene,camera)}finally{if(backup){camera.projectionMatrix.copy(backup);if(inv?.copy)inv.copy(backup).invert()}frameIndex++}
  };
  renderer.getProceduralQualityFrame=async()=>captureFrame();
  renderer.getGBuffer=renderer.getProceduralQualityFrame;
  let off=null;
  try{
    if(G.WorldProceduralRendererContract)off=G.WorldProceduralRendererContract.register(canvas,{backend:'three-webgl-native-v8',captureFrame:()=>captureFrame()});
  }catch(_){}
  const rec={version:'8.0.0',renderer,canvas,captureFrame,detach(){if(off)off();renderer.render=originalRender;attached.delete(renderer);if(targets)for(const k of Object.keys(targets))targets[k]?.dispose?.()}};
  attached.set(renderer,rec);canvas.__worldProceduralThreeNative=rec;return rec;
}
function status(renderer){const r=attached.get(renderer);return r?{attached:true,backend:'three-webgl-native-v8'}:{attached:false}}
G.WorldProceduralThreeNative={version:'8.0.0',attach,status};
})();