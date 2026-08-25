#!/usr/bin/env python3
from __future__ import annotations
import argparse, json
from pathlib import Path
from quality_common import ROOT, REGISTRY, read_json, write_json, sha256, iter_world_manifests
from build_meshlets import build as build_meshlets

V7='WORLD_FACTORY_QUALITY_CORE_V10'

def migrate_manifest(mpath:Path,m:dict):
    changes=[];v=m.get('visual',{});world=mpath.parent
    def setv(obj,key,val,path):
        if obj.get(key)!=val:obj[key]=val;changes.append(path)
    g=m.setdefault('graphics',{});setv(g,'profile','cinematic-preserve-v9','graphics.profile');setv(g,'performanceGovernor','cpu-first-non-destructive-v9','graphics.performanceGovernor')
    fps=g.setdefault('fpsOptimization',{})
    defaults={'enabled':True,'mode':'cpu-first-near-lossless-v9','nearMaxRadius':36,'midRadius':90,'nearTickHz':60,'midTickHz':12,'farTickHz':2,'staticTransformFreeze':True,'staticShadowCache':True,'shaderWarmup':True,'texturePrewarm':True,'maximumNearAnisotropy':True,'exactDecorativeInstancing':True,'predictiveStreaming':True,'nearestFirstStreaming':True,'adaptiveDecodeConcurrency':True,'workerPlyDecode':True,'indexedDbShaCache':True,'serializedBvhCache':True,'materialDeduplicationExactOnly':True,'networkInterestManagement':True,'distantPoseSharing':True,'wasmSimd':True,'webgpuHzbPreferred':True,'webgpuIndirectMeshletsPreferred':True,'byteIdenticalAnimatedGlbRangeStreaming':True,'sweptDynamicMeshCollision':True,'wasmSimdThreadPool':True,'parallelBvhExactPrepass':True,'webgpuSourceEquivalentPbr':True,'forbidDynamicResolution':True,'forbidNearFieldFidelityReduction':True}
    for k,val in defaults.items():setv(fps,k,val,f'graphics.fpsOptimization.{k}')
    gpu=g.setdefault('gpuVisibility',{})
    for k,val in {'enabled':True,'mode':'webgl2-conservative-occlusion-v1','nearBypassRadius':42,'maxQueriesPerFrame':6,'occludedConfirmFrames':3}.items():setv(gpu,k,val,f'graphics.gpuVisibility.{k}')
    hzb=g.setdefault('webgpuVisibility',{})
    for k,val in {'enabled':True,'mode':'private-depth-hzb-v1','nearBypassRadius':42,'failVisible':True,'confirmFrames':2,'width':256,'height':144,'fallback':'webgl2-conservative-occlusion-v1'}.items():setv(hzb,k,val,f'graphics.webgpuVisibility.{k}')
    pbr=g.setdefault('webgpuPbr',{})
    for k,val in {'enabled':True,'mode':'webgpu-source-equivalent-pbr-v1','sourceGeometryExact':True,'sourceTextureDimensionsPreserved':True,'lossyFallbackAllowed':False,'authority':'proven-renderer-until-device+golden-parity'}.items():setv(pbr,k,val,f'graphics.webgpuPbr.{k}')
    rp=g.setdefault('reflectionProbes',{})
    for k,val in {'enabled':True,'mode':'offline-preferred-runtime-fallback-v1','resolution':256,'far':900}.items():setv(rp,k,val,f'graphics.reflectionProbes.{k}')
    mats=m.setdefault('materials',{});setv(mats,'profile','pbr-preserve-wet-v8','materials.profile')
    wet=mats.setdefault('wetSurface',{})
    for k,val in {'enabled':True,'intensity':0.14,'roughnessMultiplier':0.84,'envMapIntensityBoost':0.18,'clearcoat':0.12,'clearcoatRoughness':0.32,'runtimeOnly':True,'postFallbackForUnsupported':True}.items():
        if k not in wet:setv(wet,k,val,f'materials.wetSurface.{k}')
    if v.get('type') in ('ply-mesh','glb'):
        asset=(world/str(v.get('url','')).replace('./','',1)).resolve();out=world/'generated'/'meshlets.json'
        if not asset.is_file():raise RuntimeError(f'{m.get("id")}: visual asset missing for meshlet migration')
        md=build_meshlets(asset,out,max_tris=128)
        g['meshlets']={'enabled':True,'url':'./generated/meshlets.json','mode':md['mode'],'sourceSha256':v.get('sha256'),'sourceTriangles':md['sourceTriangles'],'meshletTriangles':md['meshletTriangles'],'faceConservation':True,'gpuIndirectDrawPath':'webgpu-compute-generated-drawIndexedIndirect-v1'};changes.append('graphics.meshlets')
    q=m.setdefault('quality',{});setv(q,'profile',V7,'quality.profile')
    lock=m.setdefault('qualityLock',{});setv(lock,'runtimeStandard',V7,'qualityLock.runtimeStandard')
    write_json(mpath,m);return changes

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--dry-run',action='store_true');a=ap.parse_args();reports=[]
    reg=read_json(REGISTRY,{}); reg['runtime']=V7
    if not a.dry_run:write_json(REGISTRY,reg)
    for entry,mpath,m in iter_world_manifests():
        if a.dry_run:reports.append({'world':m.get('id'),'wouldMigrate':True});continue
        changes=migrate_manifest(mpath,m);reports.append({'world':m.get('id'),'changes':changes,'sourceSha256':m.get('visual',{}).get('sha256'),'sourceAssetModified':False})
    print(json.dumps({'runtime':V7,'worlds':reports,'sourceAssetsModified':False},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
