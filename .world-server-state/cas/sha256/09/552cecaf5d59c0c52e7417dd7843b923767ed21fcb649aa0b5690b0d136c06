#!/usr/bin/env python3
from __future__ import annotations
import argparse, copy, json
from pathlib import Path
from quality_common import ROOT, QUALITY, REGISTRY, read_json, write_json, iter_world_manifests

DEFAULTS={
 'controls':{'cameraRoll':False,'maxPitchDeg':89,'jumpImpulse':'vertical-only','feetFollowTravel':True,'attackFollowsFeet':True},
 'graphics':{
   'profile':'cinematic-preserve-v9','allowVisualGeometryLod':False,'allowTextureDownscale':False,'allowVisualRecompression':False,'performanceGovernor':'cpu-first-non-destructive-v9',
   'proximityQuality':{'enabled':True,'maxQualityRadius':32,'mediumRadius':72,'shadowRadius':34,'fogCullMargin':6,'preserveFullSourceGeometry':True,'fogOccludedCulling':True},
   'fpsOptimization':{'enabled':True,'mode':'cpu-first-near-lossless-v9','nearMaxRadius':36,'midRadius':90,'nearTickHz':60,'midTickHz':12,'farTickHz':2,'staticTransformFreeze':True,'staticShadowCache':True,'shaderWarmup':True,'texturePrewarm':True,'maximumNearAnisotropy':True,'exactDecorativeInstancing':True,'predictiveStreaming':True,'nearestFirstStreaming':True,'adaptiveDecodeConcurrency':True,'workerPlyDecode':True,'indexedDbShaCache':True,'serializedBvhCache':True,'materialDeduplicationExactOnly':True,'networkInterestManagement':True,'distantPoseSharing':True,'wasmSimd':True,'webgpuHzbPreferred':True,'webgpuIndirectMeshletsPreferred':True,'byteIdenticalAnimatedGlbRangeStreaming':True,'sweptDynamicMeshCollision':True,'wasmSimdThreadPool':True,'parallelBvhExactPrepass':True,'webgpuSourceEquivalentPbr':True,'forbidDynamicResolution':True,'forbidNearFieldFidelityReduction':True},
   'atmosphere':{'enabled':True,'mode':'linear-depth-fog-plus-horizon-shimmer','horizonShimmer':True,'shimmerStrength':0.00055,'backgroundBlend':True,'postDepthFog':True},
   'gpuVisibility':{'enabled':True,'mode':'webgl2-conservative-occlusion-v1','nearBypassRadius':42,'maxQueriesPerFrame':6,'occludedConfirmFrames':3},
   'webgpuVisibility':{'enabled':True,'mode':'private-depth-hzb-v1','nearBypassRadius':42,'failVisible':True,'confirmFrames':2,'width':256,'height':144,'fallback':'webgl2-conservative-occlusion-v1'},
   'webgpuPbr':{'enabled':True,'mode':'webgpu-source-equivalent-pbr-v1','sourceGeometryExact':True,'sourceTextureDimensionsPreserved':True,'lossyFallbackAllowed':False,'authority':'proven-renderer-until-device+golden-parity'},
   'reflectionProbes':{'enabled':True,'mode':'offline-preferred-runtime-fallback-v1','resolution':256,'far':900}},
 'materials':{'profile':'pbr-preserve-wet-v8','wetSurface':{'enabled':True,'intensity':0.14,'roughnessMultiplier':0.84,'envMapIntensityBoost':0.18,'clearcoat':0.12,'clearcoatRoughness':0.32,'runtimeOnly':True,'postFallbackForUnsupported':True}},
 'quality':{'profile':'WORLD_FACTORY_QUALITY_CORE_V10','preserveSourceAsset':True,'visualDecimationAllowed':False,'textureDownscaleAllowed':False,'visualRecompressionAllowed':False,'regressionGate':True,'visualRegressionGate':True,'geometryRegressionGate':True,'automatedPlaytestGate':True,'performanceGate':True,'knowledgeGate':True,'failClosed':True},
}

def merge_missing_and_protected(target,defaults,path='',changes=None):
    changes=changes if changes is not None else []
    for k,v in defaults.items():
        p=f'{path}.{k}' if path else k
        if isinstance(v,dict):
            if not isinstance(target.get(k),dict):target[k]={};changes.append({'path':p,'repair':'restore-object'})
            merge_missing_and_protected(target[k],v,p,changes)
        else:
            if target.get(k)!=v:
                target[k]=copy.deepcopy(v);changes.append({'path':p,'repair':'restore-global-standard','value':v})
    return changes

def main():
    ap=argparse.ArgumentParser(description='Safe auto-repair for declarative quality drift. Never edits source 3D assets or gameplay-specific content.')
    ap.add_argument('--apply',action='store_true');a=ap.parse_args();worlds=[];total=0
    for _,mpath,m in iter_world_manifests():
        before=json.dumps(m,sort_keys=True);changes=[]
        for key,defs in DEFAULTS.items():
            if not isinstance(m.get(key),dict):m[key]={}
            merge_missing_and_protected(m[key],defs,key,changes)
        m.setdefault('qualityLock',{})['runtimeStandard']='WORLD_FACTORY_QUALITY_CORE_V10'
        if changes and a.apply:write_json(mpath,m)
        worlds.append({'world':m.get('id'),'changes':changes,'applied':bool(changes and a.apply)});total+=len(changes)
    report={'pass':total==0 or a.apply,'changes':total,'applied':a.apply,'worlds':worlds,'sourceAssetsTouched':False}
    write_json(QUALITY/'reports/auto-repair.json',report);print(json.dumps(report,ensure_ascii=False,indent=2));raise SystemExit(0 if report['pass'] else 2)
if __name__=='__main__':main()
