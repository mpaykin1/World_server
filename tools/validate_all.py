#!/usr/bin/env python3
from __future__ import annotations
import json, re, sys
from pathlib import Path
from quality_common import ROOT, REGISTRY, QUALITY, inspect_asset, read_json, sha256, iter_world_manifests
from material_gate import validate as validate_materials


def add(errors, warnings, ok, msg, warn=False):
    if ok: return
    (warnings if warn else errors).append(msg)


def main(report_path: str | None = None):
    errors=[]; warnings=[]; checks=0; passed=0
    def check(ok,msg,warn=False):
        nonlocal checks,passed
        checks+=1
        if ok: passed+=1
        add(errors,warnings,ok,msg,warn)

    registry=read_json(REGISTRY,{})
    check(registry.get('schemaVersion')==2,'REG schemaVersion must be 2')
    check(registry.get('runtime')=='WORLD_FACTORY_QUALITY_CORE_V10','REG runtime must use shared V8 core')
    ids=set(); world_count=0
    for entry,mpath,m in iter_world_manifests():
        world_count+=1; wid=entry.get('id')
        check(wid not in ids,f'{wid}: duplicate world id'); ids.add(wid)
        check(m.get('schemaVersion')==2,f'{wid}: manifest schemaVersion !=2')
        check(m.get('id')==wid,f'{wid}: manifest id mismatch')
        v=m.get('visual',{})
        check(v.get('fidelity')=='source-locked',f'{wid}: visual must be source-locked')
        asset=(mpath.parent / str(v.get('url','')).replace('./','',1)).resolve()
        check(asset.is_file(),f'{wid}: visual missing {asset}')
        if asset.is_file():
            actual=sha256(asset); check(actual==v.get('sha256'),f'{wid}: visual SHA changed'); check(actual==m.get('qualityLock',{}).get('visualSha256'),f'{wid}: qualityLock SHA mismatch')
            try:
                current=inspect_asset(asset)
                saved=v.get('sourceStats') or {}
                check(current.get('type')==saved.get('type'),f'{wid}: source type drift')
                for key in ('vertices','faces','triangles','materials','textures'):
                    if saved.get(key) is not None and current.get(key) is not None:
                        check(current.get(key)==saved.get(key),f'{wid}: source {key} changed {saved.get(key)} -> {current.get(key)}')
            except Exception as exc:
                warnings.append(f'{wid}: source stats reinspection warning: {exc}')
            try:
                mr=validate_materials(asset)
                check(mr.get('pass') is True,f'{wid}: material gate failed: {mr.get("errors")}')
                warnings.extend([f'{wid}: material warning: {w}' for w in mr.get('warnings',[])])
            except Exception as exc:
                check(False,f'{wid}: material gate crashed: {exc}')

        q=m.get('quality',{})
        check(q.get('profile')=='WORLD_FACTORY_QUALITY_CORE_V10',f'{wid}: quality profile drift')
        check(q.get('preserveSourceAsset') is True,f'{wid}: source preservation disabled')
        check(q.get('visualDecimationAllowed') is False,f'{wid}: visual decimation allowed')
        check(q.get('textureDownscaleAllowed') is False,f'{wid}: texture downscale allowed')
        check(q.get('visualRecompressionAllowed') is False,f'{wid}: visual recompression allowed')
        for k in ('regressionGate','visualRegressionGate','geometryRegressionGate','automatedPlaytestGate','performanceGate','knowledgeGate','failClosed'):
            check(q.get(k) is True,f'{wid}: mandatory gate {k}=false/missing')

        typ=v.get('type')
        streaming=m.get('streaming',{})
        check(streaming.get('mode') in ('whole-asset-frustum-v2','lossless-spatial-chunks-v2','lossless-glb-spatial-chunks-v1','renderer-native-splat-v2'),f'{wid}: invalid streaming mode')
        check(streaming.get('lossless') is True,f'{wid}: streaming must be lossless')
        if typ=='glb' and streaming.get('rangePlanUrl'):
            rp=(mpath.parent / str(streaming.get('rangePlanUrl')).replace('./','',1)).resolve();check(rp.is_file(),f'{wid}: animated GLB range plan missing')
            if rp.is_file():
                rd=read_json(rp,{});check(rd.get('sourceSha256')==v.get('sha256'),f'{wid}: GLB range plan source SHA mismatch');check(rd.get('byteConservation') is True and int(rd.get('sourceBytes',-1))==int(rd.get('coverageBytes',-2)),f'{wid}: GLB range byte conservation failed')
        if streaming.get('mode') in ('lossless-spatial-chunks-v2','lossless-glb-spatial-chunks-v1'):
            chunks=streaming.get('chunks') or []
            check(bool(chunks),f'{wid}: streamed world has no chunks')
            check(int(streaming.get('sourceFaces',-1))==int(streaming.get('chunkFaces',-2)),f'{wid}: streaming face conservation failed')
            for ch in chunks:
                cp=(mpath.parent / str(ch.get('url','')).replace('./','',1)).resolve()
                check(cp.is_file(),f'{wid}: missing stream chunk {ch.get("id")}')
                if cp.is_file(): check(sha256(cp)==ch.get('sha256'),f'{wid}: stream chunk hash drift {ch.get("id")}')

        c=m.get('collision',{})
        check(c.get('enabled') is True,f'{wid}: collision disabled')
        if typ in ('spz','ply-splat'): check(c.get('mode')=='proxy',f'{wid}: splat requires collision proxy')
        if streaming.get('mode') in ('lossless-spatial-chunks-v2','lossless-glb-spatial-chunks-v1'): check(c.get('mode')=='proxy',f'{wid}: streamed visual requires full collision proxy')
        if c.get('mode')=='proxy':
            cp=(mpath.parent / str(c.get('url','')).replace('./','',1)).resolve()
            check(cp.is_file(),f'{wid}: collision proxy missing')
            if cp.is_file() and c.get('sha256'): check(sha256(cp)==c.get('sha256'),f'{wid}: collision proxy SHA changed')

        sem=m.get('semantic',{}); sp=(mpath.parent / str(sem.get('url','')).replace('./','',1)).resolve()
        check(sem.get('required') is True,f'{wid}: semantic analysis not required')
        check(sp.is_file(),f'{wid}: semantic map missing')
        if sp.is_file():
            s=read_json(sp,{})
            check(s.get('schemaVersion')==2,f'{wid}: semantic schema invalid')
            check(float(s.get('walkableArea',0))>0,f'{wid}: no walkable surface detected')

        nav=m.get('navigation',{}); np=(mpath.parent / str(nav.get('url','')).replace('./','',1)).resolve()
        check(nav.get('enabled') is True,f'{wid}: navigation disabled')
        check(nav.get('runtime')=='astar-v2',f'{wid}: navigation runtime drift')
        check(np.is_file(),f'{wid}: navgraph missing')
        if np.is_file():
            ng=read_json(np,{})
            check(int(ng.get('stats',{}).get('nodes',0))>0,f'{wid}: navgraph has no nodes')
            check(int(ng.get('stats',{}).get('edges',0))>0,f'{wid}: navgraph has no edges')

        spawn=m.get('spawn',{}); ctrl=m.get('controls',{}); player=m.get('player',{}); gfx=m.get('graphics',{})
        check(spawn.get('requireCapsuleClearance') is True,f'{wid}: spawn clearance rule missing')
        check(ctrl.get('cameraRoll') is False,f'{wid}: camera roll not locked')
        check(ctrl.get('jumpImpulse')=='vertical-only',f'{wid}: jump not vertical-only')
        check(ctrl.get('feetFollowTravel') is True and ctrl.get('attackFollowsFeet') is True,f'{wid}: character action direction contract broken')
        check(float(ctrl.get('maxPitchDeg',0))>=88,f'{wid}: vertical look too limited')
        check(float(player.get('stepHeight',999))<=0.45,f'{wid}: stepHeight unsafe')
        check(gfx.get('allowVisualGeometryLod') is False and gfx.get('allowTextureDownscale') is False and gfx.get('allowVisualRecompression') is False,f'{wid}: destructive performance setting enabled')
        check(gfx.get('profile')=='cinematic-preserve-v9',f'{wid}: wrong graphics profile')
        check(gfx.get('performanceGovernor')=='cpu-first-non-destructive-v9',f'{wid}: wrong performance governor')
        pq=gfx.get('proximityQuality',{})
        check(pq.get('enabled') is True and pq.get('preserveFullSourceGeometry') is True,f'{wid}: proximity max-quality system missing')
        check(float(pq.get('maxQualityRadius',0))>=8,f'{wid}: near max-quality radius invalid')
        fpsopt=gfx.get('fpsOptimization',{})
        check(fpsopt.get('enabled') is True and fpsopt.get('mode')=='cpu-first-near-lossless-v9',f'{wid}: V9 CPU-first FPS optimizer missing')
        check(fpsopt.get('forbidDynamicResolution') is True and fpsopt.get('forbidNearFieldFidelityReduction') is True,f'{wid}: near-field quality can be degraded')

        cpu_flags=('hierarchicalSpatialGrid','cpuPvs','cpuOcclusionCache','predictiveStreamingV2','incrementalWorldCompiler','incrementalCpuLightBake','navCollisionHashCache','simulationLod','cpuCausalityProfiler','qualitySafeCpuAutotuner','deterministicProductionReplay','clientRenderingOffload')
        for k in cpu_flags: check(fpsopt.get(k) is True,f'{wid}: V9 CPU-first flag {k} missing')
        check(fpsopt.get('serverGpuRequired') is False,f'{wid}: paid/discrete server GPU dependency forbidden')
        check(fpsopt.get('staticTransformFreeze') is True and fpsopt.get('shaderWarmup') is True and fpsopt.get('predictiveStreaming') is True,f'{wid}: CPU/streaming optimizations missing')
        check(fpsopt.get('workerPlyDecode') is True and fpsopt.get('indexedDbShaCache') is True and fpsopt.get('serializedBvhCache') is True,f'{wid}: worker/cache/BVH optimizations missing')
        check(fpsopt.get('materialDeduplicationExactOnly') is True and fpsopt.get('staticShadowCache') is True,f'{wid}: exact material/static shadow optimization missing')
        check(fpsopt.get('networkInterestManagement') is True and fpsopt.get('distantPoseSharing') is True,f'{wid}: distance network/pose optimization missing')
        gpu=gfx.get('gpuVisibility',{})
        check(gpu.get('enabled') is True and gpu.get('mode')=='webgl2-conservative-occlusion-v1',f'{wid}: WebGL fallback GPU occlusion system missing')
        check(float(gpu.get('nearBypassRadius',0))>=32,f'{wid}: GPU occlusion near safety radius too small')
        wg=gfx.get('webgpuVisibility',{})
        check(wg.get('enabled') is True and wg.get('mode')=='private-depth-hzb-v1',f'{wid}: WebGPU HZB visibility config missing')
        check(float(wg.get('nearBypassRadius',0))>=32 and wg.get('failVisible') is True,f'{wid}: WebGPU HZB safety contract missing')
        check(fpsopt.get('wasmSimd') is True,f'{wid}: WASM SIMD fast path not enabled')
        check(fpsopt.get('webgpuHzbPreferred') is True and fpsopt.get('webgpuIndirectMeshletsPreferred') is True,f'{wid}: WebGPU V8 fast paths not preferred')
        check(fpsopt.get('wasmSimdThreadPool') is True,f'{wid}: threaded WASM SIMD scheduler not enabled')
        check(fpsopt.get('parallelBvhExactPrepass') is True,f'{wid}: parallel exact BVH prepass not enabled')
        check(fpsopt.get('webgpuSourceEquivalentPbr') is True,f'{wid}: source-equivalent WebGPU PBR path not enabled')
        for key in ('sharedArrayBufferDecode','webgpuExactMaterialTable','webgpuClusteredLighting','virtualTextureResidencyFullResolution','portalRoomVisibility','screenSpaceAnimationBudget','physicsSpatialHashBroadphase','losslessNetworkDeltaCompression','ratchetApprovedDeviceSchedules','frameBudgetOrchestrator','persistentDerivedArtifactCas','stutterRegressionGate'):
            check(fpsopt.get(key) is True,f'{wid}: V8 fast path {key} missing')
        check(gfx.get('webgpuMaterialTable',{}).get('lossyFallbackAllowed') is False,f'{wid}: material table lossy fallback allowed')
        check(gfx.get('clusteredLighting',{}).get('overflowFallback')=='full-light-list',f'{wid}: clustered lighting may drop lights')
        check(gfx.get('virtualTextureResidency',{}).get('pageScale')==1,f'{wid}: virtual texture source scale changed')
        check(gfx.get('portalVisibility',{}).get('unknownRoomFailVisible') is True,f'{wid}: portal visibility not fail-visible')
        check(m.get('networkCompression',{}).get('quantization') is False,f'{wid}: network quantization enabled')
        check(m.get('physicsBroadphase',{}).get('playerContactBodiesNeverSleep') is True,f'{wid}: player-contact bodies may sleep')
        pbr=gfx.get('webgpuPbr',{})
        check(pbr.get('enabled') is True and pbr.get('mode')=='webgpu-source-equivalent-pbr-v1',f'{wid}: WebGPU PBR contract missing')
        check(pbr.get('sourceGeometryExact') is True and pbr.get('sourceTextureDimensionsPreserved') is True and pbr.get('lossyFallbackAllowed') is False,f'{wid}: WebGPU PBR source-equivalence safety missing')
        check(fpsopt.get('sweptDynamicMeshCollision') is True,f'{wid}: swept dynamic mesh collision not enabled')
        probe=gfx.get('reflectionProbes',{})
        check(probe.get('enabled') is True and probe.get('mode') in ('static-world-cubemap-once-v1','offline-preferred-runtime-fallback-v1'),f'{wid}: reflection probe system missing')
        if probe.get('descriptorUrl'):
            pp=(mpath.parent / str(probe.get('descriptorUrl')).replace('./','',1)).resolve();check(pp.is_file(),f'{wid}: offline reflection descriptor missing')
            if pp.is_file():
                pd=read_json(pp,{});check(pd.get('sourceSha256')==v.get('sha256'),f'{wid}: reflection descriptor source SHA mismatch');check(pd.get('mode')=='offline-voxel-raytraced-cubemap-v1' and pd.get('verified') is True,f'{wid}: offline reflection descriptor not verified')
                for pr in pd.get('probes',[]):
                    for face in pr.get('faces',[]):
                        fp=(pp.parent/str(face).replace('./','',1)).resolve();check(fp.is_file(),f'{wid}: offline reflection cubemap face missing {face}')
        meshlets=gfx.get('meshlets',{})
        if typ in ('ply-mesh','glb'):
            check(meshlets.get('enabled') is True and meshlets.get('faceConservation') is True,f'{wid}: lossless meshlet descriptor missing')
            check(meshlets.get('sourceSha256')==v.get('sha256'),f'{wid}: meshlet source SHA mismatch')
            check(int(meshlets.get('sourceTriangles',-1))==int(meshlets.get('meshletTriangles',-2)),f'{wid}: meshlet triangle conservation failed')
            mdp=(mpath.parent / str(meshlets.get('url','')).replace('./','',1)).resolve()
            check(mdp.is_file(),f'{wid}: meshlet descriptor file missing')
            if mdp.is_file():
                md=read_json(mdp,{})
                check(md.get('sourceSha256')==v.get('sha256'),f'{wid}: meshlet descriptor source SHA drift')
                check(int(md.get('sourceTriangles',-1))==int(md.get('meshletTriangles',-2)),f'{wid}: meshlet descriptor face conservation drift')
        atm=gfx.get('atmosphere',{})
        check(atm.get('enabled') is True and atm.get('mode')=='linear-depth-fog-plus-horizon-shimmer',f'{wid}: distance atmosphere missing')
        mats=m.get('materials',{}); wet=mats.get('wetSurface',{})
        check(mats.get('profile')=='pbr-preserve-wet-v8',f'{wid}: wet PBR profile missing')
        check(wet.get('enabled') is True and wet.get('runtimeOnly') is True,f'{wid}: runtime-only wet surface system missing')
        intensity=float(wet.get('intensity',-1)); check(0.05<=intensity<=0.25,f'{wid}: wetness must stay subtle (0.05..0.25)')
        check(wet.get('runtimeOnly') is True,f'{wid}: wetness must remain runtime-only')
        check(gfx.get('proximityQuality',{}).get('preserveFullSourceGeometry') is True,f'{wid}: distance optimization may not simplify source geometry')
        check(gfx.get('atmosphere',{}).get('enabled') is True,f'{wid}: atmosphere must be enabled for distance concealment')

        env=m.get('environment',{})
        check(env.get('runtime')=='dynamic-environment-v2' and env.get('sourceAssetsImmutable') is True,f'{wid}: dynamic environment runtime/source lock drift')

        bake=m.get('lightingBake',{})
        check(bake.get('enabled') is True,f'{wid}: static light bake disabled')
        if typ=='ply-mesh':
            check(bake.get('mode') in ('vertex-scalar-ply-v1','voxel-raytraced-gi-ply-v1'),f'{wid}: wrong PLY light bake mode')
            dp=(mpath.parent / str(bake.get('descriptorUrl','')).replace('./','',1)).resolve()
            check(dp.is_file(),f'{wid}: lighting bake descriptor missing')
            if dp.is_file():
                bd=read_json(dp,{})
                check(bd.get('sourceSha256')==v.get('sha256'),f'{wid}: lighting bake source SHA mismatch')
                bp=(dp.parent / str(bd.get('binaryUrl','')).replace('./','',1)).resolve()
                check(bp.is_file(),f'{wid}: lighting bake binary missing')
                if bp.is_file(): check(sha256(bp)==bd.get('binarySha256'),f'{wid}: lighting bake binary SHA drift')
                check(int(bd.get('sourceVertices',-1))==int(v.get('sourceStats',{}).get('vertices',-2)),f'{wid}: lighting bake vertex count drift')
            check(bake.get('verified') is True and bake.get('sourceAssetModified') is False,f'{wid}: lighting bake not verified/non-destructive')
        elif typ=='glb':
            check(bake.get('mode') in ('uv-lightmap-glb-v1','runtime-normal-scalar-v1'),f'{wid}: GLB static bake mode invalid')
            if bake.get('mode')=='uv-lightmap-glb-v1':
                dp=(mpath.parent / str(bake.get('descriptorUrl','')).replace('./','',1)).resolve();check(dp.is_file(),f'{wid}: GLB UV lightmap descriptor missing')
                if dp.is_file():
                    bd=read_json(dp,{});check(bd.get('sourceSha256')==v.get('sha256'),f'{wid}: GLB UV bake source SHA mismatch')
                    for e in bd.get('entries',[]):
                        tp=(dp.parent/str(e.get('textureUrl','')).replace('./','',1)).resolve();check(tp.is_file(),f'{wid}: GLB lightmap missing {e.get("geometryName")}')
                        if tp.is_file():check(sha256(tp)==e.get('textureSha256'),f'{wid}: GLB lightmap hash drift {e.get("geometryName")}')
            check(bake.get('verified') is True and bake.get('sourceAssetModified') is False,f'{wid}: GLB bake policy not verified/non-destructive')
            check(bake.get('sourceSha256')==v.get('sha256'),f'{wid}: GLB bake source SHA mismatch')
        elif typ in ('spz','ply-splat'):
            check(bake.get('mode')=='renderer-native-splat-lighting-v1',f'{wid}: splat lighting policy drift')
            check(bake.get('verified') is True and bake.get('sourceAssetModified') is False,f'{wid}: splat lighting policy not verified')

    check(world_count>0,'No registered worlds')

    # Known-error memory: every incident must be bound to a rule and a real test.
    incidents=read_json(QUALITY/'knowledge/incidents.json',{}).get('incidents',[])
    rules={x['id'] for x in read_json(QUALITY/'rules.json',{}).get('rules',[])}
    tests={x['id'] for x in read_json(ROOT/'tests/catalog.json',{}).get('tests',[])}
    for inc in incidents:
        fp=inc.get('fingerprint','unknown')
        prs=inc.get('preventionRules',[]); mts=inc.get('mandatoryTests',[])
        check(bool(prs) and all(r in rules for r in prs),f'incident {fp}: missing prevention rule')
        check(bool(mts) and all(t in tests for t in mts),f'incident {fp}: missing mandatory regression test')
        check(inc.get('status')=='protected',f'incident {fp}: not protected')

    # Promoted patterns must all be mandatory and shared, never copied into world folders.
    patterns=read_json(QUALITY/'knowledge/patterns.json',{}).get('patterns',[])
    for p in patterns:
        if p.get('state')=='mandatory': check(p.get('appliesTo')=='all',f'pattern {p.get("id")}: mandatory pattern not global')
    forbidden=[]
    for p in (ROOT/'worlds').glob('*/src/*.js'): forbidden.append(str(p.relative_to(ROOT)))
    check(not forbidden,f'QA-002: per-world runtime copies detected: {forbidden}')


    genome=read_json(QUALITY/'knowledge/quality-genome.json',{})
    traits=genome.get('traits',[])
    check(genome.get('id')=='WORLD_QUALITY_GENOME_V10','quality genome id mismatch')
    mandatory=[t for t in traits if str(t.get('state','')).startswith('mandatory')]
    check(len(mandatory)>=8,'quality genome has too few mandatory global traits')
    contracts=read_json(QUALITY/'knowledge/incident-contracts.json',{'contracts':[]}).get('contracts',[])
    if contracts:
        check(all(c.get('mustNeverRecur') for c in contracts if c.get('status')=='protected'),'protected incident contract missing mustNeverRecur')

    quarantine=read_json(QUALITY/'knowledge/quarantine.json',{'items':[]}).get('items',[])
    check(len(quarantine)==0,f'QA-012: unknown errors remain quarantined: {[x.get("fingerprint") for x in quarantine]}')
    workflow=(ROOT/'.github/workflows/quality-learning.yml').read_text(encoding='utf-8')
    check("workflow_run.conclusion == 'success'" in workflow,'QA-009: rollout is not guarded by successful source workflow')
    check('quality_rollout.py --repo . --mode promote' in workflow,'QA-010: transactional promote rollout missing')
    rollout=(ROOT/'tools/quality_rollout.py').read_text(encoding='utf-8')
    check('restore_latest' in rollout and "status':'rolled-back'" in rollout,'QA-010: automatic rollout rollback missing')
    prox=(ROOT/'src/proximity-quality.js').read_text(encoding='utf-8')
    check('fullyFogHidden' in prox and 'sourceGeometryChanged:false' in prox,'GFX-006: fog-only culling invariant missing')
    atmjs=(ROOT/'src/atmosphere-quality.js').read_text(encoding='utf-8')
    check('uWetIntensity' in atmjs and 'globalWetPostFallback' in atmjs,'MAT-003: global wet fallback missing')
    baked=(ROOT/'src/baked-lighting.js').read_text(encoding='utf-8')
    check('runtime-normal-scalar-v1' in baked and 'sourceAssetsModified:false' in baked,'LGT-002: cross-mesh baked lighting policy missing')
    fpsjs=(ROOT/'src/fps-quality-optimizer.js').read_text(encoding='utf-8')
    check('nearFieldQualityReduced:false' in fpsjs and 'pixelRatioReduced:false' in fpsjs,'PERF-003: near-field lossless FPS contract missing')
    gpujs=(ROOT/'src/gpu-occlusion-manager.js').read_text(encoding='utf-8')
    check('nearFieldNeverOcclusionCulled:true' in gpujs and 'd<this.nearRadius' in gpujs,'PERF-006: GPU occlusion near bypass missing')
    cachejs=(ROOT/'src/asset-cache.js').read_text(encoding='utf-8')
    check("crypto.subtle.digest('SHA-256'" in cachejs and 'Immutable asset SHA mismatch' in cachejs,'PERF-007: immutable SHA cache missing')
    bvhjs=(ROOT/'src/bvh-cache.js').read_text(encoding='utf-8')
    check('MeshBVH.serialize' in bvhjs and 'MeshBVH.deserialize' in bvhjs,'PERF-008: serialized BVH cache missing')
    dedup=(ROOT/'src/material-deduplicator.js').read_text(encoding='utf-8')
    check('exactOnly:true' in dedup and 'sourceMaterialsModified:false' in dedup,'PERF-010: exact-only material dedup missing')
    meshlet=(ROOT/'tools/build_meshlets.py').read_text(encoding='utf-8')
    check('faceConservation' in meshlet and 'sourceAssetModified' in meshlet,'PERF-011: lossless meshlet builder missing')
    probe=(ROOT/'src/reflection-probes.js').read_text(encoding='utf-8')
    check('dynamicPerFrameCapture:false' in probe and 'sourceAssetsModified:false' in probe,'PERF-012: static reflection probe contract missing')
    net=(ROOT/'src/network-interest-manager.js').read_text(encoding='utf-8')
    check('nearFullPrecision:true' in net and 'sourceQualityReduced:false' in net,'NET-001: network near-field precision contract missing')
    pose=(ROOT/'src/distant-pose-sharing.js').read_text(encoding='utf-8')
    check('nearCharactersUntouched:true' in pose,'ANM-001: distant pose sharing near-safety contract missing')
    shadow=(ROOT/'src/static-shadow-cache.js').read_text(encoding='utf-8')
    check('onlyWhenNoDynamicShadowCasters:true' in shadow,'PERF-013: safe static shadow cache contract missing')
    hzb=(ROOT/'src/webgpu-hzb-visibility.js').read_text(encoding='utf-8')
    check('webgpu-private-depth-hzb-v1' in hzb and "failureMode:'all-visible-safe-fallback'" in hzb and 'nearFieldNeverCulled:true' in hzb,'PERF-014: conservative WebGPU HZB contract missing')
    wasm=(ROOT/'src/wasm/quality-simd.wasm')
    check(wasm.is_file() and wasm.stat().st_size>500,'PERF-015: compiled WASM SIMD module missing')
    indirect=(ROOT/'src/webgpu-meshlet-indirect.js').read_text(encoding='utf-8')
    check('sourceIndexBufferRewritten:false' in indirect and 'drawIndexedIndirect' in indirect,'PERF-016: lossless WebGPU indirect meshlet kernel missing')
    gi=(ROOT/'tools/bake_offline_gi.py').read_text(encoding='utf-8')
    check('voxel-raytraced-gi-ply-v1' in gi and 'sourceAssetModified' in gi,'LGT-004: offline GI baker missing')
    refl=(ROOT/'tools/bake_reflection_probes.py').read_text(encoding='utf-8')
    check('offline-voxel-raytraced-cubemap-v1' in refl and 'sourceAssetModified' in refl,'LGT-005: offline reflection baker missing')
    ranges=(ROOT/'tools/build_animated_glb_stream_plan.py').read_text(encoding='utf-8')
    check('byte-identical-parallel-range-glb-v1' in ranges and 'byteConservation' in ranges,'STR-001: animated GLB byte-conservation planner missing')
    sweep=(ROOT/'src/dynamic-swept-collision.js').read_text(encoding='utf-8')
    check('sweepPlayerAgainstDynamicMesh' in sweep and "kind:'mesh-bvh'" in sweep,'PHY-008: swept dynamic mesh collision missing')
    tele=(ROOT/'api/quality-telemetry.js').read_text(encoding='utf-8')
    check('deliberately excludes project/world' in tele and 'protectedRecurrences' in tele,'QA-016/017: global production telemetry fingerprint protection missing')
    heal=(ROOT/'tools/self_heal_protected_errors.py').read_text(encoding='utf-8')
    check('rolled-back-tests-failed' in heal and 'repair-backups' in heal,'QA-018: transactional protected self-heal missing')
    sched=(ROOT/'src/adaptive-tick-scheduler.js').read_text(encoding='utf-8')
    check('playerPhysicsThrottled:false' in sched and 'nearFieldFullRate:true' in sched,'PERF-004: adaptive scheduler may throttle critical near physics')
    spz=(ROOT/'tools/spz_native_decoder.py').read_text(encoding='utf-8')
    check('legacy-gzip' in spz and 'v4-zstd' in spz,'SRC-003: native SPZ v1-v4 position decoder missing')
    sm=(ROOT/'src/shared-memory-decode.js').read_text(encoding='utf-8');check('SharedArrayBuffer' in sm and 'transferable-arraybuffer-fallback' in sm,'PERF-020: shared-memory decode/fallback contract missing')
    vh=read_json(ROOT/'vercel.json',{});hdr={x.get('key'):x.get('value') for h in vh.get('headers',[]) for x in h.get('headers',[])};check(hdr.get('Cross-Origin-Opener-Policy')=='same-origin' and hdr.get('Cross-Origin-Embedder-Policy')=='require-corp','PERF-020: COOP/COEP headers missing')
    mt=(ROOT/'src/webgpu-material-table.js').read_text(encoding='utf-8');check('sourceTextureDimensionsPreserved:true' in mt and 'lossyFallbackAllowed:false' in mt,'PERF-021: exact material table contract missing')
    cl=(ROOT/'src/webgpu-clustered-lighting.js').read_text(encoding='utf-8');check('full-light-list-fallback' in cl and 'nearCriticalLightsNeverDropped:true' in cl,'LGT-006: clustered light fail-bright contract missing')
    vt=(ROOT/'src/virtual-texture-residency.js').read_text(encoding='utf-8');check('full-source-texture' in vt and 'sourceTextureDownscale:false' in vt,'PERF-022: virtual texture near-quality contract missing')
    pv=(ROOT/'src/portal-visibility.js').read_text(encoding='utf-8');check('unknownRoomFailVisible:true' in pv and 'nearFieldNeverPortalCulled:true' in pv,'PERF-023: portal fail-visible contract missing')
    ab=(ROOT/'src/animation-budget.js').read_text(encoding='utf-8');check('interactionBoundaryExact:true' in ab and 'animationTimeAccumulatedNotDiscarded:true' in ab,'ANM-002: animation budget contract missing')
    broad=(ROOT/'src/physics-spatial-broadphase.js').read_text(encoding='utf-8');check('nearBodiesNeverSlept:true' in broad and 'playerContactBodiesNeverSlept:true' in broad,'PHY-009: broadphase sleep safety missing')
    nd=(ROOT/'src/network-delta-codec.js').read_text(encoding='utf-8');check('quantization:false' in nd and 'localPlayerAlwaysAuthoritative:true' in nd,'NET-002: lossless network delta contract missing')
    ds=(ROOT/'src/device-performance-schedule.js').read_text(encoding='utf-8');check('SAFE_DEVICE_KNOBS' in ds and 'nearFieldQualityReduced:false' in ds,'PERF-024: device schedule safe knob gate missing')
    cas=(ROOT/'tools/cas_artifact_cache.py').read_text(encoding='utf-8');check('sha256' in cas and 'sourceAssetModified' in cas,'QA-025: persistent CAS source lock missing')
    pat=(ROOT/'tools/pattern_applicability_gate.py').read_text(encoding='utf-8');check('blindGlobalPropagationForbidden' in pat and 'compatible' in pat,'QA-026: pattern applicability firewall missing')
    fb=(ROOT/'src/frame-budget-orchestrator.js').read_text(encoding='utf-8');check('nearCriticalNeverDeferred:true' in fb and 'qualityKnobsTouched:false' in fb,'PERF-025: frame budget quality contract missing')
    st=(ROOT/'tools/stutter_regression.py').read_text(encoding='utf-8');check('p99Ms' in st and 'hitches50ms' in st,'PERF-026: stutter regression gate missing')
    prot=read_json(QUALITY/'knowledge/protection-pack.json',{})
    check(bool(prot.get('protectionHash')) and not prot.get('errors'), 'QA-014: compiled protection pack missing/invalid')
    check(len(prot.get('protectedIncidents',[]))==len(incidents),'QA-014: protection pack does not cover every incident')

    score=round(100*passed/max(checks,1),1)
    report={'schemaVersion':2,'pass':not errors,'score':score,'checks':checks,'passed':passed,'errors':errors,'warnings':warnings,'worlds':world_count}
    out=Path(report_path) if report_path else QUALITY/'reports/static-validation.json'
    out.parent.mkdir(parents=True,exist_ok=True); out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(('QUALITY GATE: PASS' if not errors else 'QUALITY GATE: FAIL')+f' — score {score}% — {world_count} world(s)')
    for e in errors: print(' - FAIL',e)
    for w in warnings: print(' - WARN',w)
    return 0 if not errors else 1

if __name__=='__main__': sys.exit(main(sys.argv[1] if len(sys.argv)>1 else None))
