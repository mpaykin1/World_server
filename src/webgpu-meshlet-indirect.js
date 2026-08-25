const BUILD_CS=`
struct Meshlet { firstTriangle:u32, triangleCount:u32, visible:u32, _pad:u32 };
struct Cmd { indexCount:u32, instanceCount:u32, firstIndex:u32, baseVertex:i32, firstInstance:u32 };
@group(0) @binding(0) var<storage,read> meshlets:array<Meshlet>;
@group(0) @binding(1) var<storage,read_write> commands:array<Cmd>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i>=arrayLength(&meshlets)){return;}let m=meshlets[i];
 commands[i].indexCount=select(0u,m.triangleCount*3u,m.visible!=0u);
 commands[i].instanceCount=1u;commands[i].firstIndex=m.firstTriangle*3u;commands[i].baseVertex=0;commands[i].firstInstance=0u;
}`;

/**
 * WebGPU indirect-command kernel for the lossless meshlet metadata produced by build_meshlets.py.
 * It never rewrites source indices/vertices. A WebGPU renderer may call drawIndexedIndirect on each
 * command; invisible meshlets get indexCount=0. The existing WebGL path remains unchanged and safe.
 */
export class WebGPUMeshletIndirectKernel{
  constructor(device,meshlets=[]){this.device=device;this.meshlets=meshlets;this.supported=!!device;this.mode='webgpu-lossless-meshlet-indirect-v1';this.commandStride=20;this.ready=false;}
  init(){
    if(!this.device||!globalThis.GPUBufferUsage)return this.report();const U=GPUBufferUsage,d=this.device,n=this.meshlets.length;
    const raw=new Uint32Array(Math.max(1,n)*4);for(let i=0;i<n;i++){const m=this.meshlets[i];raw[i*4]=m.firstTriangle>>>0;raw[i*4+1]=m.triangleCount>>>0;raw[i*4+2]=1;}
    this.meta=d.createBuffer({size:raw.byteLength,usage:U.STORAGE|U.COPY_DST});d.queue.writeBuffer(this.meta,0,raw);
    this.commands=d.createBuffer({size:Math.max(this.commandStride,n*this.commandStride),usage:U.STORAGE|U.INDIRECT|U.COPY_SRC});
    this.pipeline=d.createComputePipeline({layout:'auto',compute:{module:d.createShaderModule({code:BUILD_CS}),entryPoint:'main'}});
    this.bg=d.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.meta}},{binding:1,resource:{buffer:this.commands}}]});this.ready=true;return this.report();
  }
  updateVisibility(flags){
    if(!this.ready)return false;const n=this.meshlets.length,raw=new Uint32Array(Math.max(1,n)*4);for(let i=0;i<n;i++){const m=this.meshlets[i];raw[i*4]=m.firstTriangle>>>0;raw[i*4+1]=m.triangleCount>>>0;raw[i*4+2]=flags?.[i]===false?0:1;}this.device.queue.writeBuffer(this.meta,0,raw);
    const enc=this.device.createCommandEncoder(),pass=enc.beginComputePass();pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.bg);pass.dispatchWorkgroups(Math.ceil(n/64));pass.end();this.device.queue.submit([enc.finish()]);return true;
  }
  draw(pass,indexBuffer,indexFormat='uint32'){
    if(!this.ready)return 0;pass.setIndexBuffer(indexBuffer,indexFormat);for(let i=0;i<this.meshlets.length;i++)pass.drawIndexedIndirect(this.commands,i*this.commandStride);return this.meshlets.length;
  }
  report(){return{supported:this.supported,ready:this.ready,mode:this.mode,meshlets:this.meshlets.length,sourceIndexBufferRewritten:false,sourceGeometryChanged:false,nearFieldQualityReduced:false,rendererIntegration:'capability-gated-webgpu-only'};}
  dispose(){this.meta?.destroy?.();this.commands?.destroy?.();}
}
