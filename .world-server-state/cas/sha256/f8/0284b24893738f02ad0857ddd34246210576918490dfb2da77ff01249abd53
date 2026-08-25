(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.PixelAnimationGPUCulling=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const VERSION='3.0.0';
const WGSL=`
struct CullGlobals { camera: vec4f, limits: vec4f, };
struct Instance { rect: vec4f, atlas: vec4f, meta: vec4f, motionA: vec4f, motionB: vec4f, material: vec4f, };
struct VisibleEntry { index:u32, lodBits:u32, };
@group(0) @binding(0) var<uniform> g:CullGlobals;
@group(0) @binding(1) var<storage,read> instances:array<Instance>;
@group(0) @binding(2) var<storage,read_write> visible:array<VisibleEntry>;
@group(0) @binding(3) var<storage,read_write> counter:atomic<u32>;
fn claimSlot(maxVisible:u32)->u32 {
  loop {
    let old=atomicLoad(&counter); if(old>=maxVisible){return maxVisible;}
    let attempt=atomicCompareExchangeWeak(&counter,old,old+1u);
    if(attempt.exchanged){return old;}
  }
}
@compute @workgroup_size(128)
fn csMain(@builtin(global_invocation_id) gid:vec3u){
  let i=gid.x; let total=u32(g.limits.x); if(i>=total){return;}
  let o=instances[i];
  let half=o.rect.zw*0.5; let minP=o.rect.xy-half; let maxP=o.rect.xy+half;
  let camMin=g.camera.xy; let camMax=g.camera.xy+g.camera.zw;
  if(maxP.x<camMin.x || minP.x>camMax.x || maxP.y<camMin.y || minP.y>camMax.y){return;}
  let cx=g.camera.x+g.camera.z*0.5; let cy=g.camera.y+g.camera.w*0.5;
  let dx=(o.rect.x-cx)/max(g.camera.z,1.0); let dy=(o.rect.y-cy)/max(g.camera.w,1.0);
  let dist=sqrt(dx*dx+dy*dy);
  var lod=0.0; if(dist>g.limits.z){lod=1.0;} else if(dist>g.limits.y){lod=0.55;}
  lod=clamp(lod+o.meta.w,0.0,1.0);
  let maxVisible=u32(g.limits.w); let slot=claimSlot(maxVisible);
  if(slot<maxVisible){ visible[slot].index=i; visible[slot].lodBits=bitcast<u32>(lod); }
}`;
function supported(){return Boolean(root.navigator&&root.navigator.gpu);}
function normalizeConfig(input){const x=input||{};return{enabled:x.enabled!==false,workgroupSize:128,mediumDistance:Number(x.mediumDistance)||0.55,farDistance:Number(x.farDistance)||0.9,maxVisible:Math.max(1,Number(x.maxVisible)||24000)};}
function cpuReference(instances,camera,config){const c=normalizeConfig(config),out=[];for(let i=0;i<instances.length&&out.length<c.maxVisible;i++){const o=instances[i],w=o.w||o.width||0,h=o.h||o.height||0;if(o.x+w/2<camera.x||o.x-w/2>camera.x+camera.w||o.y+h/2<camera.y||o.y-h/2>camera.y+camera.h)continue;const dx=(o.x-(camera.x+camera.w/2))/Math.max(camera.w,1),dy=(o.y-(camera.y+camera.h/2))/Math.max(camera.h,1),dist=Math.hypot(dx,dy);out.push({index:i,lod:Math.max(0,Math.min(1,(dist>c.farDistance?1:dist>c.mediumDistance?0.55:0)+(Number(o.lodBias)||0)))});}return out;}
class WebGPUComputeCuller{
  constructor(device,options){if(!device)throw new TypeError('device required');this.device=device;this.config=normalizeConfig(options);this.capacity=0;this.visibleBuffer=null;this.counterBuffer=null;this.uniformBuffer=null;this.bindGroup=null;this.pipeline=null;this.indirectBuffer=null;}
  async init(instanceBuffer){this.instanceBuffer=instanceBuffer;const module=this.device.createShaderModule({code:WGSL});this.layout=this.device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform'}},{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},{binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}}]});const desc={layout:this.device.createPipelineLayout({bindGroupLayouts:[this.layout]}),compute:{module,entryPoint:'csMain'}};this.pipeline=this.device.createComputePipelineAsync?await this.device.createComputePipelineAsync(desc):this.device.createComputePipeline(desc);this.uniformBuffer=this.device.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.counterBuffer=this.device.createBuffer({size:4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});this.indirectBuffer=this.device.createBuffer({size:20,usage:GPUBufferUsage.INDIRECT|GPUBufferUsage.COPY_DST});this.ensureCapacity(this.config.maxVisible);return this;}
  ensureCapacity(count){if(count<=this.capacity&&this.visibleBuffer)return;this.capacity=Math.max(256,1<<Math.ceil(Math.log2(Math.max(1,count))));if(this.visibleBuffer&&this.visibleBuffer.destroy)this.visibleBuffer.destroy();this.visibleBuffer=this.device.createBuffer({size:this.capacity*8,usage:GPUBufferUsage.STORAGE});this._rebuild();}
  setInstanceBuffer(buffer){this.instanceBuffer=buffer;this._rebuild();}
  _rebuild(){if(!this.layout||!this.instanceBuffer||!this.uniformBuffer||!this.visibleBuffer||!this.counterBuffer)return;this.bindGroup=this.device.createBindGroup({layout:this.layout,entries:[{binding:0,resource:{buffer:this.uniformBuffer}},{binding:1,resource:{buffer:this.instanceBuffer}},{binding:2,resource:{buffer:this.visibleBuffer}},{binding:3,resource:{buffer:this.counterBuffer}}]});}
  encode(encoder,{camera,total,maxVisible,indexCount,mediumDistance,farDistance}){if(!this.pipeline||!this.bindGroup)return null;const max=Math.min(this.capacity,Math.max(1,maxVisible||this.config.maxVisible));const f=new Float32Array([camera.x,camera.y,camera.w,camera.h,total,mediumDistance||this.config.mediumDistance,farDistance||this.config.farDistance,max]);this.device.queue.writeBuffer(this.uniformBuffer,0,f);this.device.queue.writeBuffer(this.counterBuffer,0,new Uint32Array([0]));this.device.queue.writeBuffer(this.indirectBuffer,0,new Uint32Array([indexCount>>>0,0,0,0,0]));if(total<=0)return{visibleBuffer:this.visibleBuffer,indirectBuffer:this.indirectBuffer,maxVisible:max};const pass=encoder.beginComputePass();pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.bindGroup);pass.dispatchWorkgroups(Math.ceil(total/128));pass.end();encoder.copyBufferToBuffer(this.counterBuffer,0,this.indirectBuffer,4,4);return{visibleBuffer:this.visibleBuffer,indirectBuffer:this.indirectBuffer,maxVisible:max};}
  destroy(){for(const b of [this.visibleBuffer,this.counterBuffer,this.uniformBuffer,this.indirectBuffer])if(b&&b.destroy)b.destroy();}
}
return Object.freeze({VERSION,WGSL,supported,normalizeConfig,cpuReference,WebGPUComputeCuller});
});
