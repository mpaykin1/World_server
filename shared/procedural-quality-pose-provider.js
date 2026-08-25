(() => {
'use strict';const G=globalThis;if(G.WorldProceduralPoseProvider?.version==='5.1.0')return;const providers=new WeakMap();
function register(canvas,provider){providers.set(canvas,provider);return()=>providers.delete(canvas)}
async function get(canvas,frame){const p=providers.get(canvas)||canvas.__worldPoseProvider||G.__WORLD_POSE_PROVIDER__;if(p){try{return await(typeof p==='function'?p(canvas,frame):p)}catch(_){}}if(G.WorldProceduralVision){const out=await G.WorldProceduralVision.detect(canvas,frame?.time||performance.now());if(out)return out}return null}
function capability(){return{externalModelHook:true,trainedMediaPipeHook:!!G.WorldProceduralVision,vendorReady:!!G.__PQMediaPipe,segmentationViaPose:true}}
G.WorldProceduralPoseProvider={version:'5.1.0',register,get,capability};})();