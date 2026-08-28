(() => {
'use strict';
const G=globalThis;if(G.WorldProceduralWebGPUDDGI?.version==='7.0.0')return;
const WGSL=`
struct Params{size:vec3<u32>,bounce:f32}
@group(0) @binding(0) var src:texture_3d<f32>;
@group(0) @binding(1) var dst:texture_storage_3d<rgba16float,write>;
@group(0) @binding(2) var vis:texture_storage_3d<rg16float,write>;
@group(0) @binding(3) var<uniform> p:Params;
fn loadSafe(q:vec3<i32>)->vec4<f32>{
 let s=vec3<i32>(p.size);let c=clamp(q,vec3<i32>(0),s-vec3<i32>(1));return textureLoad(src,c,0);
}
@compute @workgroup_size(4,4,4)
fn propagate(@builtin(global_invocation_id) gid:vec3<u32>){
 if(any(gid>=p.size)){return;}
 let q=vec3<i32>(gid);var a=vec4<f32>(0.0);var n=0.0;
 let dirs=array<vec3<i32>,6>(vec3<i32>(1,0,0),vec3<i32>(-1,0,0),vec3<i32>(0,1,0),vec3<i32>(0,-1,0),vec3<i32>(0,0,1),vec3<i32>(0,0,-1));
 for(var i=0;i<6;i++){a+=loadSafe(q+dirs[i]);n+=1.0;}
 let self=textureLoad(src,q,0);let bounced=mix(self,a/max(1.0,n),clamp(p.bounce,0.0,0.96));
 textureStore(dst,q,vec4<f32>(bounced.rgb,1.0));
 let lum=dot(bounced.rgb,vec3<f32>(0.2126,0.7152,0.0722));
 textureStore(vis,q,vec4<f32>(lum,lum*lum,0.0,0.0).rg);
}`;
function snap(v,cell){return Math.floor(v/cell)*cell}
async function create(device,{resolution=[16,8,16],levels=3,baseCell=1,bounce=.72}={}){
 if(!device?.createTexture||!device?.createComputePipeline)return{supported:false,reason:'WebGPU device unavailable'};
 const clips=[];for(let l=0;l<levels;l++){
  const scale=baseCell*(1<<l),size={width:resolution[0],height:resolution[1],depthOrArrayLayers:resolution[2]};
  const usage=GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.COPY_SRC;
  const A=device.createTexture({size,dimension:'3d',format:'rgba16float',usage});
  const B=device.createTexture({size,dimension:'3d',format:'rgba16float',usage});
  const V=device.createTexture({size,dimension:'3d',format:'rg16float',usage});
  clips.push({level:l,scale,origin:[0,0,0],a:A,b:B,visibility:V,flip:false});
 }
 const module=device.createShaderModule({code:WGSL}),pipeline=device.createComputePipeline({layout:'auto',compute:{module,entryPoint:'propagate'}});
 const params=device.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
 function scroll(camera=[0,0,0]){for(const c of clips)c.origin=[snap(camera[0],c.scale),snap(camera[1],c.scale),snap(camera[2],c.scale)];return clips.map(c=>({level:c.level,origin:c.origin.slice(),cell:c.scale}))}
 function encode(encoder,iterations=2){
  for(let it=0;it<iterations;it++)for(const c of clips){
   const src=c.flip?c.b:c.a,dst=c.flip?c.a:c.b;
   const data=new Float32Array([resolution[0],resolution[1],resolution[2],bounce,0,0,0,0]);device.queue.writeBuffer(params,0,data);
   const bg=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[
    {binding:0,resource:src.createView()},{binding:1,resource:dst.createView()},{binding:2,resource:c.visibility.createView()},{binding:3,resource:{buffer:params}}
   ]});
   const pass=encoder.beginComputePass({label:`pq-ddgi-l${c.level}`});pass.setPipeline(pipeline);pass.setBindGroup(0,bg);
   pass.dispatchWorkgroups(Math.ceil(resolution[0]/4),Math.ceil(resolution[1]/4),Math.ceil(resolution[2]/4));pass.end();c.flip=!c.flip;
  }
 }
 function current(level=0){const c=clips[level];return c?(c.flip?c.b:c.a):null}
 return{supported:true,version:'7.0.0',clips,resolution,scroll,encode,current,visibility:l=>clips[l]?.visibility||null,wgsl:WGSL};
}
G.WorldProceduralWebGPUDDGI={version:'7.0.0',create,wgsl:WGSL};
})();