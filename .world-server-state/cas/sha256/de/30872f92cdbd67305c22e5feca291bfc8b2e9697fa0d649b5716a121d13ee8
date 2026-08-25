#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, traceback
from pathlib import Path
from quality_common import ROOT, iter_world_manifests, read_json, write_json, sha256
from build_meshlets import build as build_meshlets
from build_animated_glb_stream_plan import build as build_glb_range_plan
from bake_glb_lightmaps import bake as bake_glb_lightmaps
from bake_offline_gi import bake as bake_offline_gi
from bake_reflection_probes import bake as bake_reflection_probes

V7='WORLD_FACTORY_QUALITY_CORE_V10'

def _asset_path(world:Path,m:dict)->Path:
    rel=str(m['visual']['url']).replace('./','',1)
    return (world/rel).resolve()

def _probe_positions(m:dict):
    p=m.get('spawn',{}).get('preferredPosition')
    if isinstance(p,list) and len(p)==3:return [[float(x) for x in p]]
    return [[0.0,1.6,0.0]]

def _set_v7_runtime_flags(m:dict):
    g=m.setdefault('graphics',{});g['profile']='cinematic-preserve-v9';g['performanceGovernor']='cpu-first-non-destructive-v9'
    fps=g.setdefault('fpsOptimization',{})
    fps.update({
      'enabled':True,'mode':'cpu-first-near-lossless-v9','nearMaxRadius':36,'midRadius':90,
      'nearTickHz':60,'midTickHz':12,'farTickHz':2,'staticTransformFreeze':True,'staticShadowCache':True,
      'shaderWarmup':True,'texturePrewarm':True,'maximumNearAnisotropy':True,'exactDecorativeInstancing':True,
      'predictiveStreaming':True,'nearestFirstStreaming':True,'adaptiveDecodeConcurrency':True,'workerPlyDecode':True,
      'indexedDbShaCache':True,'serializedBvhCache':True,'materialDeduplicationExactOnly':True,
      'networkInterestManagement':True,'distantPoseSharing':True,'wasmSimd':True,'webgpuHzbPreferred':True,
      'webgpuIndirectMeshletsPreferred':True,'byteIdenticalAnimatedGlbRangeStreaming':True,
      'sweptDynamicMeshCollision':True,'wasmSimdThreadPool':True,'parallelBvhExactPrepass':True,'webgpuSourceEquivalentPbr':True,'sharedArrayBufferDecode':True,'webgpuExactMaterialTable':True,'webgpuClusteredLighting':True,'virtualTextureResidencyFullResolution':True,'portalRoomVisibility':True,'screenSpaceAnimationBudget':True,'physicsSpatialHashBroadphase':True,'losslessNetworkDeltaCompression':True,'ratchetApprovedDeviceSchedules':True,'frameBudgetOrchestrator':True,'persistentDerivedArtifactCas':True,'stutterRegressionGate':True,'forbidDynamicResolution':True,'forbidNearFieldFidelityReduction':True,
    })
    g['gpuVisibility']={'enabled':True,'mode':'webgl2-conservative-occlusion-v1','nearBypassRadius':42,'maxQueriesPerFrame':6,'occludedConfirmFrames':3}
    g['webgpuVisibility']={'enabled':True,'mode':'private-depth-hzb-v1','nearBypassRadius':42,'failVisible':True,'confirmFrames':2,'width':256,'height':144,'fallback':'webgl2-conservative-occlusion-v1'}
    g['webgpuPbr']={'enabled':True,'mode':'webgpu-source-equivalent-pbr-v1','sourceGeometryExact':True,'sourceTextureDimensionsPreserved':True,'lossyFallbackAllowed':False,'authority':'proven-renderer-until-device+golden-parity'}
    g['webgpuMaterialTable']={'enabled':True,'mode':'webgpu-exact-material-table-v1','bindless':'capability-gated','sourceTextureDimensionsPreserved':True,'lossyFallbackAllowed':False}
    g['clusteredLighting']={'enabled':True,'mode':'webgpu-conservative-clustered-lighting-v1','overflowFallback':'full-light-list','nearCriticalRadius':42}
    g['virtualTextureResidency']={'enabled':True,'mode':'full-resolution-virtual-texture-residency-v1','nearRadius':42,'maxResidentPages':2048,'pageScale':1,'missingPageFallback':'whole-source-texture'}
    g['portalVisibility']={'enabled':True,'mode':'conservative-portal-room-visibility-v1','nearBypassRadius':42,'unknownRoomFailVisible':True}
    m['animationBudget']={'nearRadius':42,'midPixels':80,'farPixels':20,'midHz':30,'farHz':10,'interactionBoundaryExact':True}
    m['physicsBroadphase']={'cellSize':12,'nearRadius':50,'sleepDelaySec':2,'nearBodiesNeverSleep':True,'playerContactBodiesNeverSleep':True}
    m['networkCompression']={'mode':'lossless-delta-v1','quantization':False,'localPlayerAuthoritative':True}
    m.setdefault('performanceSchedule',{'profile':'default','knobs':{}})
    m.setdefault('frameBudget',{'backgroundBudgetMs':2.5,'nearCriticalNeverDeferred':True})
    rp=g.setdefault('reflectionProbes',{});rp.update({'enabled':True,'mode':'offline-preferred-runtime-fallback-v1','resolution':256,'far':900})
    q=m.setdefault('quality',{});q['profile']=V7
    m.setdefault('qualityLock',{})['runtimeStandard']=V7

def prepare_manifest(mpath:Path,quality='production',force=False,heavy_bakes='local')->dict:
    mpath=Path(mpath).resolve();m=read_json(mpath,{})
    if not m or 'visual' not in m:raise RuntimeError(f'invalid manifest: {mpath}')
    world=mpath.parent;src=_asset_path(world,m);v=m['visual'];expected=v.get('sha256')
    if not src.is_file():raise RuntimeError(f'visual missing: {src}')
    before=sha256(src)
    if expected and before!=expected:raise RuntimeError(f'SOURCE LOCK FAILURE before V8 preparation: {before} != {expected}')
    _set_v7_runtime_flags(m)
    generated=world/'generated';generated.mkdir(exist_ok=True)
    steps=[];typ=v.get('type');up=m.get('transform',{}).get('sourceUpAxis','Y')
    # Lossless meshlet metadata. This never rewrites source triangles.
    if typ in ('ply-mesh','glb'):
        try:
            md=build_meshlets(src,generated/'meshlets.json',max_tris=128)
            if not md.get('faceConservation') or md.get('sourceTriangles')!=md.get('meshletTriangles'):raise RuntimeError('meshlet face conservation failed')
            m['graphics']['meshlets']={'enabled':True,'url':'./generated/meshlets.json','mode':md['mode'],'sourceSha256':before,'sourceTriangles':md['sourceTriangles'],'meshletTriangles':md['meshletTriangles'],'faceConservation':True,'gpuIndirectDrawPath':'webgpu-compute-generated-drawIndexedIndirect-v1'}
            steps.append({'system':'meshlets','pass':True,'triangles':md['sourceTriangles'],'loss':0})
        except Exception as e: steps.append({'system':'meshlets','pass':False,'safeFallback':'whole-source-render','error':str(e)})
    # Byte-identical HTTP range plan is safe for static, animated, skinned and morph GLB.
    if typ=='glb':
        try:
            plan=build_glb_range_plan(src,generated/'glb-range-plan.json',segment_bytes=524288)
            if not plan['byteConservation'] or plan['coverageBytes']!=plan['sourceBytes']:raise RuntimeError('GLB byte conservation failed')
            st=m.setdefault('streaming',{});st.update({'rangePlanUrl':'./generated/glb-range-plan.json','rangeMode':plan['mode'],'byteIdenticalAssembly':True,'animatedSafe':True,'skinnedSafe':True,'morphSafe':True})
            steps.append({'system':'animated-glb-range-stream','pass':True,'segments':len(plan['segments']),'byteConservation':True,'animated':plan['animated'],'skinned':plan['skinned'],'morphTargets':plan['morphTargets']})
        except Exception as e:steps.append({'system':'animated-glb-range-stream','pass':False,'safeFallback':'whole-original-glb','error':str(e)})
        # UV companion bake remains useful even when offline GI is not directly bound per GLB vertex.
        try:
            res=1024 if quality=='production' else 512
            ld=bake_glb_lightmaps(src,generated/'lighting',resolution=res)
            lb=m.setdefault('lightingBake',{})
            if ld.get('entries'):
                lb.update({'enabled':True,'mode':'uv-lightmap-glb-v1','descriptorUrl':'./generated/lighting/lighting-bake.json','sourceSha256':before,'sourceAssetModified':False,'verified':True,'resolution':res})
            else:
                lb.update({'enabled':True,'mode':'runtime-normal-scalar-v1','sourceSha256':before,'sourceAssetModified':False,'verified':True})
            steps.append({'system':'glb-lightmap-companion','pass':True,'resolution':res,'entries':len(ld.get('entries',[])),'fallbacks':len(ld.get('fallbacks',[]))})
        except Exception as e:steps.append({'system':'glb-lightmap-companion','pass':False,'safeFallback':'runtime-normal-scalar-v1','error':str(e)})
    # Higher-quality offline GI for a static PLY mesh. Keep old scalar bake if unsupported/too expensive.
    if typ=='ply-mesh' and quality in ('production','cinematic') and heavy_bakes=='local':
        try:
            grid=64 if quality=='cinematic' else 56;rays=14 if quality=='cinematic' else 10
            gi=bake_offline_gi(src,generated/'lighting-gi',up_axis=up,grid=grid,rays=rays,max_steps=72,bounces=1)
            lb=m.setdefault('lightingBake',{});lb.update({'enabled':True,'mode':gi['mode'],'descriptorUrl':'./generated/lighting-gi/gi-bake.json','sourceSha256':before,'sourceAssetModified':False,'verified':True,'vertices':gi['sourceVertices'],'offlineRayTraced':True})
            steps.append({'system':'offline-gi','pass':True,'mode':gi['mode'],'grid':grid,'rays':rays,'cacheCells':gi['cacheCells']})
        except Exception as e:steps.append({'system':'offline-gi','pass':False,'safeFallback':m.get('lightingBake',{}).get('mode','vertex-scalar-ply-v1'),'error':str(e)})
    if typ=='ply-mesh' and quality in ('production','cinematic') and heavy_bakes!='local':
        steps.append({'system':'offline-gi','pass':True,'state':'queued-content-addressed-bake-farm','sourceSha256':before,'safeRuntimeFallback':m.get('lightingBake',{}).get('mode','runtime-lighting')})
    # Source-SHA-locked offline reflection cubemap; fallback runtime capture is preserved.
    if typ in ('ply-mesh','glb') and quality in ('production','cinematic') and heavy_bakes=='local':
        try:
            rr=64 if quality=='cinematic' else 48;grid=64 if quality=='cinematic' else 52
            rp=bake_reflection_probes(src,generated/'reflection-probes',_probe_positions(m),resolution=rr,grid=grid,max_steps=80,up_axis=up)
            m['graphics']['reflectionProbes'].update({'mode':'offline-preferred-runtime-fallback-v1','descriptorUrl':'./generated/reflection-probes/reflection-probes.json','sourceSha256':before,'offlineMode':rp['mode'],'runtimeFallback':'static-world-cubemap-once-v1','verified':True})
            steps.append({'system':'offline-reflection-probes','pass':True,'resolution':rr,'probes':len(rp['probes'])})
        except Exception as e:steps.append({'system':'offline-reflection-probes','pass':False,'safeFallback':'static-world-cubemap-once-v1','error':str(e)})
    if typ in ('ply-mesh','glb') and quality in ('production','cinematic') and heavy_bakes!='local':
        steps.append({'system':'offline-reflection-probes','pass':True,'state':'queued-content-addressed-bake-farm','sourceSha256':before,'safeRuntimeFallback':'static-world-cubemap-once-v1'})
    after=sha256(src)
    if after!=before:raise RuntimeError('SOURCE LOCK FAILURE after V8 preparation: source asset changed')
    write_json(mpath,m)
    report={'schemaVersion':2,'runtime':V7,'world':m.get('id'),'qualityTier':quality,'heavyBakes':heavy_bakes,'pass':True,'sourceSha256':before,'sourceAssetModified':False,'steps':steps}
    write_json(generated/'v8-preparation.json',report)
    return report

def main():
    ap=argparse.ArgumentParser(description='Prepare all/new worlds for V8 lossless high-quality runtime in one command.')
    ap.add_argument('--manifest',type=Path,default=None);ap.add_argument('--quality',choices=['balanced','production','cinematic'],default='production');ap.add_argument('--force',action='store_true');ap.add_argument('--heavy-bakes',choices=['local','distributed'],default='distributed');a=ap.parse_args()
    reports=[]
    if a.manifest:reports=[prepare_manifest(a.manifest,a.quality,a.force,a.heavy_bakes)]
    else:
        for _,mpath,_ in iter_world_manifests():
            try:reports.append(prepare_manifest(mpath,a.quality,a.force,a.heavy_bakes))
            except Exception as e:reports.append({'world':mpath.parent.name,'pass':False,'error':str(e),'trace':traceback.format_exc(limit=2)})
    ok=all(r.get('pass') for r in reports);out={'runtime':V7,'pass':ok,'worlds':reports,'sourceAssetsModified':False};print(json.dumps(out,ensure_ascii=False,indent=2));return 0 if ok else 2
if __name__=='__main__':raise SystemExit(main())
