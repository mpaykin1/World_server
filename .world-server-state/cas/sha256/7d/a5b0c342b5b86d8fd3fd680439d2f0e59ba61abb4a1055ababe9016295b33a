'use strict';
const DEFAULT_CPU_EQUIVALENTS={
  'image-preprocess':'cpu-native',
  'video-frame-extract':'ffmpeg-cpu',
  'mesh-optimize':'blender-cpu',
  'visual-regression':'cpu-native',
  'quality-analysis':'cpu-native',
  'photogrammetry':'cpu-photogrammetry',
  'godot-headless':'godot-cpu',
  '3dgs-train':null
};
function planCpuFirst(task={},caps={},config={}){
  const kind=task.kind||'quality-analysis';
  const cpuPath=task.cpuPath||DEFAULT_CPU_EQUIVALENTS[kind]||null;
  const gpuAvailable=Boolean(caps.serverGpuVerified);
  const cpuAvailable=caps.cpuVerified!==false;
  if(cpuAvailable&&cpuPath){return {ok:true,status:'PASS',mode:'CPU',kind,cpuPath,gpuUsed:false,gpuRequired:false};}
  if(gpuAvailable&&task.allowGpuFallback===true){return {ok:true,status:'PASS',mode:'GPU_OPTIONAL_FALLBACK',kind,cpuPath:null,gpuUsed:true,gpuRequired:false};}
  if(kind==='3dgs-train'&&!cpuPath){return {ok:false,status:'HOLD',mode:'CPU_ALTERNATIVE_REQUIRED',kind,reason:'3dgs-training-has-no-verified-practical-cpu-equivalent',alternative:'photogrammetry-mesh-or-point-cloud',equivalentClaimAllowed:false};}
  return {ok:false,status:'HOLD',mode:'UNAVAILABLE',kind,reason:cpuAvailable?'cpu-path-not-implemented':'cpu-runtime-not-verified'};
}
function gpuIsPromotionBlocker(config={}){return Boolean(config.serverAcceleration?.gpuRequired===true);}
module.exports={planCpuFirst,gpuIsPromotionBlocker,DEFAULT_CPU_EQUIVALENTS};
