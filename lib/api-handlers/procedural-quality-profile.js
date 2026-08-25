'use strict';
function num(v,f){const n=Number(v);return Number.isFinite(n)?n:f}
function chooseTier(q){const reduced=q.reducedMotion==='1',gpu=q.webgpu==='1',gl=q.webgl2==='1',mem=num(q.memory,4),cores=num(q.cores,4),dpr=num(q.dpr,1);if(reduced)return'safe';if(gpu&&mem>=8&&cores>=8&&dpr<=3)return'cinematic';if(gpu&&mem>=4&&cores>=4)return'high';if(gl&&mem>=4)return'balanced';return'safe'}
function buildProfile(q={}){
  const tier=chooseTier(q),P={
    safe:{bloom:.03,detail:.1,ao:.08,grain:0,vignette:.08,exposure:1,temporal:0,volumetric:0,bounce:.02,sharpen:.03,gi:0,upscale:.08,maxDpr:1,renderScale:.72,animation:.2,tsr:.08,radiance:.04,radianceScale:.32,culling:.92,pbr:.18,ddgi:.02,poseRate:8},
    balanced:{bloom:.16,detail:.36,ao:.29,grain:.3,vignette:.13,exposure:1.01,temporal:.28,volumetric:.14,bounce:.15,sharpen:.07,gi:.24,upscale:.48,maxDpr:1.5,renderScale:.86,animation:.68,tsr:.5,radiance:.27,radianceScale:.5,culling:.74,pbr:.55,ddgi:.24,poseRate:12},
    high:{bloom:.27,detail:.58,ao:.42,grain:.48,vignette:.17,exposure:1.04,temporal:.45,volumetric:.28,bounce:.25,sharpen:.1,gi:.43,upscale:.82,maxDpr:2,renderScale:.96,animation:.92,tsr:.84,radiance:.53,radianceScale:.66,culling:.62,pbr:.84,ddgi:.5,poseRate:18},
    cinematic:{bloom:.38,detail:.77,ao:.54,grain:.62,vignette:.2,exposure:1.06,temporal:.6,volumetric:.43,bounce:.35,sharpen:.13,gi:.63,upscale:1,maxDpr:2.5,renderScale:1,animation:1,tsr:1,radiance:.76,radianceScale:.82,culling:.54,pbr:1,ddgi:.78,poseRate:24}
  };
  return{version:10,tier,targetFps:tier==='safe'?30:60,settings:P[tier],policy:{
    temporalArtifactDetector:true,framePacingGovernor:true,resourceLeakWatchdog:true,thermalMobileGovernor:true,shaderPrewarm:true,deterministicReplay:true,canaryPromotion:true,genericRendererBridge:true,exactCustomDeformationVelocity:true,adaptivePassBudget:true,doctorRepairLoop:true,certificationDashboard:true,trueSkinnedVelocity:true,voxelSceneRadiance:true,physicalDeviceCertification:true,threeNativeGBuffer:true,webgpuDDGIClipmaps:true,goldenBaselines:true,verifiedPromotion:true,rendererContract:true,nativeSourceJitter:true,nativeReactiveMasks:true,nativeGBufferPreferred:true,inferredGBufferFallback:true,
    reactiveTSR:true,ddgiProbeVolume:true,multiBounceGI:true,environmentIBL:true,computePBR:true,trainedPosePipeline:true,
    humanoidContacts:true,wasmSimdThreadsWhenIsolated:true,gpuTimestampScheduler:true,frameGraph:true,persistentQualityLearning:true,
    styleCalibration:true,perceptualGate:true,deviceTournament:true,nonDestructiveOverlay:true,adaptiveQuality:true,allowRegression:false,
    webgpuTemporalEnhancer:true,webgpuGBuffer:true,nativeGBuffer:true,tsr:true,radianceGI:true,computePBR:true,
    depthAwareTemporal:true,motionReprojection:true,screenSpaceGI:true,easuRcas:true,multiResolutionBloom:true,
    temporalVolumetrics:true,iblEstimation:true,sdf3dBVH:true,locomotionFootLock:true,handObjectIK:true,
    workerWasm:true,gpuOcclusionCulling:true,canvasFallback:true
  }}
}
module.exports=(req,res)=>{res.setHeader('Cache-Control','no-store,max-age=0');res.status(200).json(buildProfile(req?.query||{}))};module.exports.buildProfile=buildProfile;module.exports.chooseTier=chooseTier;
