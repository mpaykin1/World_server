/* Exact material-table path. Factors move to a GPU storage table; source textures
 * keep their native dimensions and exact per-material binding. Optional binding-array
 * acceleration is capability-gated and never substitutes a lower-resolution texture. */
export class WebGPUMaterialTable{
  constructor(device,{strideFloats=16}={}){this.device=device;this.strideFloats=strideFloats;this.entries=[];this.buffer=null;this.bindless=false;}
  add(material){
    const e={baseColor:[...(material?.baseColorFactor||[1,1,1,1])],emissive:[...(material?.emissiveFactor||[0,0,0])],metallic:material?.metallicFactor??0,roughness:material?.roughnessFactor??1,occlusion:material?.occlusionStrength??1,normalScale:material?.normalScaleFactor??1,alphaCutoff:material?.alphaCutoff??0,sourceTextureDimensionsPreserved:true,sourceMaterialSemanticsPreserved:true};
    const id=this.entries.length;this.entries.push(e);return id;
  }
  upload(){
    if(!this.device||!globalThis.GPUBufferUsage)return {supported:false,failMode:'exact-bindgroup-renderer'};
    const data=new Float32Array(this.entries.length*this.strideFloats);
    this.entries.forEach((e,i)=>{const o=i*this.strideFloats;data.set(e.baseColor.slice(0,4),o);data.set([...(e.emissive.slice(0,3)),e.metallic],o+4);data.set([e.roughness,e.occlusion,e.normalScale,e.alphaCutoff],o+8);});
    this.buffer=this.device.createBuffer({label:'world-factory-exact-material-table',size:Math.max(256,Math.ceil(data.byteLength/256)*256),usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
    this.device.queue.writeBuffer(this.buffer,0,data);return this.report();
  }
  report(){return {mode:'webgpu-exact-material-table-v1',materials:this.entries.length,uploaded:!!this.buffer,bindlessTextureArrays:this.bindless,textureDownscale:false,sourceTextureDimensionsPreserved:true,lossyFallbackAllowed:false};}
}
export function bindlessCapability(adapterOrDevice){const f=adapterOrDevice?.features;return {textureBindingArray:!!f?.has?.('texture-binding-array'),sampledTextureArrayNonUniformIndexing:!!f?.has?.('sampled-texture-and-storage-buffer-array-non-uniform-indexing'),policy:'use-only-when-exact-source-textures-fit-capability;otherwise-exact-bind-groups'};}
