(() => {
'use strict';
const G=globalThis;if(G.WorldProceduralGenericRenderer?.version==='9.0.0')return;
const records=new WeakMap(),nativeProviders=new WeakMap();
function typeOfContext(ctx){
 if(!ctx)return'unknown';const n=ctx.constructor?.name||'';
 if(n.includes('CanvasRenderingContext2D'))return'canvas2d';
 if(n.includes('WebGL2'))return'webgl2';
 if(n.includes('WebGL'))return'webgl';
 if(n.includes('GPUCanvas'))return'webgpu';
 return n||'unknown';
}
function instrument(ctx,r){
 if(ctx.__pqInstrumented)return;Object.defineProperty(ctx,'__pqInstrumented',{value:true});
 for(const k of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){
  if(typeof ctx[k]!=='function')continue;
  const old=ctx[k].bind(ctx);ctx[k]=function(...a){r.drawCalls++;r.lastFrame=performance.now();return old(...a)}
 }
}
function register(canvas,ctx){
 if(!canvas||!ctx)return null;let r=records.get(canvas);
 if(!r){r={canvas,contexts:new Set(),types:new Set(),drawCalls:0,lastFrame:0,explicitNative:false,provider:null};records.set(canvas,r)}
 r.contexts.add(ctx);r.types.add(typeOfContext(ctx));instrument(ctx,r);canvas.__worldProceduralGenericRenderer=r;return r;
}
function registerNativeProvider(canvas,provider){
 if(!canvas||!provider||typeof provider.captureFrame!=='function')throw new TypeError('canvas/provider.captureFrame required');
 nativeProviders.set(canvas,provider);const r=records.get(canvas)||{canvas,contexts:new Set(),types:new Set(),drawCalls:0,lastFrame:0};
 r.explicitNative=true;r.provider=provider;records.set(canvas,r);
 try{if(G.WorldProceduralRendererContract)r.detachContract=G.WorldProceduralRendererContract.register(canvas,{backend:provider.backend||'custom-native-v9',captureFrame:provider.captureFrame})}catch(_){}
 return()=>{r.detachContract?.();nativeProviders.delete(canvas);r.explicitNative=false;r.provider=null};
}
function status(canvas){const r=records.get(canvas);if(!r)return{registered:false};return{registered:true,types:[...r.types],drawCalls:r.drawCalls,explicitNative:r.explicitNative,backend:r.provider?.backend||[...r.types].join('+')||'unknown'}}
function scan(){return[...document.querySelectorAll('canvas')].map(c=>({canvas:c,...status(c)}))}
function install(){
 const P=G.HTMLCanvasElement?.prototype;if(!P||P.__pqGetContextPatched)return false;
 const old=P.getContext;P.getContext=function(type,...args){const ctx=old.call(this,type,...args);try{register(this,ctx)}catch(_){}return ctx};
 Object.defineProperty(P,'__pqGetContextPatched',{value:true});return true;
}
G.WorldProceduralGenericRenderer={version:'9.0.0',install,register,registerNativeProvider,status,scan,policy:{neverFabricatePrivateBuffers:true,explicitProviderRequiredForNative:true}};
install();
})();