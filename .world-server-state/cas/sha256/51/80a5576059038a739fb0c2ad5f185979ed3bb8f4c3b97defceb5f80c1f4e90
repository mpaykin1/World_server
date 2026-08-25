import * as THREE from 'three';

const DEPTH_VS=`
struct Camera { vp: mat4x4<f32> };
@group(0) @binding(0) var<uniform> camera: Camera;
struct VSOut { @builtin(position) pos: vec4<f32> };
@vertex fn main(@location(0) p: vec3<f32>) -> VSOut {
  var o:VSOut;
  var clip=camera.vp*vec4<f32>(p,1.0);
  // Three.js projection is OpenGL z [-w,+w]. WebGPU clip z is [0,+w].
  clip.z=clip.z*0.5+clip.w*0.5;
  o.pos=clip; return o;
}`;

const DEPTH_COPY_CS=`
@group(0) @binding(0) var src: texture_depth_2d;
@group(0) @binding(1) var dst: texture_storage_2d<r32float,write>;
@compute @workgroup_size(8,8)
fn main(@builtin(global_invocation_id) id:vec3<u32>){
 let d=textureDimensions(dst); if(id.x>=d.x||id.y>=d.y){return;}
 textureStore(dst,vec2<i32>(id.xy),vec4<f32>(textureLoad(src,vec2<i32>(id.xy),0),0.0,0.0,1.0));
}`;

const DOWNSAMPLE_CS=`
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<r32float,write>;
@compute @workgroup_size(8,8)
fn main(@builtin(global_invocation_id) id:vec3<u32>){
 let dd=textureDimensions(dst); if(id.x>=dd.x||id.y>=dd.y){return;}
 let sd=textureDimensions(src,0); let b=vec2<i32>(id.xy*2u);
 var m=0.0;
 for(var y:i32=0;y<2;y++){for(var x:i32=0;x<2;x++){
   let p=min(b+vec2<i32>(x,y),vec2<i32>(sd)-vec2<i32>(1,1));
   m=max(m,textureLoad(src,p,0).x);
 }}
 textureStore(dst,vec2<i32>(id.xy),vec4<f32>(m,0.0,0.0,1.0));
}`;

const VISIBILITY_CS=`
struct Params { vp:mat4x4<f32>, player:vec4<f32>, dims:vec4<f32> };
struct Candidate { center:vec4<f32>, extent:vec4<f32> };
@group(0) @binding(0) var<uniform> params:Params;
@group(0) @binding(1) var<storage,read> candidates:array<Candidate>;
@group(0) @binding(2) var hzb:texture_2d<f32>;
@group(0) @binding(3) var<storage,read_write> flags:array<u32>;
fn corner(i:u32,c:vec3<f32>,e:vec3<f32>)->vec3<f32>{
 return c+vec3<f32>(select(-e.x,e.x,(i&1u)!=0u),select(-e.y,e.y,(i&2u)!=0u),select(-e.z,e.z,(i&4u)!=0u));
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid:vec3<u32>){
 let i=gid.x; let count=u32(params.dims.z); if(i>=count){return;}
 let c=candidates[i].center.xyz; let e=candidates[i].extent.xyz;
 if(distance(c,params.player.xyz)<params.dims.w){flags[i]=0u;return;}
 var uvMin=vec2<f32>(1.0,1.0);var uvMax=vec2<f32>(0.0,0.0);var nearest=1.0;var valid=true;
 for(var k:u32=0u;k<8u;k++){
   var q=params.vp*vec4<f32>(corner(k,c,e),1.0);if(q.w<=0.0001){valid=false;break;}
   var ndc=q.xyz/q.w;ndc.z=ndc.z*0.5+0.5;
   let uv=ndc.xy*vec2<f32>(0.5,-0.5)+vec2<f32>(0.5,0.5);
   uvMin=min(uvMin,uv);uvMax=max(uvMax,uv);nearest=min(nearest,ndc.z);
 }
 if(!valid||uvMin.x<0.0||uvMin.y<0.0||uvMax.x>1.0||uvMax.y>1.0||nearest<=0.0||nearest>=1.0){flags[i]=0u;return;}
 let base=vec2<f32>(params.dims.xy);let px=max((uvMax.x-uvMin.x)*base.x,(uvMax.y-uvMin.y)*base.y);
 let levels=u32(textureNumLevels(hzb));
 var mip:u32=0u;if(px>3.0){mip=u32(max(0.0,floor(log2(px))-1.0));}mip=min(mip,levels-1u);
 let md=textureDimensions(hzb,i32(mip));let span=(uvMax-uvMin)*vec2<f32>(md);
 if(span.x>3.05||span.y>3.05){flags[i]=0u;return;}
 var farthestOccluder=0.0;
 for(var gy:u32=0u;gy<3u;gy++){for(var gx:u32=0u;gx<3u;gx++){
   let t=vec2<f32>(f32(gx)*0.5,f32(gy)*0.5);let uv=mix(uvMin,uvMax,t);
   let p=clamp(vec2<i32>(uv*vec2<f32>(md)),vec2<i32>(0),vec2<i32>(md)-vec2<i32>(1));
   farthestOccluder=max(farthestOccluder,textureLoad(hzb,p,i32(mip)).x);
 }}
 // Background depth=1 makes this fail visible, so holes cannot over-cull.
 flags[i]=select(0u,1u,nearest>farthestOccluder+0.0025 && farthestOccluder<0.9995);
}`;

function worldPositions(mesh,maxTriangles,left){
  const g=mesh.geometry,attr=g?.attributes?.position;if(!attr)return null;
  mesh.updateMatrixWorld(true);const M=mesh.matrixWorld;const v=new THREE.Vector3();const out=[];let tris=0;
  const idx=g.index?.array;
  const pushIndex=(i)=>{v.fromBufferAttribute(attr,i).applyMatrix4(M);out.push(v.x,v.y,v.z);};
  if(idx){for(let i=0;i+2<idx.length&&tris<maxTriangles&&tris<left;i+=3,tris++){pushIndex(idx[i]);pushIndex(idx[i+1]);pushIndex(idx[i+2]);}}
  else{for(let i=0;i+2<attr.count&&tris<maxTriangles&&tris<left;i+=3,tris++){pushIndex(i);pushIndex(i+1);pushIndex(i+2);}}
  return {data:out,triangles:tris};
}

/**
 * Capability-gated, source-safe WebGPU depth pyramid. It rasterizes actual static source triangles into
 * a private low-resolution depth target, builds a max-depth HZB, and only culls far candidate meshes.
 * The normal Three renderer remains authoritative; failure always falls back to visible objects.
 */
export class WebGPUHzbVisibility{
  constructor({root,camera,player,manifest}){
    this.root=root;this.camera=camera;this.player=player;this.manifest=manifest;
    const c=manifest.graphics?.webgpuVisibility||{};this.enabled=c.enabled!==false;this.width=c.width??256;this.height=c.height??144;
    this.nearRadius=c.nearBypassRadius??42;this.maxOccluderTriangles=c.maxOccluderTriangles??600000;this.confirmFrames=c.confirmFrames??2;
    this.supported=false;this.initialized=false;this.reason='not-initialized';this.items=[];this.hidden=0;this.occluderTriangles=0;this.frames=0;this._readPending=false;this._occ=[];
  }
  async init(){
    if(!this.enabled){this.reason='disabled';return this.report();}
    if(!globalThis.navigator?.gpu){this.reason='navigator.gpu-unavailable';return this.report();}
    try{
      const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter){this.reason='no-adapter';return this.report();}
      this.device=await adapter.requestDevice();
      this._collect();if(!this.items.length||!this._vertices.length){this.reason='no-safe-candidates-or-occluders';return this.report();}
      this._createResources();this.supported=true;this.initialized=true;this.reason='ready';
    }catch(e){this.reason=String(e?.message||e);this.supported=false;this._forceVisible();}
    return this.report();
  }
  _collect(){
    this.root?.updateMatrixWorld?.(true);const vertices=[];let remaining=this.maxOccluderTriangles;
    const box=new THREE.Box3(),size=new THREE.Vector3(),center=new THREE.Vector3();
    this.root?.traverse?.(o=>{
      if(!o.isMesh||o.isSkinnedMesh||o.userData?.dynamic||o.userData?.qualityNoOcclusion||o.name==='__WORLD_COLLIDER__')return;
      if(!o.geometry?.boundingBox)o.geometry?.computeBoundingBox?.();if(!o.geometry?.boundingBox)return;
      box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);box.getSize(size);box.getCenter(center);
      const volume=Math.max(0,size.x*size.y*size.z);const isOccluder=o.userData?.qualityOccluder===true||volume>=24;
      if(isOccluder&&remaining>0){const r=worldPositions(o,this.maxOccluderTriangles,remaining);if(r){vertices.push(...r.data);remaining-=r.triangles;this.occluderTriangles+=r.triangles;}}
      if(!isOccluder||o.userData?.qualityOcclusionCandidate===true){this.items.push({o,center:center.clone(),extent:size.clone().multiplyScalar(0.5),occ:0});}
    });
    this._vertices=new Float32Array(vertices);this._occ=new Uint16Array(this.items.length);
  }
  _shader(code){return this.device.createShaderModule({code});}
  _createResources(){
    const d=this.device,U=globalThis.GPUBufferUsage,T=globalThis.GPUTextureUsage,M=globalThis.GPUMapMode;
    if(!U||!T||!M)throw new Error('WebGPU constants unavailable');
    this._U=U;this._T=T;this._M=M;
    this.vbuf=d.createBuffer({size:Math.max(4,this._vertices.byteLength),usage:U.VERTEX|U.COPY_DST});d.queue.writeBuffer(this.vbuf,0,this._vertices);
    this.cameraBuf=d.createBuffer({size:64,usage:U.UNIFORM|U.COPY_DST});
    this.depth=d.createTexture({size:[this.width,this.height],format:'depth32float',usage:T.RENDER_ATTACHMENT|T.TEXTURE_BINDING});
    this.levels=1+Math.floor(Math.log2(Math.max(this.width,this.height)));
    this.hzb=d.createTexture({size:[this.width,this.height],format:'r32float',mipLevelCount:this.levels,usage:T.TEXTURE_BINDING|T.STORAGE_BINDING});
    this.depthPipe=d.createRenderPipeline({layout:'auto',vertex:{module:this._shader(DEPTH_VS),entryPoint:'main',buffers:[{arrayStride:12,attributes:[{shaderLocation:0,offset:0,format:'float32x3'}]}]},primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'less'}});
    this.depthBG=d.createBindGroup({layout:this.depthPipe.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.cameraBuf}}]});
    this.copyPipe=d.createComputePipeline({layout:'auto',compute:{module:this._shader(DEPTH_COPY_CS),entryPoint:'main'}});
    this.downPipe=d.createComputePipeline({layout:'auto',compute:{module:this._shader(DOWNSAMPLE_CS),entryPoint:'main'}});
    this.copyBG=d.createBindGroup({layout:this.copyPipe.getBindGroupLayout(0),entries:[{binding:0,resource:this.depth.createView()},{binding:1,resource:this.hzb.createView({baseMipLevel:0,mipLevelCount:1})}]});
    this.downBG=[];for(let i=1;i<this.levels;i++)this.downBG.push(d.createBindGroup({layout:this.downPipe.getBindGroupLayout(0),entries:[{binding:0,resource:this.hzb.createView({baseMipLevel:i-1,mipLevelCount:1})},{binding:1,resource:this.hzb.createView({baseMipLevel:i,mipLevelCount:1})}]}));
    const cand=new Float32Array(this.items.length*8);this.items.forEach((x,i)=>{cand.set([x.center.x,x.center.y,x.center.z,0,x.extent.x,x.extent.y,x.extent.z,0],i*8)});
    this.candidateBuf=d.createBuffer({size:Math.max(32,cand.byteLength),usage:U.STORAGE|U.COPY_DST});d.queue.writeBuffer(this.candidateBuf,0,cand);
    this.paramsBuf=d.createBuffer({size:96,usage:U.UNIFORM|U.COPY_DST});
    this.flagBuf=d.createBuffer({size:Math.max(4,this.items.length*4),usage:U.STORAGE|U.COPY_SRC|U.COPY_DST});
    this.readBuf=d.createBuffer({size:Math.max(4,this.items.length*4),usage:U.COPY_DST|U.MAP_READ});
    this.visPipe=d.createComputePipeline({layout:'auto',compute:{module:this._shader(VISIBILITY_CS),entryPoint:'main'}});
    this.visBG=d.createBindGroup({layout:this.visPipe.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.paramsBuf}},{binding:1,resource:{buffer:this.candidateBuf}},{binding:2,resource:this.hzb.createView()},{binding:3,resource:{buffer:this.flagBuf}}]});
  }
  _vpArray(){const vp=new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse);return new Float32Array(vp.elements);}
  _forceVisible(){for(const it of this.items||[])it.o.visible=true;this.hidden=0;}
  update(){
    if(!this.supported||this._readPending)return;const d=this.device;this.camera.updateMatrixWorld(true);this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
    const vp=this._vpArray();d.queue.writeBuffer(this.cameraBuf,0,vp);
    const params=new Float32Array(24);params.set(vp,0);const p=this.player?.position||new THREE.Vector3();params.set([p.x,p.y,p.z,0,this.width,this.height,this.items.length,this.nearRadius],16);d.queue.writeBuffer(this.paramsBuf,0,params);
    const enc=d.createCommandEncoder();const rp=enc.beginRenderPass({colorAttachments:[],depthStencilAttachment:{view:this.depth.createView(),depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'store'}});rp.setPipeline(this.depthPipe);rp.setBindGroup(0,this.depthBG);rp.setVertexBuffer(0,this.vbuf);rp.draw(this._vertices.length/3);rp.end();
    let cp=enc.beginComputePass();cp.setPipeline(this.copyPipe);cp.setBindGroup(0,this.copyBG);cp.dispatchWorkgroups(Math.ceil(this.width/8),Math.ceil(this.height/8));cp.end();
    let w=this.width,h=this.height;for(const bg of this.downBG){w=Math.max(1,Math.ceil(w/2));h=Math.max(1,Math.ceil(h/2));cp=enc.beginComputePass();cp.setPipeline(this.downPipe);cp.setBindGroup(0,bg);cp.dispatchWorkgroups(Math.ceil(w/8),Math.ceil(h/8));cp.end();}
    cp=enc.beginComputePass();cp.setPipeline(this.visPipe);cp.setBindGroup(0,this.visBG);cp.dispatchWorkgroups(Math.ceil(this.items.length/64));cp.end();enc.copyBufferToBuffer(this.flagBuf,0,this.readBuf,0,Math.max(4,this.items.length*4));d.queue.submit([enc.finish()]);this.frames++;
    this._readPending=true;this.readBuf.mapAsync(this._M.READ).then(()=>{const flags=new Uint32Array(this.readBuf.getMappedRange().slice(0));this.readBuf.unmap();let hidden=0;for(let i=0;i<this.items.length;i++){const it=this.items[i],occ=flags[i]===1;this._occ[i]=occ?Math.min(65535,this._occ[i]+1):0;const shouldHide=this._occ[i]>=this.confirmFrames;if(shouldHide){it.o.visible=false;hidden++;}else it.o.visible=true;}this.hidden=hidden;this._readPending=false;}).catch(()=>{try{this.readBuf.unmap();}catch{}this._readPending=false;this._forceVisible();});
  }
  report(){return{enabled:this.enabled,supported:this.supported,initialized:this.initialized,reason:this.reason,mode:'webgpu-private-depth-hzb-v1',depthResolution:[this.width,this.height],mipLevels:this.levels||0,occluderTriangles:this.occluderTriangles,candidates:this.items.length,hidden:this.hidden,frames:this.frames,nearBypassRadius:this.nearRadius,actualSourceTrianglesRasterized:true,sourceGeometryChanged:false,nearFieldNeverCulled:true,failureMode:'all-visible-safe-fallback'};}
  dispose(){this._forceVisible();for(const x of ['vbuf','cameraBuf','depth','hzb','candidateBuf','paramsBuf','flagBuf','readBuf'])try{this[x]?.destroy?.();}catch{}}
}
