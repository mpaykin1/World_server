(() => {
'use strict';const G=globalThis;if(G.WorldProceduralNativeBridge)return;
const contracts=new WeakMap();
function attach(canvas,renderer){
  if(!G.WorldProceduralRendererContract)throw new Error('renderer contract unavailable');
  if(!renderer||typeof renderer!=='object')throw new TypeError('renderer required');
  const provider={
    backend:renderer.backend||'custom',
    async captureFrame(ctx){
      if(typeof renderer.getProceduralQualityFrame==='function')return renderer.getProceduralQualityFrame(ctx);
      if(typeof renderer.getGBuffer==='function'){
        const g=await renderer.getGBuffer(ctx);return{
          width:g.width||canvas.width,height:g.height||canvas.height,frameIndex:g.frameIndex,
          color:g.color,depth:g.depth,normal:g.normal,motion:g.motion,semantic:g.semantic,
          reactive:g.reactive,transparency:g.transparency,backend:provider.backend
        };
      }
      throw new Error('renderer must implement getProceduralQualityFrame() or getGBuffer()');
    }
  };
  const off=G.WorldProceduralRendererContract.register(canvas,provider);contracts.set(canvas,{renderer,off});
  return()=>{off();contracts.delete(canvas)};
}
function auto(canvas){
  const candidates=[canvas.__renderer,canvas.renderer,G.worldRenderer,G.renderer].filter(Boolean);
  for(const r of candidates)if(typeof r?.getProceduralQualityFrame==='function'||typeof r?.getGBuffer==='function')return attach(canvas,r);
  return null;
}
function status(canvas){return{attached:contracts.has(canvas),contract:G.WorldProceduralRendererContract?.status(canvas)||null}}
G.WorldProceduralNativeBridge={version:'6.0.0',attach,auto,status};
})();
