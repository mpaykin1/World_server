(function (root, factory) {
  'use strict';
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.PixelAnimationRuntime=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const VERSION='3.0.0';
  function getCore(){return root.PixelAnimation||(typeof require==='function'?require('./pixel-animation-engine.js'):null);}
  function getWebGPU(){return root.PixelAnimationWebGPU||(typeof require==='function'?require('./pixel-animation-webgpu.js'):null);}
  function getCache(){return root.PixelAnimationPipelineCache||(typeof require==='function'?require('./pixel-animation-pipeline-cache.js'):null);}
  async function create(canvas,options){
    const opts=options||{},core=getCore();if(!core)throw new Error('PixelAnimation core unavailable');
    const cache=getCache();const baseOrder=(opts.policy&&opts.policy.backendOrder)||['webgpu','webgl2','canvas2d'];const order=cache&&opts.pipelineCache!==false?cache.preferredOrder(baseOrder):baseOrder;let lastError=null;
    for(const backend of order){
      try{
        if(backend==='webgpu'&&!opts.disableWebGPU){const w=getWebGPU();if(w&&w.supported()){const r=await w.create(canvas,opts);if(cache)cache.remember('webgpu',w.WGSL||'webgpu','ok');return r;}}
        if(backend==='webgl2'&&!opts.disableWebGL2){const r=new core.WebGL2Renderer(canvas,opts);if(cache)cache.remember('webgl2','pixel-animation-webgl2-v3','ok');return r;}
        if(backend==='canvas2d'&&!opts.disableCanvas2D){return new core.Canvas2DRenderer(canvas,opts);}
      }catch(error){lastError=error;if(cache)cache.remember(backend,backend,'failed');if(typeof opts.onBackendError==='function')opts.onBackendError(backend,error);}
    }
    throw lastError||new Error('No pixel animation backend available');
  }
  async function createFromRemote(canvas,configUrl,options){
    const core=getCore();const remote=await core.fetchConfig(configUrl,options);return create(canvas,{...(options||{}),policy:remote.policy,profiles:remote.profiles,remoteConfig:remote});
  }
  async function createManaged(canvas,configUrl,options){const opts=options||{};const engine=configUrl?await createFromRemote(canvas,configUrl,opts):await create(canvas,opts);const Multi=root.PixelAnimationMultiAtlas||(typeof require==='function'?require('./pixel-animation-multi-atlas.js'):null);if(opts.atlasManifest&&Multi){engine.atlasStreamer=new Multi.MultiAtlasStreamer(engine,opts.atlasManifest,opts.atlasStreaming);await engine.atlasStreamer.init();}return engine;}
  return Object.freeze({VERSION,create,createFromRemote,createManaged});
});
