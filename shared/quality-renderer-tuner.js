'use strict';
(function(){
  if(window.__WORLD_SERVER_RENDERER_TUNER__)return;
  const KEY='world-server-render-profile-v2';
  const safeJson=s=>{try{return JSON.parse(s)}catch(_){return null}};
  let previous=null;try{previous=safeJson(localStorage.getItem(KEY)||'')}catch(_){}
  function canWebgl2(){try{const c=document.createElement('canvas'),g=c.getContext('webgl2',{antialias:true});if(g){g.getExtension('WEBGL_lose_context')?.loseContext();return true}}catch(_){}return false}
  const webgpu=Boolean(navigator.gpu),webgl2=canWebgl2();
  const fps=Number(previous?.sustainedFps),thermal=Number(previous?.thermalPressureProxy),longTask=Number(previous?.longTaskRatio);
  const has=Number.isFinite(fps)||Number.isFinite(thermal)||Number.isFinite(longTask);
  let tier='unknown',reason='no_previous_profile';
  if(has){
    if((Number.isFinite(fps)&&fps<24)||(Number.isFinite(thermal)&&thermal>.45)||(Number.isFinite(longTask)&&longTask>.25)){tier='stressed';reason='measured_runtime_pressure'}
    else if((!Number.isFinite(fps)||fps>=50)&&(!Number.isFinite(thermal)||thermal<=.18)&&(!Number.isFinite(longTask)||longTask<=.10)){tier='stable';reason='measured_stable_runtime'}
    else {tier='balanced';reason='mixed_runtime_signals'}
  }
  const backend=webgpu?'webgpu':(webgl2?'webgl2':'webgl1');
  const hints={
    schemaVersion:1,tier,reason,backendPreference:backend,webgpuAvailable:webgpu,webgl2Available:webgl2,
    targetFrameMs:tier==='stressed'?33.33:(tier==='balanced'?22.22:16.67),
    framePacing:true,preferRequestAnimationFrame:true,pauseBackgroundAnimation:true,
    dprChange:'advisory-only',geometryReduction:false,materialRemoval:false,shadowRemoval:false,effectRemoval:false,
    visualFeatureRemoval:false,advisoryOnly:true,createdAt:Date.now()
  };
  window.__WORLD_SERVER_RENDERER_TUNER__=hints;
  window.__WORLD_RENDERER_TUNING__=hints;
  try{document.documentElement.dataset.worldRendererTier=tier;document.documentElement.dataset.worldRendererBackend=backend}catch(_){}
  try{dispatchEvent(new CustomEvent('world-server-renderer-tuning',{detail:hints}))}catch(_){}
  try{
    const adapter=window.WorldServerRendererAdapter;
    if(adapter&&typeof adapter.applySafeTuning==='function')adapter.applySafeTuning({...hints,advisoryOnly:false});
  }catch(e){console.warn('[QUALITY_RENDERER_TUNER] adapter rejected safe hints',e)}
})();