'use strict';
function createGpuTimer(gl){
  if(!gl||typeof gl.getExtension!=='function')return {available:false,reason:'webgl-missing'};
  const ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');if(!ext||typeof gl.createQuery!=='function')return {available:false,reason:'timer-query-extension-missing'};
  return {available:true,begin(){const q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);return q;},end(){gl.endQuery(ext.TIME_ELAPSED_EXT);},poll(q){const ready=gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE);const disjoint=gl.getParameter(ext.GPU_DISJOINT_EXT);if(!ready||disjoint)return {ready:false,disjoint:Boolean(disjoint)};const ns=gl.getQueryParameter(q,gl.QUERY_RESULT);return {ready:true,disjoint:false,gpuMs:Number(ns)/1e6};}};
}
module.exports={createGpuTimer};
