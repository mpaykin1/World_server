(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PixelAnimationWebGPU = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const VERSION = '3.0.0';
  const INSTANCE_FLOATS = 24;
  const UNIFORM_FLOATS = 8;

  function core() {
    const c = root.PixelAnimation || (typeof require === 'function' ? require('./pixel-animation-engine.js') : null);
    if (!c) throw new Error('PixelAnimation core must be loaded before PixelAnimationWebGPU');
    return c;
  }
  function nowMs() { return root.performance && typeof root.performance.now === 'function' ? root.performance.now() : Date.now(); }
  function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
  function isMobile(){ return /Android|iPhone|iPad|iPod/i.test((root.navigator && root.navigator.userAgent) || ''); }
  function supported(){ return Boolean(root.navigator && root.navigator.gpu); }
  function getCulling(){ return root.PixelAnimationGPUCulling || (typeof require==='function' ? require('./pixel-animation-gpu-culling.js') : null); }
  function floatBits(v){ const f=new Float32Array(1),u=new Uint32Array(f.buffer); f[0]=v; return u[0]; }

  const WGSL = `
struct Globals {
  viewport: vec2f,
  camera: vec2f,
  time: f32,
  pixelPerfect: f32,
  pixelRatio: f32,
  _pad: f32,
};
struct Instance {
  rect: vec4f,
  atlas: vec4f,
  meta: vec4f,
  motionA: vec4f,
  motionB: vec4f,
  material: vec4f,
};
struct VisibleEntry { index:u32, lodBits:u32, };
@group(0) @binding(4) var<storage, read> visibleEntries: array<VisibleEntry>;
struct VSIn {
  @location(0) local: vec2f,
  @location(1) uv: vec2f,
  @builtin(instance_index) instanceIndex: u32,
};
struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) material: vec4f,
  @location(2) seed: f32,
  @location(3) lod: f32,
  @location(4) atlasLayer: f32,
};
@group(0) @binding(0) var<uniform> g: Globals;
@group(0) @binding(1) var<storage, read> instances: array<Instance>;
@group(0) @binding(2) var atlasTex: texture_2d_array<f32>;
@group(0) @binding(3) var atlasSampler: sampler;

fn sat(x:f32)->f32 { return clamp(x,0.0,1.0); }

@vertex fn vsMain(input:VSIn)->VSOut {
  let vis = visibleEntries[input.instanceIndex];
  let i = instances[vis.index];
  let seed = i.meta.x;
  let kind = i.meta.y;
  let phase = i.meta.z;
  let lod = bitcast<f32>(vis.lodBits);
  let speed = i.motionA.x;
  let bob = i.motionA.y;
  let sway = i.motionA.z;
  let amp1 = i.motionA.w;
  let freq1 = i.motionB.x;
  let amp2 = i.motionB.y;
  let freq2 = i.motionB.z;
  var local = input.local;
  let t = g.time * speed + phase + seed * 6.2831853;
  let detail = 1.0 - lod;

  if (kind == 1.0) {
    let side = select(-1.0, 1.0, local.x >= 0.0);
    let wing = pow(sat(abs(local.x) * 2.0), 1.35);
    local.y += sin(t * freq1 + abs(local.x) * 4.0) * amp1 * wing * detail;
    let tail = sat((local.y + 0.5) * 1.2);
    local.x += sin(t * freq2 - local.y * 5.0) * amp2 * tail * detail * side;
  } else if (kind == 2.0 || kind == 3.0 || kind == 6.0 || kind == 12.0 || kind == 13.0 || kind == 17.0 || kind == 18.0) {
    local.x += sin(t * freq1 + local.y * 6.0 + seed * 4.0) * amp1 * (local.y + 0.5) * detail;
  } else if (kind == 4.0 || kind == 5.0 || kind == 14.0) {
    local.x += sin(t * freq1 + local.y * 3.0 + seed * 5.0) * amp1 * sat(local.y + 0.5) * detail;
  } else if (kind == 7.0 || kind == 11.0) {
    local.y *= 1.0 + sin(t * freq1) * amp1 * detail;
  } else if (kind == 8.0 || kind == 15.0 || kind == 16.0) {
    local.x += sin(t * freq1 + local.y * 17.0) * amp1 * detail;
  } else if (kind == 9.0 || kind == 10.0) {
    local.y += sin(t * freq1 + local.x * 4.0) * amp1 * detail;
  }
  if (kind == 7.0 || kind == 11.0) {
    let v = input.uv.y;
    let head = 1.0 - smoothstep(0.22,0.32,v);
    let torso = smoothstep(0.20,0.32,v) * (1.0 - smoothstep(0.62,0.72,v));
    let legs = smoothstep(0.62,0.72,v);
    local.x += sin(t*0.85+seed*2.0)*amp1*0.22*head*detail;
    local.x += sin(t*0.68+seed)*amp1*0.12*torso*detail;
    local.x += sin(t*1.10+seed*3.0)*amp1*0.06*legs*detail;
  }

  var world = i.rect.xy + local * i.rect.zw;
  world.x += sin(t * 0.73) * sway * i.rect.w * detail;
  world.y += sin(t) * bob * i.rect.w * detail;
  var screen = world - g.camera;
  if (g.pixelPerfect > 0.5) { screen = round(screen * g.pixelRatio) / g.pixelRatio; }
  let ndc = vec2f(screen.x / g.viewport.x * 2.0 - 1.0, 1.0 - screen.y / g.viewport.y * 2.0);
  var out:VSOut;
  out.position = vec4f(ndc, 0.0, 1.0);
  out.uv = i.atlas.xy + input.uv * i.atlas.zw;
  out.material = i.material;
  out.seed = seed;
  out.lod = lod;
  out.atlasLayer = i.motionB.w;
  return out;
}

fn hash21(p:vec2f)->f32 {
  let h = dot(p, vec2f(127.1,311.7));
  return fract(sin(h) * 43758.5453);
}

@fragment fn fsMain(input:VSOut)->@location(0) vec4f {
  var c = textureSample(atlasTex, atlasSampler, input.uv, i32(input.atlasLayer + 0.5));
  if (c.a <= 0.001) { discard; }
  let shimmer = input.material.x * (1.0 - input.lod);
  let glow = input.material.y * (1.0 - input.lod * 0.75);
  let sparkle = input.material.z * (1.0 - input.lod);
  let opacity = input.material.w;
  let wave = 0.5 + 0.5 * sin(g.time * 2.3 + input.seed * 13.0 + input.uv.y * 29.0);
  let sparkleGate = step(0.985 - sparkle * 0.02, hash21(floor(input.uv * 512.0) + floor(g.time * 5.0)));
  c.rgb *= 1.0 + shimmer * wave * 0.22;
  c.rgb += c.rgb * glow * 0.16 + vec3f(sparkleGate * sparkle * 0.45);
  return vec4f(c.rgb, c.a * opacity);
}`;

  function buildGridMesh(segments) {
    const s = Math.max(2, Math.floor(segments || 8));
    const vertices=[]; const indices=[];
    for(let y=0;y<=s;y++) for(let x=0;x<=s;x++){ const u=x/s,v=y/s; vertices.push(u-0.5,v-0.5,u,v); }
    const row=s+1;
    for(let y=0;y<s;y++) for(let x=0;x<s;x++){ const a=y*row+x,b=a+1,c=a+row,d=c+1; indices.push(a,c,b,b,c,d); }
    return { vertices:new Float32Array(vertices), indices:new Uint16Array(indices) };
  }

  class WebGPURenderer {
    static async create(canvas, options){ const r=new WebGPURenderer(canvas, options); await r.init(); return r; }
    constructor(canvas, options){
      this.canvas=canvas; this.options=options||{}; const c=core();
      this.policy=c.normalizePolicy(this.options.policy); this.profiles={...c.DEFAULT_PROFILES,...(this.options.profiles||{})};
      this.objects=new Map(); this.nextId=1; this.grid=new c.SpatialHashGrid(this.options.cellSize||256);
      this.camera={x:0,y:0,w:canvas.clientWidth||canvas.width||1,h:canvas.clientHeight||canvas.height||1};
      this.visible=[]; this.visibilityDirty=true; this.lastVisibilityAt=0; this.startAt=nowMs(); this.running=false; this.raf=0;
      this.capacity=256; this.instanceData=new Float32Array(this.capacity*INSTANCE_FLOATS); this.visibilityData=new Uint32Array(this.capacity*2); this.uniformData=new Float32Array(UNIFORM_FLOATS); this.computeCuller=null;
      this.lastStats={backend:'webgpu',visible:0,total:0,fps:60,tier:'medium',drawCalls:0};
      this._onVisibility=()=>{ if(!this.policy.pauseWhenHidden)return; if(root.document&&root.document.hidden)this.stop(); else this.start(); };
    }
    async init(){
      if(!supported()) throw new Error('WebGPU unavailable');
      const c=core();
      this.adapter=await root.navigator.gpu.requestAdapter({powerPreference:this.options.powerPreference||'high-performance'});
      if(!this.adapter) throw new Error('WebGPU adapter unavailable');
      this.device=await this.adapter.requestDevice();
      this.context=this.canvas.getContext('webgpu'); if(!this.context) throw new Error('WebGPU canvas context unavailable');
      this.format=root.navigator.gpu.getPreferredCanvasFormat();
      const limitsInfo={webgl2:true,mobile:isMobile(),deviceMemory:root.navigator&&root.navigator.deviceMemory,hardwareConcurrency:root.navigator&&root.navigator.hardwareConcurrency,maxTextureSize:Number(this.device.limits.maxTextureDimension2D)||8192};
      this.budget=new c.AdaptiveBudget(this.policy,this.options.tier||c.chooseDeviceTier(limitsInfo,this.policy));
      this.mesh=buildGridMesh(this.options.gridSegments||8);
      this.vertexBuffer=this.device.createBuffer({size:this.mesh.vertices.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}); this.device.queue.writeBuffer(this.vertexBuffer,0,this.mesh.vertices);
      this.indexBuffer=this.device.createBuffer({size:this.mesh.indices.byteLength,usage:GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST}); this.device.queue.writeBuffer(this.indexBuffer,0,this.mesh.indices);
      this.instanceBuffer=this.device.createBuffer({size:this.capacity*INSTANCE_FLOATS*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
      this.visibilityBuffer=this.device.createBuffer({size:this.capacity*8,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
      const Culling=getCulling(); if(this.policy.features&&this.policy.features.gpuComputeCulling&&Culling&&Culling.WebGPUComputeCuller){ try{this.computeCuller=await new Culling.WebGPUComputeCuller(this.device,{maxVisible:this.budget.limits.maxVisible}).init(this.instanceBuffer);}catch(error){this.computeCuller=null;if(typeof this.options.onBackendError==='function')this.options.onBackendError('webgpu-compute-culling',error);} }
      this.uniformBuffer=this.device.createBuffer({size:UNIFORM_FLOATS*4,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
      const module=this.device.createShaderModule({code:WGSL});
      this.bindGroupLayout=this.device.createBindGroupLayout({entries:[
        {binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},
        {binding:1,visibility:GPUShaderStage.VERTEX,buffer:{type:'read-only-storage'}},
        {binding:2,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float',viewDimension:'2d-array'}},
        {binding:3,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'filtering'}},
        {binding:4,visibility:GPUShaderStage.VERTEX,buffer:{type:'read-only-storage'}},
      ]});
      this.pipeline=this.device.createRenderPipeline({
        layout:this.device.createPipelineLayout({bindGroupLayouts:[this.bindGroupLayout]}),
        vertex:{module,entryPoint:'vsMain',buffers:[{arrayStride:16,attributes:[{shaderLocation:0,offset:0,format:'float32x2'},{shaderLocation:1,offset:8,format:'float32x2'}]}]},
        fragment:{module,entryPoint:'fsMain',targets:[{format:this.format,blend:{color:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}]},
        primitive:{topology:'triangle-list',cullMode:'none'},
      });
      this.sampler=this.device.createSampler({magFilter:'nearest',minFilter:'nearest',mipmapFilter:'nearest',addressModeU:'clamp-to-edge',addressModeV:'clamp-to-edge'});
      this.resize();
      if(root.document&&root.document.addEventListener) root.document.addEventListener('visibilitychange',this._onVisibility,{passive:true});
      return this;
    }
    _configure(){ this.context.configure({device:this.device,format:this.format,alphaMode:'premultiplied'}); }
    resize(width,height){
      const limits=this.budget?this.budget.limits:this.policy.tiers.medium; const dpr=clamp(root.devicePixelRatio||1,1,Number(limits.maxDpr)||1.5); const scale=Number(limits.resolutionScale)||1;
      const cssW=Math.max(1,Math.floor(width||this.canvas.clientWidth||this.canvas.width||1)); const cssH=Math.max(1,Math.floor(height||this.canvas.clientHeight||this.canvas.height||1));
      const w=Math.max(1,Math.floor(cssW*dpr*scale)),h=Math.max(1,Math.floor(cssH*dpr*scale)); if(this.canvas.width!==w)this.canvas.width=w;if(this.canvas.height!==h)this.canvas.height=h;
      this.camera.w=cssW;this.camera.h=cssH;this.pixelRatio=w/cssW;this._configure();this.visibilityDirty=true;
    }
    setCamera(camera){if(!camera)return;this.camera.x=Number(camera.x)||0;this.camera.y=Number(camera.y)||0;if(camera.w)this.camera.w=camera.w;if(camera.h)this.camera.h=camera.h;this.visibilityDirty=true;}
    setProfiles(profiles){const c=core();this.profiles={...this.profiles,...(profiles||{})};for(const o of this.objects.values())o.params=c.profileParams(this.profiles[o.profile]||{kind:o.profile});this.visibilityDirty=true;}
    setPolicy(policy){const c=core();this.policy=c.normalizePolicy(policy);this.budget.policy=this.policy;this.resize();}
    async _loadImage(source){let image=source;if(typeof source==='string'){const res=await fetch(source,{mode:'cors',credentials:'omit',cache:'force-cache'});if(!res.ok)throw new Error(`Atlas load failed: ${res.status}`);image=await createImageBitmap(await res.blob(),{premultiplyAlpha:'premultiply'});}return image;}
    async initAtlasArray(spec){const x=spec||{},width=Math.max(1,Number(x.width)||1),height=Math.max(1,Number(x.height)||1),layers=Math.max(1,Number(x.layers)||1);if(this.texture&&this.texture.destroy)this.texture.destroy();this.atlasWidth=width;this.atlasHeight=height;this.atlasLayers=layers;this.texture=this.device.createTexture({size:{width,height,depthOrArrayLayers:layers},format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});this.textureView=this.texture.createView({dimension:'2d-array',arrayLayerCount:layers});this._rebuildBindGroup();return this;}
    async loadAtlasLayer(layer,source){const image=await this._loadImage(source),z=Math.max(0,Number(layer)||0);if(!this.texture||z>=this.atlasLayers||image.width>this.atlasWidth||image.height>this.atlasHeight)throw new Error('Atlas layer incompatible with allocated texture array');this.device.queue.copyExternalImageToTexture({source:image},{texture:this.texture,origin:{x:0,y:0,z}},[image.width||1,image.height||1,1]);return this;}
    async loadAtlas(source){const image=await this._loadImage(source);await this.initAtlasArray({width:image.width||1,height:image.height||1,layers:1});await this.loadAtlasLayer(0,image);return this;}
    async loadAtlases(sources){const list=Array.from(sources||[]);if(!list.length)throw new Error('loadAtlases requires at least one source');const images=[];for(const src of list)images.push(await this._loadImage(src));const width=Math.max(...images.map(i=>i.width||1)),height=Math.max(...images.map(i=>i.height||1));await this.initAtlasArray({width,height,layers:images.length});for(let i=0;i<images.length;i++)await this.loadAtlasLayer(i,images[i]);return this;}
    _rebuildBindGroup(){ if(!this.textureView)return; this.bindGroup=this.device.createBindGroup({layout:this.bindGroupLayout,entries:[{binding:0,resource:{buffer:this.uniformBuffer}},{binding:1,resource:{buffer:this.instanceBuffer}},{binding:2,resource:this.textureView},{binding:3,resource:this.sampler},{binding:4,resource:{buffer:(this.computeCuller&&this.computeCuller.visibleBuffer)||this.visibilityBuffer}}]}); }
    spawn(spec){const c=core();const s=spec||{},id=s.id!=null?s.id:this.nextId++;if(this.objects.has(id))throw new Error(`Duplicate pixel animation id: ${id}`);const profile=s.profile||'generic';const o={id,x:Number(s.x)||0,y:Number(s.y)||0,w:Math.max(1,Number(s.w||s.width)||64),h:Math.max(1,Number(s.h||s.height)||64),uv:s.uv||[0,0,1,1],profile,params:c.profileParams(this.profiles[profile]||{kind:profile}),seed:s.seed==null?c.hashSeed(id):Number(s.seed),phase:Number(s.phase)||0,opacity:s.opacity==null?1:clamp(Number(s.opacity),0,1),priority:Number(s.priority)||0,lodBias:Number(s.lodBias)||0,atlasLayer:Math.max(0,Number(s.atlasLayer)||0)};this.objects.set(id,o);this.grid.upsert(id,{x:o.x-o.w/2,y:o.y-o.h/2,w:o.w,h:o.h});this.visibilityDirty=true;return id;}
    update(id,patch){const c=core();const o=this.objects.get(id);if(!o)return false;const p=patch||{};let moved=false;for(const k of ['x','y','w','h','phase','priority','lodBias'])if(p[k]!=null){o[k]=Number(p[k]);if(['x','y','w','h'].includes(k))moved=true;}if(p.width!=null){o.w=Number(p.width);moved=true;}if(p.height!=null){o.h=Number(p.height);moved=true;}if(p.uv)o.uv=p.uv;if(p.atlasLayer!=null)o.atlasLayer=Math.max(0,Number(p.atlasLayer)||0);if(p.opacity!=null)o.opacity=clamp(Number(p.opacity),0,1);if(p.seed!=null)o.seed=Number(p.seed);if(p.profile){o.profile=p.profile;o.params=c.profileParams(this.profiles[o.profile]||{kind:o.profile});}if(moved)this.grid.upsert(id,{x:o.x-o.w/2,y:o.y-o.h/2,w:o.w,h:o.h});this.visibilityDirty=true;return true;}
    remove(id){if(!this.objects.delete(id))return false;this.grid.remove(id);this.visibilityDirty=true;return true;} clear(){this.objects.clear();this.grid.clear();this.visible.length=0;this.visibilityDirty=true;}
    _refreshVisible(t){const limits=this.budget.limits,hz=Math.max(1,Number(limits.farUpdateHz)||12);if(!this.visibilityDirty&&t-this.lastVisibilityAt<1000/hz)return;this.lastVisibilityAt=t;this.visibilityDirty=false;const margin=Math.max(this.camera.w,this.camera.h)*0.12;const bounds={x:this.camera.x-margin,y:this.camera.y-margin,w:this.camera.w+margin*2,h:this.camera.h+margin*2},cx=this.camera.x+this.camera.w/2,cy=this.camera.y+this.camera.h/2,candidates=[];for(const id of this.grid.query(bounds)){const o=this.objects.get(id);if(!o)continue;const dx=o.x-cx,dy=o.y-cy;candidates.push({o,score:dx*dx+dy*dy-o.priority*1e8});}candidates.sort((a,b)=>a.score-b.score);const max=Math.min(candidates.length,limits.maxVisible||candidates.length);this.visible.length=max;const full=limits.fullAnimation||max,medium=limits.mediumAnimation||max;for(let i=0;i<max;i++){const e=candidates[i];e.lod=clamp((i<full?0:(i<medium?0.55:1))+e.o.lodBias,0,1);this.visible[i]=e;}}
    _ensureCapacity(count){if(count<=this.capacity)return;while(this.capacity<count)this.capacity*=2;this.instanceData=new Float32Array(this.capacity*INSTANCE_FLOATS);this.visibilityData=new Uint32Array(this.capacity*2);if(this.instanceBuffer)this.instanceBuffer.destroy();if(this.visibilityBuffer)this.visibilityBuffer.destroy();this.instanceBuffer=this.device.createBuffer({size:this.capacity*INSTANCE_FLOATS*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});this.visibilityBuffer=this.device.createBuffer({size:this.capacity*8,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});if(this.computeCuller){this.computeCuller.setInstanceBuffer(this.instanceBuffer);this.computeCuller.ensureCapacity(Math.max(this.capacity,this.budget.limits.maxVisible||0));}this._rebuildBindGroup();}
    _pack(entry,index){const o=entry.o,p=o.params,d=this.instanceData,k=index*INSTANCE_FLOATS,uv=o.uv;d[k]=o.x;d[k+1]=o.y;d[k+2]=o.w;d[k+3]=o.h;d[k+4]=uv[0];d[k+5]=uv[1];d[k+6]=uv[2];d[k+7]=uv[3];d[k+8]=o.seed;d[k+9]=p.kindId;d[k+10]=o.phase;d[k+11]=entry.lod;d[k+12]=p.speed;d[k+13]=p.bob;d[k+14]=p.sway;d[k+15]=p.amp1;d[k+16]=p.freq1;d[k+17]=p.amp2;d[k+18]=p.freq2;d[k+19]=o.atlasLayer||0;d[k+20]=p.shimmer;d[k+21]=p.glow;d[k+22]=p.sparkle;d[k+23]=o.opacity;}
    render(tInput){if(!this.bindGroup)return;const t=Number.isFinite(tInput)?tInput:nowMs();if(this.budget.frame(t)){this.resize();this.visibilityDirty=true;}const cc=this.policy.computeCulling||{};const allowedTiers=Array.isArray(cc.tiers)?cc.tiers:['high','ultra'];const gpuCull=Boolean(this.computeCuller&&this.policy.features&&this.policy.features.gpuComputeCulling&&total>=(Number(cc.minObjects)||1500)&&allowedTiers.includes(this.budget.tier));let count=0,total=this.objects.size;const encoder=this.device.createCommandEncoder();
      if(gpuCull){this._ensureCapacity(total);let i=0;for(const o of this.objects.values())this._pack({o,lod:o.lodBias||0},i++);if(total)this.device.queue.writeBuffer(this.instanceBuffer,0,this.instanceData.buffer,0,total*INSTANCE_FLOATS*4);const maxVisible=this.budget.limits.maxVisible||total;this.computeCuller.ensureCapacity(maxVisible);this._rebuildBindGroup();this.computeCuller.encode(encoder,{camera:this.camera,total,maxVisible,indexCount:this.mesh.indices.length,mediumDistance:0.55,farDistance:0.90});count=Math.min(total,maxVisible);
      }else{this._refreshVisible(t);count=this.visible.length;this._ensureCapacity(count);for(let i=0;i<count;i++){this._pack(this.visible[i],i);this.visibilityData[i*2]=i;this.visibilityData[i*2+1]=floatBits(this.visible[i].lod);}if(count){this.device.queue.writeBuffer(this.instanceBuffer,0,this.instanceData.buffer,0,count*INSTANCE_FLOATS*4);this.device.queue.writeBuffer(this.visibilityBuffer,0,this.visibilityData.buffer,0,count*8);}}
      this.uniformData[0]=this.camera.w;this.uniformData[1]=this.camera.h;this.uniformData[2]=this.camera.x;this.uniformData[3]=this.camera.y;this.uniformData[4]=(t-this.startAt)/1000;this.uniformData[5]=this.policy.pixelPerfect?1:0;this.uniformData[6]=this.pixelRatio||1;this.uniformData[7]=0;this.device.queue.writeBuffer(this.uniformBuffer,0,this.uniformData);const view=this.context.getCurrentTexture().createView();const pass=encoder.beginRenderPass({colorAttachments:[{view,clearValue:{r:0,g:0,b:0,a:0},loadOp:'clear',storeOp:'store'}]});pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.bindGroup);pass.setVertexBuffer(0,this.vertexBuffer);pass.setIndexBuffer(this.indexBuffer,'uint16');if(count){if(gpuCull)pass.drawIndexedIndirect(this.computeCuller.indirectBuffer,0);else pass.drawIndexed(this.mesh.indices.length,count,0,0,0);}pass.end();this.device.queue.submit([encoder.finish()]);this.lastStats={backend:'webgpu',visible:count,total,fps:this.budget.fps,tier:this.budget.tier,drawCalls:count?1:0,resolutionScale:this.budget.limits.resolutionScale,culling:gpuCull?'gpu-compute':'cpu-spatial',multiAtlasLayers:this.atlasLayers||1};}
    start(){if(this.running)return;this.running=true;const raf=root.requestAnimationFrame||((fn)=>setTimeout(()=>fn(nowMs()),16));const loop=(t)=>{if(!this.running)return;this.render(t);this.raf=raf(loop);};this.raf=raf(loop);}stop(){this.running=false;const cancel=root.cancelAnimationFrame||clearTimeout;if(this.raf)cancel(this.raf);this.raf=0;}stats(){return{...this.lastStats};}
    destroy(){this.stop();if(root.document&&root.document.removeEventListener)root.document.removeEventListener('visibilitychange',this._onVisibility);this.clear();if(this.computeCuller)this.computeCuller.destroy();for(const b of [this.vertexBuffer,this.indexBuffer,this.instanceBuffer,this.visibilityBuffer,this.uniformBuffer])if(b&&b.destroy)b.destroy();if(this.texture&&this.texture.destroy)this.texture.destroy();}
  }
  return Object.freeze({VERSION,supported,WebGPURenderer,create:(canvas,options)=>WebGPURenderer.create(canvas,options),WGSL});
});
