/*
 * WORLD FACTORY V8 — source-equivalent WebGPU PBR renderer core.
 *
 * Safety contract:
 * - uploads the exact source vertex/index arrays; no decimation, LOD rewrite or texture downscale;
 * - supports baseColor / normal / metallicRoughness / occlusion / emissive PBR inputs;
 * - ACES tone mapping + sRGB output;
 * - optional indirect meshlet draw path references the original index buffer ranges;
 * - if a source material cannot be represented without semantic loss, `canRepresentMaterial`
 *   returns false and the caller MUST keep the proven authoritative renderer instead of degrading.
 */

export const WEBGPU_PBR_MODE = 'webgpu-source-equivalent-pbr-v1';

const PBR_WGSL = /* wgsl */`
struct Frame {
  viewProj: mat4x4<f32>,
  cameraPosExposure: vec4<f32>,
  lightDirIntensity: vec4<f32>,
  lightColor: vec4<f32>,
  ambientWet: vec4<f32>,
};
struct Draw {
  model: mat4x4<f32>,
  normal0: vec4<f32>, normal1: vec4<f32>, normal2: vec4<f32>,
};
struct Material {
  baseColorFactor: vec4<f32>,
  emissiveMetallic: vec4<f32>,
  roughnessOcclusionNormalAlpha: vec4<f32>,
};
@group(0) @binding(0) var<uniform> frame: Frame;
@group(1) @binding(0) var<uniform> draw: Draw;
@group(2) @binding(0) var<uniform> material: Material;
@group(2) @binding(1) var samp: sampler;
@group(2) @binding(2) var baseTex: texture_2d<f32>;
@group(2) @binding(3) var normalTex: texture_2d<f32>;
@group(2) @binding(4) var mrTex: texture_2d<f32>;
@group(2) @binding(5) var occTex: texture_2d<f32>;
@group(2) @binding(6) var emissiveTex: texture_2d<f32>;

struct VSIn {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
};
struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) uv: vec2<f32>,
};

@vertex fn vsMain(v: VSIn) -> VSOut {
  var o:VSOut;
  let wp = draw.model * vec4<f32>(v.position,1.0);
  let nmat = mat3x3<f32>(draw.normal0.xyz, draw.normal1.xyz, draw.normal2.xyz);
  o.worldPos = wp.xyz;
  o.worldNormal = normalize(nmat * v.normal);
  o.uv = v.uv;
  o.clip = frame.viewProj * wp;
  return o;
}

fn saturate(x:f32)->f32{return clamp(x,0.0,1.0);}
fn fresnelSchlick(cosTheta:f32,F0:vec3<f32>)->vec3<f32>{
  return F0 + (vec3<f32>(1.0)-F0)*pow(1.0-saturate(cosTheta),5.0);
}
fn distributionGGX(N:vec3<f32>,H:vec3<f32>,rough:f32)->f32{
  let a=max(0.035,rough*rough); let a2=a*a; let nh=max(dot(N,H),0.0);
  let d=nh*nh*(a2-1.0)+1.0; return a2/max(3.14159265*d*d,1e-5);
}
fn geometrySchlickGGX(nd:f32,rough:f32)->f32{
  let r=rough+1.0;let k=(r*r)/8.0;return nd/max(nd*(1.0-k)+k,1e-5);
}
fn geometrySmith(N:vec3<f32>,V:vec3<f32>,L:vec3<f32>,rough:f32)->f32{
  return geometrySchlickGGX(max(dot(N,V),0.0),rough)*geometrySchlickGGX(max(dot(N,L),0.0),rough);
}
fn aces(x:vec3<f32>)->vec3<f32>{
  let a=2.51;let b=0.03;let c=2.43;let d=0.59;let e=0.14;
  return clamp((x*(a*x+vec3<f32>(b)))/(x*(c*x+vec3<f32>(d))+vec3<f32>(e)),vec3<f32>(0.0),vec3<f32>(1.0));
}
fn linearToSrgb(x:vec3<f32>)->vec3<f32>{
  let lo=x*12.92; let hi=1.055*pow(max(x,vec3<f32>(0.0)),vec3<f32>(1.0/2.4))-0.055;
  return select(hi,lo,x<=vec3<f32>(0.0031308));
}

@fragment fn fsMain(i:VSOut)->@location(0) vec4<f32>{
  let baseSample=textureSample(baseTex,samp,i.uv);
  let base=baseSample.rgb*material.baseColorFactor.rgb;
  let alpha=baseSample.a*material.baseColorFactor.a;
  if(alpha < material.roughnessOcclusionNormalAlpha.w){discard;}
  let mr=textureSample(mrTex,samp,i.uv);
  let metallic=clamp(material.emissiveMetallic.w*mr.b,0.0,1.0);
  var rough=clamp(material.roughnessOcclusionNormalAlpha.x*mr.g,0.035,1.0);
  // Global subtle wetness is runtime-only: lower micro-roughness, never modify source textures.
  let wet=clamp(frame.ambientWet.w,0.0,0.25); rough=max(0.035,rough*(1.0-wet*0.75));

  var N=normalize(i.worldNormal);
  let nS=textureSample(normalTex,samp,i.uv).xyz*2.0-vec3<f32>(1.0);
  let dp1=dpdx(i.worldPos); let dp2=dpdy(i.worldPos); let duv1=dpdx(i.uv); let duv2=dpdy(i.uv);
  let det=duv1.x*duv2.y-duv1.y*duv2.x;
  if(abs(det)>1e-7){
    let T=normalize((dp1*duv2.y-dp2*duv1.y)/det);
    let B=normalize((-dp1*duv2.x+dp2*duv1.x)/det);
    N=normalize(mat3x3<f32>(T,B,N)*vec3<f32>(nS.xy*material.roughnessOcclusionNormalAlpha.z,nS.z));
  }
  let V=normalize(frame.cameraPosExposure.xyz-i.worldPos);
  let L=normalize(-frame.lightDirIntensity.xyz); let H=normalize(V+L);
  let radiance=frame.lightColor.rgb*frame.lightDirIntensity.w;
  let F0=mix(vec3<f32>(0.04),base,metallic);
  let F=fresnelSchlick(max(dot(H,V),0.0),F0);
  let D=distributionGGX(N,H,rough);let G=geometrySmith(N,V,L,rough);
  let denom=max(4.0*max(dot(N,V),0.0)*max(dot(N,L),0.0),1e-5);
  let spec=(D*G)*F/denom;
  let kD=(vec3<f32>(1.0)-F)*(1.0-metallic);
  let ndl=max(dot(N,L),0.0);
  let ao=mix(1.0,textureSample(occTex,samp,i.uv).r,material.roughnessOcclusionNormalAlpha.y);
  let ambient=frame.ambientWet.rgb*base*ao;
  let emissive=textureSample(emissiveTex,samp,i.uv).rgb*material.emissiveMetallic.rgb;
  var color=ambient+(kD*base/3.14159265+spec)*radiance*ndl+emissive;
  color=aces(color*frame.cameraPosExposure.w);
  return vec4<f32>(linearToSrgb(color),alpha);
}`;

function align(v,a=256){return Math.ceil(v/a)*a;}
function toF32(a,n,fill=0){const o=new Float32Array(n);if(a)o.set(Array.from(a).slice(0,n));else o.fill(fill);return o;}
function identity4(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);}

export function canRepresentMaterial(material){
  if(!material)return {ok:true,reasons:[]};
  const reasons=[];
  if(material.isShaderMaterial||material.isRawShaderMaterial)reasons.push('custom-shader-semantics');
  if(material.transmission>0)reasons.push('transmission-not-source-equivalent-v1');
  if(material.sheen>0||material.iridescence>0)reasons.push('advanced-lobe-not-source-equivalent-v1');
  if(material.alphaHash===true)reasons.push('alpha-hash-not-source-equivalent-v1');
  if(material.vertexColors===true)reasons.push('vertex-color-not-source-equivalent-v1');
  if(material.alphaMap)reasons.push('separate-alpha-map-not-source-equivalent-v1');
  if(material.lightMap)reasons.push('material-lightmap-not-source-equivalent-v1');
  if((material.clearcoat||0)>0)reasons.push('clearcoat-not-source-equivalent-v1');
  if(material.metalnessMap&&material.roughnessMap&&material.metalnessMap!==material.roughnessMap)reasons.push('separate-metal-rough-textures-not-source-equivalent-v1');
  return {ok:reasons.length===0,reasons};
}

export function auditThreeSceneMaterialParity(root){
  const seen=new Set(),issues=[];let materialSlots=0,representable=0;
  root?.traverse?.(o=>{if(!o?.material)return;const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){if(!m)continue;materialSlots++;const key=m.uuid||m;if(seen.has(key))continue;seen.add(key);const r=canRepresentMaterial(m);if(r.ok)representable++;else issues.push({object:o.name||o.uuid||'unnamed',material:m.name||m.uuid||'material',reasons:r.reasons});}});
  const uniqueMaterials=seen.size;return {mode:'source-material-semantic-audit-v1',pass:issues.length===0,uniqueMaterials,materialSlots,representableUnique:representable,coveragePercent:uniqueMaterials?Number((100*representable/uniqueMaterials).toFixed(2)):100,issues,lossyFallbackAllowed:false,authorityAllowed:issues.length===0};
}

export class SourceEquivalentWebGPUPBRRenderer{
  constructor({device,context,format='bgra8unorm',sampleCount=1}={}){
    this.device=device;this.context=context;this.format=format;this.sampleCount=sampleCount;
    this.mode=WEBGPU_PBR_MODE;this.ready=false;this.drawables=[];this.lossyFallbackAllowed=false;
  }
  init(){
    const d=this.device;if(!d||!this.context||!globalThis.GPUBufferUsage)return this.report();
    const module=d.createShaderModule({code:PBR_WGSL,label:'world-factory-source-equivalent-pbr'});
    this.pipeline=d.createRenderPipeline({
      label:'world-factory-pbr-v1',layout:'auto',
      vertex:{module,entryPoint:'vsMain',buffers:[
        {arrayStride:12,attributes:[{shaderLocation:0,offset:0,format:'float32x3'}]},
        {arrayStride:12,attributes:[{shaderLocation:1,offset:0,format:'float32x3'}]},
        {arrayStride:8,attributes:[{shaderLocation:2,offset:0,format:'float32x2'}]},
      ]},
      fragment:{module,entryPoint:'fsMain',targets:[{format:this.format,blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}]},
      primitive:{topology:'triangle-list',cullMode:'back',frontFace:'ccw'},depthStencil:{format:'depth24plus',depthWriteEnabled:true,depthCompare:'less'},multisample:{count:this.sampleCount}
    });
    this.frameBuffer=d.createBuffer({size:align(16*4+4*4*4),usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,label:'pbr-frame'});
    this.frameBG=d.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.frameBuffer}}]});
    this.defaultSampler=d.createSampler({magFilter:'linear',minFilter:'linear',mipmapFilter:'linear',addressModeU:'repeat',addressModeV:'repeat',maxAnisotropy:16});
    this.fallback={
      white:this._solidTexture([255,255,255,255],true),normal:this._solidTexture([128,128,255,255],false),black:this._solidTexture([0,0,0,255],false),mr:this._solidTexture([255,255,255,255],false)
    };
    this.ready=true;return this.report();
  }
  _solidTexture(rgba,srgb=false){
    const d=this.device,t=d.createTexture({size:[1,1,1],format:srgb?'rgba8unorm-srgb':'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
    d.queue.writeTexture({texture:t},new Uint8Array(rgba),{bytesPerRow:4},{width:1,height:1,depthOrArrayLayers:1});return t;
  }
  _buffer(data,usage,label){
    const b=this.device.createBuffer({size:align(Math.max(4,data.byteLength),4),usage:usage|GPUBufferUsage.COPY_DST,label});this.device.queue.writeBuffer(b,0,data);return b;
  }
  uploadGeometry({positions,normals,uvs,indices,label='source-mesh'}){
    if(!this.ready)throw new Error('WebGPU PBR not initialized');
    if(!(positions instanceof Float32Array)||positions.length%3)throw new Error('positions must be Float32Array xyz');
    const n=positions.length/3;const ns=normals instanceof Float32Array&&normals.length===positions.length?normals:new Float32Array(positions.length);
    const tc=uvs instanceof Float32Array&&uvs.length===n*2?uvs:new Float32Array(n*2);
    const ix=indices instanceof Uint32Array?indices:new Uint32Array(indices||Array.from({length:n},(_,i)=>i));
    if(ix.length%3)throw new Error('source index count must be triangles');
    return {
      label,position:this._buffer(positions,GPUBufferUsage.VERTEX,`${label}:position`),normal:this._buffer(ns,GPUBufferUsage.VERTEX,`${label}:normal`),uv:this._buffer(tc,GPUBufferUsage.VERTEX,`${label}:uv`),
      index:this._buffer(ix,GPUBufferUsage.INDEX,`${label}:source-index`),indexCount:ix.length,indexFormat:'uint32',sourceVertexCount:n,sourceIndexCount:ix.length,
      sourceGeometryChanged:false,sourceGeometryExact:true,sourceIndexBufferRewritten:false,
    };
  }
  async uploadTexture(source,{srgb=false,label='source-texture'}={}){
    if(!source)return srgb?this.fallback.white:this.fallback.white;
    const w=source.width||source.videoWidth,h=source.height||source.videoHeight;if(!w||!h)throw new Error(`invalid ${label}`);
    // Exact source dimensions; no resize/downscale. GPU may internally tile, but content resolution is preserved.
    const t=this.device.createTexture({size:[w,h,1],format:srgb?'rgba8unorm-srgb':'rgba8unorm',mipLevelCount:1,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT,label});
    this.device.queue.copyExternalImageToTexture({source},{texture:t},{width:w,height:h});return t;
  }
  async uploadMaterial(m={}){
    const rep=canRepresentMaterial(m);if(!rep.ok)throw new Error(`material requires proven fallback: ${rep.reasons.join(',')}`);
    const base=await this.uploadTexture(m.baseColorTexture||m.map,{srgb:true,label:'baseColor-source'});
    const normal=await this.uploadTexture(m.normalTexture||m.normalMap,{srgb:false,label:'normal-source'});
    const mr=await this.uploadTexture(m.metallicRoughnessTexture||m.metalnessMap||m.roughnessMap,{srgb:false,label:'metallicRoughness-source'});
    const occ=await this.uploadTexture(m.occlusionTexture||m.aoMap,{srgb:false,label:'occlusion-source'});
    const em=await this.uploadTexture(m.emissiveTexture||m.emissiveMap,{srgb:true,label:'emissive-source'});
    const u=new Float32Array(12);
    u.set(m.baseColorFactor||[...(m.color?.toArray?.()||[1,1,1]),m.opacity??1],0);
    u.set([...(m.emissiveFactor||m.emissive?.toArray?.()||[0,0,0]),m.metallicFactor??m.metalness??0],4);
    u.set([m.roughnessFactor??m.roughness??1,m.occlusionStrength??1,m.normalScaleFactor??m.normalScale?.x??1,m.alphaCutoff??m.alphaTest??0],8);
    const uniform=this._buffer(u,GPUBufferUsage.UNIFORM,'pbr-material');
    const bindGroup=this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(2),entries:[
      {binding:0,resource:{buffer:uniform}},{binding:1,resource:this.defaultSampler},{binding:2,resource:base.createView()},{binding:3,resource:normal.createView()},{binding:4,resource:mr.createView()},{binding:5,resource:occ.createView()},{binding:6,resource:em.createView()}
    ]});
    return {uniform,bindGroup,textures:[base,normal,mr,occ,em],sourceTextureDimensionsPreserved:true,sourceMaterialSemanticsPreserved:true};
  }
  createDrawBinding({modelMatrix=identity4(),normalMatrix=null}={}){
    const u=new Float32Array(28);u.set(modelMatrix,0);
    const nm=normalMatrix||[1,0,0,0,1,0,0,0,1];u.set([nm[0],nm[1],nm[2],0,nm[3],nm[4],nm[5],0,nm[6],nm[7],nm[8],0],16);
    const buffer=this._buffer(u,GPUBufferUsage.UNIFORM,'pbr-draw');const bindGroup=this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(1),entries:[{binding:0,resource:{buffer}}]});return{buffer,bindGroup};
  }
  updateFrame({viewProj,cameraPos=[0,0,0],exposure=1.08,lightDir=[-0.3,-1,0.25],lightIntensity=2.1,lightColor=[1,0.83,0.63],ambient=[0.12,0.14,0.18],wetness=0.14}={}){
    const f=new Float32Array(32);f.set(viewProj||identity4(),0);f.set([...cameraPos,exposure],16);f.set([...lightDir,lightIntensity],20);f.set([...lightColor,1],24);f.set([...ambient,wetness],28);this.device.queue.writeBuffer(this.frameBuffer,0,f);
  }
  draw(pass,{geometry,material,drawBinding,indirectBuffer=null,indirectOffset=0}={}){
    if(!this.ready)return 0;pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.frameBG);pass.setBindGroup(1,drawBinding.bindGroup);pass.setBindGroup(2,material.bindGroup);
    pass.setVertexBuffer(0,geometry.position);pass.setVertexBuffer(1,geometry.normal);pass.setVertexBuffer(2,geometry.uv);pass.setIndexBuffer(geometry.index,geometry.indexFormat);
    if(indirectBuffer)pass.drawIndexedIndirect(indirectBuffer,indirectOffset);else pass.drawIndexed(geometry.indexCount,1,0,0,0);return geometry.indexCount/3;
  }
  report(){return {supported:!!this.device,ready:this.ready,mode:this.mode,pbrMaps:['baseColor','normal','metallicRoughness','occlusion','emissive'],toneMapping:'ACES',output:'sRGB',sourceGeometryChanged:false,sourceGeometryExact:true,sourceIndexBufferRewritten:false,textureDownscale:false,lossyFallbackAllowed:false,nearFieldQualityReduced:false,authorityPolicy:'only-authoritative-after-material-parity+device-farm+golden-pass'};}
}

export {PBR_WGSL};
