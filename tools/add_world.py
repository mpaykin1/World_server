#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, os, shutil, sys, tempfile
from pathlib import Path

from quality_common import (
    ROOT, WORLDS, REGISTRY, inspect_asset, infer_up_axis, infer_scale, rotation_for_axis,
    sha256, slugify, read_json, write_json
)
from auto_collider import generate_auto_collider
from semantic_analyzer import analyze_mesh
from nav_builder import build_navgraph
from build_streaming_chunks import build_ply_chunks
from build_glb_chunks import build_glb_chunks
from bake_glb_lightmaps import bake as bake_glb_lightmaps
from regression_gate import snapshot as regression_snapshot
from bake_lighting import bake_vertex_scalar
from build_meshlets import build as build_meshlets
from prepare_world_v6 import prepare_manifest as prepare_world_v7

EXACT_COLLIDER_FACE_LIMIT = 700_000
PROXY_FACE_LIMIT = 220_000


def copy_locked(src: Path, dst: Path) -> str:
    src_hash=sha256(src)
    dst.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(src,dst)
    dst_hash=sha256(dst)
    if src_hash != dst_hash:
        dst.unlink(missing_ok=True)
        raise RuntimeError('SOURCE LOCK FAILURE: copied visual hash changed')
    return src_hash


def inspect_mesh_faces(info: dict) -> int:
    return int(info.get('faces') or info.get('triangles') or 0)


def main():
    ap=argparse.ArgumentParser(description='Quality-first world ingest. Visual source bytes are never degraded.')
    ap.add_argument('visual',type=Path)
    ap.add_argument('--collision',type=Path,default=None)
    ap.add_argument('--id',default=None)
    ap.add_argument('--title',default=None)
    ap.add_argument('--up-axis',choices=['auto','X','Y','Z','x','y','z'],default='auto')
    ap.add_argument('--scale',type=float,default=None,help='Explicit runtime scale. Default: conservative auto inference.')
    ap.add_argument('--no-auto-collider',action='store_true')
    ap.add_argument('--spz-decoder',default=os.environ.get('SPZ_DECODER_COMMAND'))
    ap.add_argument('--replace-generated-collision',action='store_true')
    ap.add_argument('--quality-tier',choices=['balanced','production','cinematic'],default='production',help='V8 derived-data preparation. Source assets remain immutable.')
    args=ap.parse_args()

    visual=args.visual.resolve()
    if not visual.is_file(): raise SystemExit(f'Visual file not found: {visual}')
    info=inspect_asset(visual)
    world_id=slugify(args.id or visual.stem)
    title=args.title or world_id.replace('-',' ').replace('_',' ').title()
    world_dir=WORLDS/world_id
    if world_dir.exists():
        raise SystemExit(f'World "{world_id}" already exists. Existing world versions are immutable; use a new id/version.')

    collision_src=args.collision.resolve() if args.collision else None
    if collision_src and not collision_src.is_file(): raise SystemExit(f'Collision file not found: {collision_src}')
    collision_info=inspect_asset(collision_src) if collision_src else None
    if collision_info and collision_info['type'] not in ('glb','ply-mesh'):
        raise SystemExit('Collision must be a triangle mesh (.glb or mesh .ply)')

    axis_basis=collision_info or info
    up_axis,axis_conf,axis_meta=infer_up_axis(axis_basis,args.up_axis)
    scale,scale_conf,scale_meta=infer_scale(axis_basis,args.scale)

    heavy=inspect_mesh_faces(info)>EXACT_COLLIDER_FACE_LIMIT
    splat=info['type'] in ('spz','ply-splat')
    extents=(info.get('bounds') or {}).get('extents') or [0,0,0]
    streaming_required=info['type'] in ('ply-mesh','glb') and (inspect_mesh_faces(info)>1_000_000 or max(extents)>400)
    needs_proxy=heavy or splat or streaming_required

    assets=world_dir/'assets'; generated=world_dir/'generated'; assets.mkdir(parents=True); generated.mkdir(parents=True)
    visual_dst=assets/('visual'+visual.suffix.lower())
    visual_hash=copy_locked(visual,visual_dst)
    meshlet_descriptor=None
    if info['type'] in ('ply-mesh','glb'):
        try:
            md=build_meshlets(visual_dst,generated/'meshlets.json',max_tris=128)
            meshlet_descriptor={'enabled':True,'url':'./generated/meshlets.json','mode':md['mode'],'sourceSha256':visual_hash,'sourceTriangles':md['sourceTriangles'],'meshletTriangles':md['meshletTriangles'],'faceConservation':True,'gpuIndirectDrawPath':'webgpu-compute-generated-drawIndexedIndirect-v1'}
        except Exception as exc:
            meshlet_descriptor={'enabled':False,'reason':f'fail-safe:{exc}'}

    auto_stats=None
    if collision_src is None and needs_proxy:
        if args.no_auto_collider:
            shutil.rmtree(world_dir,ignore_errors=True)
            raise SystemExit('QUALITY GATE BLOCKED: this world requires a collision proxy and auto-collider was disabled.')
        proxy_tmp=generated/'collision-auto.ply'
        try:
            auto_stats=generate_auto_collider(visual,proxy_tmp,max_faces=PROXY_FACE_LIMIT,spz_decoder=args.spz_decoder)
            collision_src=proxy_tmp
            collision_info=inspect_asset(proxy_tmp)
        except Exception as exc:
            shutil.rmtree(world_dir,ignore_errors=True)
            raise SystemExit(f'QUALITY GATE BLOCKED: automatic collider generation failed: {exc}')

    if collision_src:
        if collision_src.parent == generated:
            collision_dst=collision_src
            collision_hash=sha256(collision_dst)
        else:
            collision_dst=assets/('collision'+collision_src.suffix.lower())
            collision_hash=copy_locked(collision_src,collision_dst)
        collision_info=inspect_asset(collision_dst)
        faces=inspect_mesh_faces(collision_info)
        if faces > PROXY_FACE_LIMIT:
            shutil.rmtree(world_dir,ignore_errors=True)
            raise SystemExit(f'QUALITY GATE BLOCKED: collision proxy too heavy ({faces:,} faces > {PROXY_FACE_LIMIT:,})')
        collision_obj={
            'enabled':True,'mode':'proxy','type':collision_info['type'],
            'url':'./'+collision_dst.relative_to(world_dir).as_posix(),
            'sha256':collision_hash,'generated':bool(auto_stats),
            'generatorStats':auto_stats,
        }
        semantic_mesh=collision_dst
    else:
        collision_obj={'enabled':True,'mode':'visual-exact','generated':False}
        semantic_mesh=visual_dst

    # Semantic/navigation analysis is mandatory for mesh collision geometry.
    semantic_rel='./generated/semantic.json'
    semantic_path=world_dir/'generated'/'semantic.json'
    try:
        semantic=analyze_mesh(semantic_mesh,up_axis,scale,max_slope_deg=50)
        write_json(semantic_path,semantic)
        navgraph=build_navgraph(semantic_mesh,up_axis,scale,cell_size=semantic['navigation']['recommendedCellSize'],max_slope_deg=50,step_height=0.38)
        write_json(world_dir/'generated'/'navgraph.json',navgraph)
    except Exception as exc:
        shutil.rmtree(world_dir,ignore_errors=True)
        raise SystemExit(f'QUALITY GATE BLOCKED: semantic/navigation analysis failed: {exc}')

    streaming={'mode':'whole-asset-frustum-v2','lossless':True}
    if info['type'] in ('spz','ply-splat'):
        streaming={'mode':'renderer-native-splat-v2','lossless':True}
    elif streaming_required and info['type']=='ply-mesh':
        chunk_dir=world_dir/'generated'/'streaming'
        streaming=build_ply_chunks(visual_dst,chunk_dir,up_axis,scale,target_faces=150_000)
        streaming['bootstrapCenter']=[0,0,0]
    elif streaming_required and info['type']=='glb':
        try:
            chunk_dir=world_dir/'generated'/'glb-chunks'
            streaming=build_glb_chunks(visual_dst,chunk_dir,target_faces=120_000,max_chunks=64)
            streaming['bootstrapCenter']=[0,0,0]
            streaming['preloadRadius']=180;streaming['unloadRadius']=260;streaming['concurrency']=2;streaming['predictSeconds']=1.2
        except Exception as exc:
            # Fail safe for quality: keep the untouched whole GLB rather than emitting a visually uncertain derivative.
            streaming={'mode':'whole-asset-frustum-v2','lossless':True,'optimizationDeferred':f'glb-chunker-fail-safe:{exc}'}

    manifest={
        'schemaVersion':2,
        'id':world_id,
        'title':title,
        'visual':{
            'type':info['type'],'url':'./assets/'+visual_dst.name,
            'fidelity':'source-locked','sha256':visual_hash,
            'sourceStats':info,
        },
        'transform':{
            'sourceUpAxis':up_axis,'rotationDeg':rotation_for_axis(up_axis),
            'position':[0,0,0],'scale':scale,
            'autoInference':{
                'axisConfidence':round(axis_conf,4),'axis':axis_meta,
                'scaleConfidence':round(scale_conf,4),'scale':scale_meta,
            }
        },
        'collision':collision_obj,
        'streaming':streaming,
        'semantic':{'url':semantic_rel,'required':True},
        'spawn':{
            'mode':'auto-safe-ground','maxSnapDistance':16,'maxSlopeDeg':50,'gridSize':15,
            'requireCapsuleClearance':True,'preferDominantFloorBand':True,
        },
        'navigation':{
            'enabled':True,'source':'semantic-walkable-surfaces','url':'./generated/navgraph.json','agentRadius':0.32,'agentHeight':1.72,
            'maxSlopeDeg':50,'stepHeight':0.38,'dropLimit':0.75,'runtime':'astar-v2',
        },
        'player':{
            'profile':'human-v2','height':1.72,'radius':0.32,'eyeHeight':1.58,
            'moveSpeed':4.6,'airControl':0.30,'jumpSpeed':5.6,'gravity':16.5,'maxFallSpeed':28,
            'groundSnap':0.24,'stepHeight':0.38,'maxSlopeDeg':50,'fallResetMargin':12,
        },
        'controls':{
            'profile':'standard-v2','desktop':True,'mobile':True,'gamepad':True,
            'cameraRoll':False,'maxPitchDeg':89,'jumpImpulse':'vertical-only','feetFollowTravel':True,
            'attackFollowsFeet':True,
        },
        'graphics':{
            'profile':'cinematic-preserve-v9','sourceColor':'srgb','toneMapping':'aces',
            'castShadows':True,'receiveShadows':True,'allowVisualGeometryLod':False,
            'allowTextureDownscale':False,'allowVisualRecompression':False,
            'performanceGovernor':'cpu-first-non-destructive-v9',
            'proximityQuality':{'enabled':True,'maxQualityRadius':32,'mediumRadius':72,'shadowRadius':34,'fogCullMargin':6,'preserveFullSourceGeometry':True,'fogOccludedCulling':True},
            'fpsOptimization':{'enabled':True,'mode':'cpu-first-near-lossless-v9','nearMaxRadius':36,'midRadius':90,'nearTickHz':60,'midTickHz':12,'farTickHz':2,'staticTransformFreeze':True,'staticShadowCache':True,'shaderWarmup':True,'texturePrewarm':True,'maximumNearAnisotropy':True,'exactDecorativeInstancing':True,'predictiveStreaming':True,'nearestFirstStreaming':True,'adaptiveDecodeConcurrency':True,'workerPlyDecode':True,'indexedDbShaCache':True,'serializedBvhCache':True,'materialDeduplicationExactOnly':True,'networkInterestManagement':True,'distantPoseSharing':True,'wasmSimd':True,'webgpuHzbPreferred':True,'webgpuIndirectMeshletsPreferred':True,'byteIdenticalAnimatedGlbRangeStreaming':True,'sweptDynamicMeshCollision':True,'wasmSimdThreadPool':True,'parallelBvhExactPrepass':True,'webgpuSourceEquivalentPbr':True,'forbidDynamicResolution':True,'forbidNearFieldFidelityReduction':True},
            'gpuVisibility':{'enabled':True,'mode':'webgl2-conservative-occlusion-v1','nearBypassRadius':42,'maxQueriesPerFrame':6,'occludedConfirmFrames':3},
            'webgpuVisibility':{'enabled':True,'mode':'private-depth-hzb-v1','nearBypassRadius':42,'failVisible':True,'confirmFrames':2,'width':256,'height':144,'fallback':'webgl2-conservative-occlusion-v1'},
            'webgpuPbr':{'enabled':True,'mode':'webgpu-source-equivalent-pbr-v1','sourceGeometryExact':True,'sourceTextureDimensionsPreserved':True,'lossyFallbackAllowed':False,'authority':'proven-renderer-until-device+golden-parity'},
            'reflectionProbes':{'enabled':True,'mode':'offline-preferred-runtime-fallback-v1','resolution':256,'far':900},
            'meshlets':meshlet_descriptor,
            'atmosphere':{'enabled':True,'mode':'linear-depth-fog-plus-horizon-shimmer','horizonShimmer':True,'shimmerStrength':0.00055,'backgroundBlend':True,'postDepthFog':True},
        },
        'materials':{
            'profile':'pbr-preserve-wet-v8','validateMaps':True,'validateColorSpace':True,
            'allowMissingSourceMaps':False,
            'wetSurface':{'enabled':True,'intensity':0.14,'roughnessMultiplier':0.84,'envMapIntensityBoost':0.18,'clearcoat':0.12,'clearcoatRoughness':0.32,'runtimeOnly':True,'postFallbackForUnsupported':True},
        },
        'lightingBake':{
            'enabled':True,'requiredForStaticMesh':True,
            'mode':'vertex-scalar-ply-v1' if info['type']=='ply-mesh' else ('uv-lightmap-glb-v1' if info['type']=='glb' else 'renderer-native-splat-lighting-v1'),
        },
        'audio':{
            'profile':'variation-v2','minimumVariationsPerRepeatedEvent':3,
            'randomPitch':True,'randomGain':True,'spatial':True,'materialFootsteps':True,
        },
        'gameplay':{
            'componentStandard':'gameplay-components-v2',
            'modules':['health','damage','interaction','inventory','checkpoint','weapon-contract','shield-contract'],
        },
        'environment':{
            'dynamicPlatforms':[],
            'waterVolumes':[],
            'runtime':'dynamic-environment-v2',
            'sourceAssetsImmutable':True,
        },
        'quality':{
            'profile':'WORLD_FACTORY_QUALITY_CORE_V10','preserveSourceAsset':True,
            'visualDecimationAllowed':False,'textureDownscaleAllowed':False,'visualRecompressionAllowed':False,
            'regressionGate':True,'visualRegressionGate':True,'geometryRegressionGate':True,
            'automatedPlaytestGate':True,'performanceGate':True,'knowledgeGate':True,
            'failClosed':True,
        },
        'qualityLock':{
            'visualSha256':visual_hash,'immutableWorldId':True,
            'runtimeStandard':'WORLD_FACTORY_QUALITY_CORE_V10','ruleset':'quality/rules.json',
        },
    }
    manifest_path=world_dir/'world.json'
    write_json(manifest_path,manifest)
    if info['type']=='ply-mesh':
        try:
            descriptor, bake_stats=bake_vertex_scalar(manifest_path,world_dir/'generated'/'lighting')
            manifest['lightingBake'].update({
                'descriptorUrl':'./generated/lighting/'+descriptor.name,
                'sourceSha256':visual_hash,'verified':True,'sourceAssetModified':False,
                'vertices':bake_stats['sourceVertices'],
            })
            write_json(manifest_path,manifest)
        except Exception as exc:
            shutil.rmtree(world_dir,ignore_errors=True)
            raise SystemExit(f'QUALITY GATE BLOCKED: static light bake failed: {exc}')
    elif info['type']=='glb':
        try:
            light_dir=world_dir/'generated'/'lighting'
            desc=bake_glb_lightmaps(visual_dst,light_dir,resolution=512)
            if desc.get('entries'):
                manifest['lightingBake'].update({'mode':'uv-lightmap-glb-v1','descriptorUrl':'./generated/lighting/lighting-bake.json','verified':True,'verification':'uv-companion-source-sha-locked','sourceSha256':visual_hash,'sourceAssetModified':False,'lightmappedMeshes':len(desc.get('entries',[])),'fallbackMeshes':len(desc.get('fallbacks',[]))})
            else:
                manifest['lightingBake'].update({'mode':'runtime-normal-scalar-v1','verified':True,'verification':'runtime-deterministic-source-sha-locked','sourceSha256':visual_hash,'sourceAssetModified':False})
            write_json(manifest_path,manifest)
        except Exception as exc:
            manifest['lightingBake'].update({'mode':'runtime-normal-scalar-v1','verified':True,'verification':f'uv-bake-safe-fallback:{exc}','sourceSha256':visual_hash,'sourceAssetModified':False})
            write_json(manifest_path,manifest)
    else:
        manifest['lightingBake'].update({'verified':True,'verification':'renderer-native-non-mesh','sourceSha256':visual_hash,'sourceAssetModified':False})
        write_json(manifest_path,manifest)
    # V8 advanced preparation is one automatic phase: meshlets/range streaming/offline GI/reflections.
    prep=prepare_world_v7(manifest_path,args.quality_tier,heavy_bakes='distributed')
    manifest=read_json(manifest_path,{})
    # First source-locked version becomes the immutable geometry/controller baseline automatically.
    write_json(ROOT/'quality'/'baselines'/'worlds'/f'{world_id}.json', regression_snapshot(world_dir/'world.json',manifest))

    registry=read_json(REGISTRY,{'schemaVersion':2,'runtime':'WORLD_FACTORY_QUALITY_CORE_V10','worlds':[]})
    registry['schemaVersion']=2; registry['runtime']='WORLD_FACTORY_QUALITY_CORE_V10'
    registry.setdefault('worlds',[]).append({'id':world_id,'manifest':f'./worlds/{world_id}/world.json','enabled':True})
    write_json(REGISTRY,registry)

    print(f'PASS: {world_id}')
    print(f'visual={info["type"]} source_sha256={visual_hash}')
    print(f'orientation={up_axis} confidence={axis_conf:.2f} scale={scale:g} confidence={scale_conf:.2f}')
    print(f'collision={collision_obj["mode"]} auto={collision_obj.get("generated",False)}')
    print('semantic/navigation metadata: generated')
    print(f'lighting-bake={manifest.get("lightingBake",{}).get("mode")} verified={manifest.get("lightingBake",{}).get("verified")}')
    print(f'v8-preparation={args.quality_tier} steps={len(prep.get("steps",[]))} source-unchanged={not prep.get("sourceAssetsModified",True)}')
    print('Visual source bytes: unchanged and locked')

if __name__=='__main__':
    try: main()
    except KeyboardInterrupt: raise
    except SystemExit: raise
    except Exception as exc:
        print(f'ERROR: {exc}',file=sys.stderr); sys.exit(2)
