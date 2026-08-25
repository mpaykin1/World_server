(() => {
'use strict';
const G=globalThis;if(G.WorldProceduralSkinnedVelocity?.version==='8.0.0')return;
const states=new WeakMap(), deformers=new WeakMap();
function hasTimeUniform(m){const u=m?.uniforms||{};return ['time','uTime','iTime','elapsed','phase'].some(k=>u[k]!=null)}
function cloneBoneTexture(mesh,THREE){
  const sk=mesh?.skeleton;if(!sk)return null;
  try{if(!sk.boneTexture&&sk.computeBoneTexture)sk.computeBoneTexture()}catch(_){}
  const cur=sk.boneMatrices;
  if(!cur||!cur.length)return null;
  let st=states.get(mesh);
  const size=sk.boneTextureSize||Math.max(4,Math.ceil(Math.sqrt(cur.length/4)));
  if(!st||st.prevData?.length!==cur.length){
    const prevData=new Float32Array(cur);
    const prevTex=new THREE.DataTexture(prevData,size,size,THREE.RGBAFormat,THREE.FloatType);
    prevTex.magFilter=THREE.NearestFilter;prevTex.minFilter=THREE.NearestFilter;prevTex.generateMipmaps=false;prevTex.needsUpdate=true;
    st={prevData,prevTex,size,initialized:false,lastMorph:null};
    states.set(mesh,st);
  }else{
    st.prevData.set(cur);
    st.prevTex.needsUpdate=true;
  }
  try{sk.update?.()}catch(_){}
  st.size=sk.boneTextureSize||size;st.initialized=true;
  return st;
}
function prepare(scene,THREE){
  let count=0,proceduralReactive=0;
  scene?.traverse?.(o=>{
    if(o?.isSkinnedMesh&&o.skeleton){cloneBoneTexture(o,THREE);count++}
    const mats=Array.isArray(o?.material)?o.material:[o?.material];
    if(o?.morphTargetInfluences?.length||mats.some(hasTimeUniform)||o?.userData?.proceduralDeformer){
      o.userData=o.userData||{};o.userData.__pqDeformationReactive=true;proceduralReactive++;
    }
  });
  return{skinnedMeshes:count,proceduralReactive};
}
function registerDeformer(object,provider){if(!object||typeof provider!=='function')throw new TypeError('object/provider required');deformers.set(object,provider);object.userData=object.userData||{};object.userData.proceduralDeformer=true;return()=>deformers.delete(object)}
function deformerVelocity(object,vertex,ctx){try{return deformers.get(object)?.(vertex,ctx)||null}catch(_){return null}}
function materialFor(mesh,THREE,{prevModel,prevVP,currVP}={}){
  const st=states.get(mesh),sk=mesh?.skeleton;
  if(!st||!sk?.boneTexture)return null;
  const mat=new THREE.ShaderMaterial({
    depthTest:true,depthWrite:true,toneMapped:false,
    uniforms:{
      pqPrevModel:{value:prevModel?.clone?.()||new THREE.Matrix4()},
      pqPrevVP:{value:prevVP?.clone?.()||new THREE.Matrix4()},
      pqCurrVP:{value:currVP?.clone?.()||new THREE.Matrix4()},
      bindMatrix:{value:mesh.bindMatrix},
      bindMatrixInverse:{value:mesh.bindMatrixInverse},
      boneTexture:{value:sk.boneTexture},
      boneTextureSize:{value:Number(sk.boneTextureSize||st.size)},
      prevBoneTexture:{value:st.prevTex},
      prevBoneTextureSize:{value:Number(st.size)}
    },
    vertexShader:`precision highp float;
attribute vec3 position; attribute vec4 skinIndex; attribute vec4 skinWeight;
uniform mat4 modelMatrix; uniform mat4 pqPrevModel; uniform mat4 pqPrevVP; uniform mat4 pqCurrVP;
uniform mat4 bindMatrix; uniform mat4 bindMatrixInverse;
uniform sampler2D boneTexture; uniform float boneTextureSize;
uniform sampler2D prevBoneTexture; uniform float prevBoneTextureSize;
varying vec4 pqCurrClip; varying vec4 pqPrevClip;
mat4 boneMat(sampler2D tex,float size,float i){
 float j=i*4.0;float x=mod(j,size);float y=floor(j/size);
 float dx=1.0/size,dy=1.0/size;y=dy*(y+0.5);
 vec4 v1=texture2D(tex,vec2(dx*(x+0.5),y));
 vec4 v2=texture2D(tex,vec2(dx*(x+1.5),y));
 vec4 v3=texture2D(tex,vec2(dx*(x+2.5),y));
 vec4 v4=texture2D(tex,vec2(dx*(x+3.5),y));
 return mat4(v1,v2,v3,v4);
}
vec4 skinPos(sampler2D tex,float size){
 vec4 p=bindMatrix*vec4(position,1.0);
 mat4 bm=skinWeight.x*boneMat(tex,size,skinIndex.x)+
         skinWeight.y*boneMat(tex,size,skinIndex.y)+
         skinWeight.z*boneMat(tex,size,skinIndex.z)+
         skinWeight.w*boneMat(tex,size,skinIndex.w);
 return bindMatrixInverse*(bm*p);
}
void main(){
 vec4 cLocal=skinPos(boneTexture,boneTextureSize);
 vec4 pLocal=skinPos(prevBoneTexture,prevBoneTextureSize);
 pqCurrClip=pqCurrVP*(modelMatrix*cLocal);
 pqPrevClip=pqPrevVP*(pqPrevModel*pLocal);
 gl_Position=pqCurrClip;
}`,
    fragmentShader:`precision highp float;varying vec4 pqCurrClip;varying vec4 pqPrevClip;
void main(){
 vec2 c=pqCurrClip.xy/max(1e-6,pqCurrClip.w);
 vec2 p=pqPrevClip.xy/max(1e-6,pqPrevClip.w);
 vec2 velocity=(c-p)*0.5;
 gl_FragColor=vec4(clamp(velocity+0.5,0.0,1.0),1.0,1.0);
}`
  });
  mat.userData={proceduralQuality:true,trueSkinnedVelocity:true};
  return mat;
}
function shouldReactive(o){
  if(!o)return false;
  if(o.userData?.__pqDeformationReactive&&!deformers.has(o))return true;
  const mats=Array.isArray(o.material)?o.material:[o.material];
  return mats.some(m=>m?.transparent||Number(m?.opacity??1)<.999||m?.userData?.proceduralReactive);
}
G.WorldProceduralSkinnedVelocity={version:'8.0.0',prepare,materialFor,registerDeformer,deformerVelocity,shouldReactive,
  capability:{skinnedPerPixel:true,morphFallback:'reactive',customDeformerAPI:true}};
})();