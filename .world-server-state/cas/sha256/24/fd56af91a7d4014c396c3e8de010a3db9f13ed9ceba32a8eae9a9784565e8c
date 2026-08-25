import json, math, sys, tempfile, unittest
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from quality_common import read_json, sha256, iter_world_manifests
from auto_collider import build_proxy_from_points
from build_streaming_chunks import build_ply_chunks
from nav_builder import build_navgraph
import trimesh

class QualityCoreTests(unittest.TestCase):
    def test_known_incidents_have_permanent_protection(self):
        inc=read_json(ROOT/'quality/knowledge/incidents.json',{})['incidents']
        rules={r['id'] for r in read_json(ROOT/'quality/rules.json',{})['rules']}
        tests={t['id'] for t in read_json(ROOT/'tests/catalog.json',{})['tests']}
        self.assertGreaterEqual(len(inc),7)
        for x in inc:
            self.assertEqual(x['status'],'protected',x['fingerprint'])
            self.assertTrue(set(x['preventionRules']) <= rules,x['fingerprint'])
            self.assertTrue(set(x['mandatoryTests']) <= tests,x['fingerprint'])

    def test_visual_source_is_byte_locked(self):
        for _,mpath,m in iter_world_manifests():
            asset=(mpath.parent/m['visual']['url'].replace('./','',1)).resolve()
            self.assertEqual(sha256(asset),m['visual']['sha256'])
            self.assertEqual(m['visual']['sha256'],m['qualityLock']['visualSha256'])
            self.assertFalse(m['quality']['visualDecimationAllowed'])
            self.assertFalse(m['quality']['textureDownscaleAllowed'])
            self.assertFalse(m['quality']['visualRecompressionAllowed'])

    def test_jump_and_camera_invariants_are_hardcoded_in_shared_runtime(self):
        p=(ROOT/'src/player-controller.js').read_text(encoding='utf-8')
        self.assertIn('this.velocity.y = this.config.jumpSpeed',p)
        self.assertIn('this.camera.rotation.set(this.pitch, this.yaw, 0)',p)
        self.assertIn("const maxPitch = THREE.MathUtils.degToRad(89)",p)
        self.assertIn('this.bodyYaw = Math.atan2(desired.x, -desired.z)',p)
        self.assertIn('getActionFrame()',p)

    def test_performance_governor_cannot_degrade_world_assets(self):
        p=(ROOT/'src/performance-governor.js').read_text(encoding='utf-8')
        banned=['geometry.attributes.position','material.map.image','texture.image','simplify','decimate','setPixelRatio']
        for term in banned: self.assertNotIn(term,p)
        self.assertIn('visualSourceChanged:false',p)

    def test_auto_collider_algorithm_on_synthetic_environment(self):
        # floor + two walls + step: validates the non-destructive proxy builder itself.
        rng=np.random.default_rng(2)
        n=18000
        floor=np.column_stack([rng.uniform(-5,5,n),np.zeros(n),rng.uniform(-5,5,n)])
        wall1=np.column_stack([np.full(n//3,-5.0),rng.uniform(0,3,n//3),rng.uniform(-5,5,n//3)])
        wall2=np.column_stack([rng.uniform(-5,5,n//3),rng.uniform(0,3,n//3),np.full(n//3,5.0)])
        step=np.column_stack([rng.uniform(-1,1,n//4),np.full(n//4,0.30),rng.uniform(-1,1,n//4)])
        pts=np.vstack([floor,wall1,wall2,step]).astype(np.float32)
        with tempfile.TemporaryDirectory() as td:
            out=Path(td)/'proxy.ply'
            stats=build_proxy_from_points(pts,out,max_faces=50000,longest_cells=80)
            self.assertTrue(out.exists())
            self.assertLessEqual(stats['faces'],50000)
            self.assertGreater(stats['faces'],100)


    def test_lossless_streaming_preserves_every_face(self):
        # Colored grid mesh split into chunks; exact face conservation is the anti-degradation invariant.
        x=np.linspace(-4,4,36); z=np.linspace(-4,4,36)
        xv,zv=np.meshgrid(x,z,indexing='ij'); verts=np.column_stack([xv.ravel(),np.zeros(xv.size),zv.ravel()])
        faces=[]
        n=len(z)
        for i in range(len(x)-1):
            for j in range(len(z)-1):
                a=i*n+j;b=(i+1)*n+j;c=(i+1)*n+j+1;d=i*n+j+1;faces.extend([[a,b,c],[a,c,d]])
        mesh=trimesh.Trimesh(vertices=verts,faces=np.asarray(faces),process=False)
        with tempfile.TemporaryDirectory() as td:
            src=Path(td)/'world.ply'; mesh.export(src,file_type='ply',encoding='binary_little_endian')
            cfg=build_ply_chunks(src,Path(td)/'chunks','Y',1.0,target_faces=500,max_chunks=16)
            self.assertEqual(cfg['sourceFaces'],cfg['chunkFaces'])
            self.assertTrue(cfg['lossless'])
            self.assertGreater(len(cfg['chunks']),1)

    def test_navigation_graph_is_generated(self):
        # A triangulated walkable plane must produce connected nav nodes/edges.
        x=np.linspace(-4,4,28); z=np.linspace(-4,4,28); xv,zv=np.meshgrid(x,z,indexing='ij')
        verts=np.column_stack([xv.ravel(),np.zeros(xv.size),zv.ravel()]); faces=[]; n=len(z)
        for i in range(len(x)-1):
            for j in range(len(z)-1):
                a=i*n+j;b=(i+1)*n+j;c=(i+1)*n+j+1;d=i*n+j+1
                faces.extend([[a,c,b],[a,d,c]])  # +Y winding
        mesh=trimesh.Trimesh(vertices=verts,faces=np.asarray(faces),process=False)
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/'floor.ply'; mesh.export(p,file_type='ply',encoding='binary_little_endian')
            nav=build_navgraph(p,'Y',1.0,cell_size=0.7,max_nodes=2000)
            self.assertGreater(nav['stats']['nodes'],0)
            self.assertGreater(nav['stats']['edges'],0)

    def test_shared_runtime_no_world_specific_controller_copy(self):
        self.assertEqual(list((ROOT/'worlds').glob('*/src/player-controller.js')),[])


    def test_v7_atmosphere_proximity_wetness_and_fps_are_global_defaults(self):
        standards=read_json(ROOT/'quality/standards.json',{})
        self.assertEqual(standards['id'],'WORLD_FACTORY_QUALITY_CORE_V10')
        self.assertTrue(standards['graphics']['proximityQuality']['enabled'])
        self.assertTrue(standards['graphics']['proximityQuality']['sourceGeometryNeverSimplified'])
        self.assertTrue(standards['graphics']['atmosphere']['enabled'])
        wet=standards['materials']['globalWetLook']
        self.assertTrue(wet['enabled']); self.assertTrue(wet['runtimeOnly'])
        self.assertGreaterEqual(wet['intensity'],0.05); self.assertLessEqual(wet['intensity'],0.25)
        for _,_,m in iter_world_manifests():
            self.assertTrue(m['graphics']['proximityQuality']['enabled'])
            self.assertTrue(m['graphics']['atmosphere']['enabled'])
            self.assertTrue(m['materials']['wetSurface']['enabled'])
            self.assertTrue(m['materials']['wetSurface']['runtimeOnly'])

    def test_baked_lighting_is_locked_to_visual_source(self):
        for _,mpath,m in iter_world_manifests():
            if m['visual']['type']!='ply-mesh': continue
            b=m['lightingBake']; self.assertTrue(b['enabled']); self.assertTrue(b['verified'])
            desc=(mpath.parent/b['descriptorUrl'].replace('./','',1)).resolve()
            d=read_json(desc,{})
            self.assertEqual(d['sourceSha256'],m['visual']['sha256'])
            self.assertFalse(d['sourceAssetModified'])
            binary=(desc.parent/d['binaryUrl'].replace('./','',1)).resolve()
            self.assertEqual(sha256(binary),d['binarySha256'])
            self.assertEqual(binary.stat().st_size,d['sourceVertices']*4)
            self.assertEqual(d['sourceVertices'],m['visual']['sourceStats']['vertices'])

    def test_distance_optimization_never_simplifies_source_assets(self):
        p=(ROOT/'src/proximity-quality.js').read_text(encoding='utf-8')
        banned=['geometry.dispose','geometry.setAttribute','material.map.image','texture.image','decimate','simplify']
        for term in banned: self.assertNotIn(term,p)
        self.assertIn('sourceGeometryChanged:false',p)
        a=(ROOT/'src/atmosphere-quality.js').read_text(encoding='utf-8')
        self.assertIn('sourceAssetsModified:false',a)

    def test_quality_genome_and_runtime_hash_propagation(self):
        genome=read_json(ROOT/'quality/knowledge/quality-genome.json',{})
        self.assertEqual(genome['id'],'WORLD_QUALITY_GENOME_V10')
        mandatory=[x for x in genome['traits'] if str(x['state']).startswith('mandatory')]
        self.assertGreaterEqual(len(mandatory),8)
        from propagate_to_consumers import runtime_hash
        h=runtime_hash(); self.assertEqual(len(h),64); int(h,16)

    def test_error_immunity_contracts_compile(self):
        from error_immunity import compile_contracts
        contracts=compile_contracts()
        inc=read_json(ROOT/'quality/knowledge/incidents.json',{})['incidents']
        self.assertEqual(len(contracts),len(inc))
        protected=[c for c in contracts if c['status']=='protected']
        self.assertTrue(protected)
        self.assertTrue(all(c['mustNeverRecur'] for c in protected))

    def test_fog_culling_only_happens_behind_opaque_fog(self):
        p=(ROOT/'src/proximity-quality.js').read_text(encoding='utf-8')
        self.assertIn('fullyFogHidden',p)
        self.assertIn('(d-r)>(this.fogFar+this.fogCullMargin)',p)
        self.assertIn('sourceGeometryChanged:false',p)
        self.assertIn('sourceTexturesChanged:false',p)

    def test_global_wetness_has_post_fallback_for_custom_renderers(self):
        w=(ROOT/'src/wet-surface-system.js').read_text(encoding='utf-8')
        a=(ROOT/'src/atmosphere-quality.js').read_text(encoding='utf-8')
        self.assertIn('__qualityWetPostFallback',w)
        self.assertIn('postFallbackForUnsupported:true',w)
        self.assertIn('uWetIntensity',a)
        self.assertIn('globalWetPostFallback',a)

    def test_rollout_is_transactional_and_failed_source_never_propagates(self):
        flow=(ROOT/'.github/workflows/quality-learning.yml').read_text(encoding='utf-8')
        self.assertIn("workflow_run.conclusion == 'success'",flow)
        self.assertIn('quality_rollout.py --repo . --mode promote',flow)
        rollout=(ROOT/'tools/quality_rollout.py').read_text(encoding='utf-8')
        self.assertIn('restore_latest',rollout)
        self.assertIn("status':'rolled-back'",rollout)

    def test_unknown_error_quarantine_and_cross_project_promotion_exist(self):
        learn=(ROOT/'tools/learn_from_reports.py').read_text(encoding='utf-8')
        self.assertIn('releaseBlockedUntil',learn)
        self.assertIn('minimumWorlds', (ROOT/'quality/knowledge/patterns.json').read_text(encoding='utf-8'))
        quarantine=read_json(ROOT/'quality/knowledge/quarantine.json',{})
        self.assertEqual(quarantine.get('items'),[])

    def test_cross_project_pack_sync_verify_and_rollback(self):
        from propagate_to_consumers import sync_marker, restore_latest
        from verify_consumers import verify
        with tempfile.TemporaryDirectory() as td:
            base=Path(td)
            markers=[]
            for name in ('game-a','game-b'):
                d=base/name; d.mkdir()
                marker=d/'.world-quality-consumer.json'
                marker.write_text(json.dumps({'project':name,'mode':'shared-runtime','runtime':'WORLD_FACTORY_QUALITY_CORE_V10','inheritQualityGenome':True}),encoding='utf-8')
                markers.append(marker)
                sync_marker(marker)
            self.assertEqual(verify(markers),[])
            lock=markers[0].parent/'.world-quality/quality-pack.lock.json'
            old=json.loads(lock.read_text(encoding='utf-8')); old['sentinel']='previous-good'; lock.write_text(json.dumps(old),encoding='utf-8')
            sync_marker(markers[0],backup=True)
            self.assertNotIn('sentinel',json.loads(lock.read_text(encoding='utf-8')))
            restored=restore_latest(markers[0]); self.assertTrue(restored['restored'])
            self.assertEqual(json.loads(lock.read_text(encoding='utf-8')).get('sentinel'),'previous-good')


    def test_dynamic_environment_runtime_is_shared_and_source_safe(self):
        p=(ROOT/'src/dynamic-environment.js').read_text(encoding='utf-8')
        self.assertIn('kinematicCarry:true',p)
        self.assertIn('waterBuoyancy:true',p)
        self.assertIn('sourceAssetsModified:false',p)
        player=(ROOT/'src/player-controller.js').read_text(encoding='utf-8')
        self.assertIn('applyExternalDisplacement',player)
        for _,_,m in iter_world_manifests():
            self.assertEqual(m.get('environment',{}).get('runtime'),'dynamic-environment-v2')
            self.assertTrue(m.get('environment',{}).get('sourceAssetsImmutable'))


    def test_v7_near_field_fps_optimizer_is_lossless(self):
        p=(ROOT/'src/fps-quality-optimizer.js').read_text(encoding='utf-8')
        self.assertIn('nearFieldQualityReduced:false',p)
        self.assertIn('pixelRatioReduced:false',p)
        self.assertIn('sourceGeometryChanged:false',p)
        self.assertIn('sourceTexturesChanged:false',p)
        banned=['setPixelRatio(','decimate','simplifyGeometry','texture.image =','material.map.image =']
        for term in banned:self.assertNotIn(term,p)
        sched=(ROOT/'src/adaptive-tick-scheduler.js').read_text(encoding='utf-8')
        self.assertIn('playerPhysicsThrottled:false',sched)
        self.assertIn('nearFieldFullRate:true',sched)
        for _,_,m in iter_world_manifests():
            o=m['graphics']['fpsOptimization'];self.assertTrue(o['enabled']);self.assertTrue(o['forbidDynamicResolution']);self.assertTrue(o['forbidNearFieldFidelityReduction'])

    def test_native_spz_legacy_position_decoder_exact(self):
        import gzip, struct
        from spz_native_decoder import decode_all_positions
        frac=12
        points=np.array([[1.25,-2.5,3.75],[-4.0,0.5,8.125]],dtype=np.float32)
        ints=np.rint(points*(1<<frac)).astype(np.int32)
        raw=bytearray()
        for row in ints:
            for v in row:
                u=int(v)&0xffffff;raw.extend((u&255,(u>>8)&255,(u>>16)&255))
        header=struct.pack('<III4B',0x5053474E,3,len(points),0,frac,1,0)
        with tempfile.TemporaryDirectory() as td:
            path=Path(td)/'t.spz'
            with gzip.open(path,'wb') as f:f.write(header);f.write(raw)
            got,h=decode_all_positions(path)
            self.assertEqual(h.version,3);self.assertTrue(np.allclose(got,points,atol=1/(1<<frac)))

    def test_lossless_glb_chunker_conserves_faces(self):
        from build_glb_chunks import build_glb_chunks
        with tempfile.TemporaryDirectory() as td:
            td=Path(td);sc=trimesh.Scene()
            for i in range(5):
                mesh=trimesh.creation.box(extents=[1,1,1]);sc.add_geometry(mesh,node_name=f'b{i}',transform=trimesh.transformations.translation_matrix([i*2.5,0,0]))
            src=td/'world.glb';src.write_bytes(trimesh.exchange.gltf.export_glb(sc))
            r=build_glb_chunks(src,td/'chunks',target_faces=12,max_chunks=12)
            self.assertTrue(r['lossless']);self.assertEqual(r['sourceFaces'],r['chunkFaces']);self.assertGreater(len(r['chunks']),1);self.assertFalse(r['sourceAssetModified'])

    def test_glb_uv_lightmap_is_companion_not_source_rewrite(self):
        from bake_glb_lightmaps import bake
        with tempfile.TemporaryDirectory() as td:
            td=Path(td)
            v=np.array([[-1,0,-1],[1,0,-1],[1,0,1],[-1,0,1]],float);f=np.array([[0,2,1],[0,3,2]])
            mesh=trimesh.Trimesh(v,f,process=False);mesh.visual=trimesh.visual.texture.TextureVisuals(uv=np.array([[0,0],[1,0],[1,1],[0,1]],float))
            src=td/'uv.glb';src.write_bytes(trimesh.exchange.gltf.export_glb(trimesh.Scene(mesh),include_normals=True));before=sha256(src)
            d=bake(src,td/'lighting',64)
            self.assertEqual(d['mode'],'uv-lightmap-glb-v1');self.assertTrue(d['entries']);self.assertEqual(sha256(src),before);self.assertFalse(d['sourceAssetModified'])

    def test_compiled_protection_pack_covers_every_incident(self):
        from compile_protection_pack import compile_pack
        p=compile_pack();inc=read_json(ROOT/'quality/knowledge/incidents.json',{})['incidents']
        self.assertFalse(p['errors']);self.assertEqual(len(p['protectedIncidents']),len(inc));self.assertEqual(len(p['protectionHash']),64)

    def test_dynamic_environment_has_side_collision_contract(self):
        dyn=(ROOT/'src/dynamic-environment.js').read_text(encoding='utf-8');player=(ROOT/'src/player-controller.js').read_text(encoding='utf-8')
        self.assertIn('dynamicSideCollision:true',dyn);self.assertIn('setDynamicColliders',player);self.assertIn('_resolveDynamicCollisions',player)

    def test_v7_gpu_occlusion_never_culls_near_field(self):
        p=(ROOT/'src/gpu-occlusion-manager.js').read_text(encoding='utf-8')
        self.assertIn('d<this.nearRadius',p)
        self.assertIn('nearFieldNeverOcclusionCulled:true',p)
        self.assertIn('sourceQualityReduced:false',p)
        for _,_,m in iter_world_manifests():
            cfg=m['graphics']['gpuVisibility'];self.assertTrue(cfg['enabled']);self.assertGreaterEqual(cfg['nearBypassRadius'],32)

    def test_v7_immutable_cache_and_bvh_cache_are_hash_bound(self):
        a=(ROOT/'src/asset-cache.js').read_text(encoding='utf-8')
        self.assertIn("crypto.subtle.digest('SHA-256'",a);self.assertIn('Immutable asset SHA mismatch',a)
        b=(ROOT/'src/bvh-cache.js').read_text(encoding='utf-8')
        self.assertIn('MeshBVH.serialize',b);self.assertIn('MeshBVH.deserialize',b)
        w=(ROOT/'src/world-loader.js').read_text(encoding='utf-8')
        self.assertIn('collisionKey=manifest.collision?.sha256||manifest.visual?.sha256',w)

    def test_v7_worker_ply_loader_has_safe_fallback(self):
        w=(ROOT/'src/world-loader.js').read_text(encoding='utf-8')
        self.assertIn('loadPlyInWorker',w);self.assertIn('PLY worker fallback',w);self.assertIn('plyLoader.loadAsync',w)
        worker=(ROOT/'src/workers/ply-decode-worker.js').read_text(encoding='utf-8')
        self.assertIn("binary_little_endian",worker);self.assertIn('vertex_indices',worker)

    def test_v7_meshlet_descriptor_conserves_source_triangles(self):
        from build_meshlets import build
        with tempfile.TemporaryDirectory() as td:
            td=Path(td);m=trimesh.creation.icosphere(subdivisions=2);src=td/'m.ply';m.export(src,file_type='ply',encoding='binary_little_endian')
            d=build(src,td/'meshlets.json',max_tris=32)
            self.assertTrue(d['faceConservation']);self.assertEqual(d['sourceTriangles'],d['meshletTriangles']);self.assertEqual(sum(x['triangleCount'] for x in d['meshlets']),len(m.faces));self.assertEqual(sha256(src),d['sourceSha256'])
        for _,mpath,m in iter_world_manifests():
            if m['visual']['type'] not in ('ply-mesh','glb'):continue
            md=m['graphics']['meshlets'];self.assertTrue(md['faceConservation']);self.assertEqual(md['sourceTriangles'],md['meshletTriangles']);self.assertEqual(md['sourceSha256'],m['visual']['sha256'])

    def test_v7_exact_material_dedup_and_static_probe_are_source_safe(self):
        d=(ROOT/'src/material-deduplicator.js').read_text(encoding='utf-8')
        self.assertIn('exactOnly:true',d);self.assertIn('sourceMaterialsModified:false',d);self.assertIn('qualityNoDedup',d)
        r=(ROOT/'src/reflection-probes.js').read_text(encoding='utf-8')
        self.assertIn('dynamicPerFrameCapture:false',r);self.assertIn('sourceAssetsModified:false',r)

    def test_v7_network_pose_and_shadow_optimizers_keep_near_quality(self):
        n=(ROOT/'src/network-interest-manager.js').read_text(encoding='utf-8');self.assertIn('fullPrecision:d<this.near',n);self.assertIn('sourceQualityReduced:false',n)
        p=(ROOT/'src/distant-pose-sharing.js').read_text(encoding='utf-8');self.assertIn('if(d<this.shareRadius)continue',p);self.assertIn('nearCharactersUntouched:true',p)
        sh=(ROOT/'src/static-shadow-cache.js').read_text(encoding='utf-8');self.assertIn('this.dynamicCasters===0',sh);self.assertIn('onlyWhenNoDynamicShadowCasters:true',sh)

    def test_v7_optimization_promotion_requires_zero_quality_regression(self):
        patterns=read_json(ROOT/'quality/knowledge/patterns.json',{})
        pol=patterns['promotionPolicy'];self.assertTrue(pol['requireZeroVisualRegression']);self.assertTrue(pol['requireZeroSourceRegression']);self.assertTrue(pol['requireRollbackDrill'])
        genome=read_json(ROOT/'quality/knowledge/quality-genome.json',{})
        self.assertTrue(any(t['id']=='optimization-promotion-zero-quality-regression' and t['state']=='mandatory' for t in genome['traits']))


    def test_v7_compiled_wasm_simd_executes_with_numeric_parity(self):
        import subprocess
        wasm=ROOT/'src/wasm/quality-simd.wasm'
        self.assertTrue(wasm.is_file());self.assertGreater(wasm.stat().st_size,500)
        r=subprocess.run(['node','tools/verify_wasm_simd.mjs'],cwd=ROOT,text=True,capture_output=True)
        self.assertEqual(r.returncode,0,r.stdout+r.stderr)
        self.assertIn('\"pass\":true',r.stdout)

    def test_v7_webgpu_hzb_is_conservative_and_fail_visible(self):
        p=(ROOT/'src/webgpu-hzb-visibility.js').read_text(encoding='utf-8')
        self.assertIn("mode:'webgpu-private-depth-hzb-v1'",p)
        self.assertIn("failureMode:'all-visible-safe-fallback'",p)
        self.assertIn('nearFieldNeverCulled:true',p)
        self.assertIn('actualSourceTrianglesRasterized:true',p)
        self.assertIn('farthestOccluder<0.9995',p)
        for _,_,m in iter_world_manifests():
            c=m['graphics']['webgpuVisibility'];self.assertTrue(c['failVisible']);self.assertGreaterEqual(c['nearBypassRadius'],42)

    def test_v7_webgpu_indirect_meshlets_never_rewrite_source_ranges(self):
        p=(ROOT/'src/webgpu-meshlet-indirect.js').read_text(encoding='utf-8')
        self.assertIn('drawIndexedIndirect',p);self.assertIn('sourceIndexBufferRewritten:false',p)
        self.assertIn('firstTriangle*3u',p)
        for _,_,m in iter_world_manifests():
            if m['visual']['type'] in ('ply-mesh','glb'):
                x=m['graphics']['meshlets'];self.assertEqual(x['sourceTriangles'],x['meshletTriangles'])

    def test_v7_offline_gi_companion_is_source_sha_locked(self):
        from bake_offline_gi import bake
        with tempfile.TemporaryDirectory() as td:
            td=Path(td);mesh=trimesh.creation.box(extents=[2,1,2]);src=td/'box.ply';mesh.export(src,file_type='ply',encoding='binary_little_endian');before=sha256(src)
            d=bake(src,td/'gi','Y',grid=18,rays=4,max_steps=12,bounces=1)
            self.assertEqual(d['mode'],'voxel-raytraced-gi-ply-v1');self.assertEqual(d['sourceSha256'],before);self.assertEqual(sha256(src),before);self.assertFalse(d['sourceAssetModified'])
            self.assertEqual((td/'gi/gi-vertex.bin').stat().st_size,len(mesh.vertices)*4)

    def test_v7_offline_reflection_probe_is_source_sha_locked(self):
        from bake_reflection_probes import bake
        with tempfile.TemporaryDirectory() as td:
            td=Path(td);mesh=trimesh.creation.box(extents=[2,2,2]);src=td/'box.ply';mesh.export(src,file_type='ply',encoding='binary_little_endian');before=sha256(src)
            d=bake(src,td/'probe',[[0,0,0]],resolution=6,grid=18,max_steps=8,up_axis='Y')
            self.assertEqual(d['mode'],'offline-voxel-raytraced-cubemap-v1');self.assertEqual(d['sourceSha256'],before);self.assertEqual(sha256(src),before)
            self.assertEqual(len(d['probes'][0]['faces']),6)
            self.assertTrue(all((td/'probe'/x.replace('./','')).is_file() for x in d['probes'][0]['faces']))

    def test_v7_animated_glb_range_plan_is_byte_identical(self):
        from build_animated_glb_stream_plan import build
        with tempfile.TemporaryDirectory() as td:
            td=Path(td);sc=trimesh.Scene(trimesh.creation.box());src=td/'a.glb';src.write_bytes(trimesh.exchange.gltf.export_glb(sc));before=sha256(src)
            d=build(src,td/'range.json',segment_bytes=127)
            self.assertTrue(d['byteConservation']);self.assertEqual(d['sourceBytes'],d['coverageBytes']);self.assertEqual(d['sourceSha256'],before);self.assertEqual(sha256(src),before)
            cursor=0
            for seg in d['segments']:
                self.assertEqual(seg['start'],cursor);cursor=seg['end']+1
            self.assertEqual(cursor,d['sourceBytes'])

    def test_v7_dynamic_mesh_collision_uses_continuous_relative_sweep(self):
        d=(ROOT/'src/dynamic-swept-collision.js').read_text(encoding='utf-8')
        p=(ROOT/'src/player-controller.js').read_text(encoding='utf-8')
        e=(ROOT/'src/dynamic-environment.js').read_text(encoding='utf-8')
        self.assertIn('sweepPlayerAgainstDynamicMesh',d);self.assertIn("kind:'mesh-bvh'",d);self.assertIn('Math.min(32',d)
        self.assertIn('sweepPlayerAgainstDynamicMesh',p);self.assertIn('buildDynamicMeshCollider',e)

    def test_v7_production_fingerprint_is_global_and_quarantine_driven(self):
        api=(ROOT/'api/quality-telemetry.js').read_text(encoding='utf-8')
        imp=(ROOT/'tools/import_production_telemetry.py').read_text(encoding='utf-8')
        self.assertIn('deliberately excludes project/world',api);self.assertIn('protectedRecurrences',api);self.assertIn('releaseBlock',api)
        self.assertIn('QUARANTINE_PRODUCTION_INCIDENT',imp);self.assertIn('BLOCK_RELEASE_PROTECTED_PRODUCTION_RECURRENCE',imp)

    def test_v7_known_antipattern_self_heal_is_transactional(self):
        from self_heal_protected_errors import heal
        r=heal(False);self.assertTrue(r['pass']);self.assertTrue(r['transactional']);self.assertTrue(r['rollbackOnFailure'])
        src=(ROOT/'tools/self_heal_protected_errors.py').read_text(encoding='utf-8')
        self.assertIn('repair-backups',src);self.assertIn('rolled-back-tests-failed',src)

    def test_v7_global_standards_bind_new_fastpaths_to_error_immunity(self):
        s=read_json(ROOT/'quality/standards.json',{})
        self.assertTrue(s['graphics']['fpsOptimization']['wasmSimd']);self.assertTrue(s['graphics']['webgpuVisibility']['failVisible'])
        self.assertEqual(s['graphics']['meshlets']['gpuIndirectDrawPath'],'webgpu-compute-generated-drawIndexedIndirect-v1')
        self.assertTrue(s['dynamicEnvironment']['movingBodyContinuousSweep'])
        gates=set(s['qualityGates'])
        self.assertTrue({'webgpu-hzb-conservative-fail-visible','wasm-simd-numerical-parity','animated-glb-byte-conservation','production-telemetry-quarantine'} <= gates)

    def test_v7_source_equivalent_webgpu_pbr_is_fail_closed(self):
        p=(ROOT/'src/webgpu-pbr-renderer.js').read_text(encoding='utf-8')
        self.assertIn("webgpu-source-equivalent-pbr-v1",p)
        self.assertIn('lossyFallbackAllowed:false',p)
        self.assertIn('sourceGeometryExact:true',p)
        self.assertIn('sourceTextureDimensionsPreserved:true',p)
        for semantic in ('baseColor','normal','metallicRoughness','occlusion','emissive'):
            self.assertIn(semantic,p)
        s=read_json(ROOT/'quality/standards.json',{})
        self.assertFalse(s['graphics']['webgpuPbr']['lossyFallbackAllowed'])

    def test_v7_threaded_wasm_simd_has_deterministic_parity(self):
        import subprocess
        r=subprocess.run(['node','tools/verify_wasm_threads.mjs'],cwd=ROOT,text=True,capture_output=True)
        self.assertEqual(r.returncode,0,r.stdout+r.stderr)
        self.assertIn('"pass":true',r.stdout.replace(' ',''))
        pool=(ROOT/'src/wasm-thread-pool.js').read_text(encoding='utf-8')
        self.assertIn('sourceBytesModified:false',pool)
        self.assertIn('nearFieldQualityReduced:false',pool)

    def test_v7_parallel_bvh_prepass_is_exact_and_source_safe(self):
        p=(ROOT/'src/bvh-parallel-prepass.js').read_text(encoding='utf-8')
        self.assertIn('sourceGeometryModified:false',p)
        self.assertIn('triangleCount',p)
        self.assertIn('centroids',p)
        self.assertIn('bounds',p)
        worker=(ROOT/'src/workers/bvh-prepass-worker.js').read_text(encoding='utf-8')
        self.assertIn('Float32Array',worker)

    def test_v7_quality_ratchet_blocks_regression_and_never_lowers_floor(self):
        import quality_ratchet as qr
        with tempfile.TemporaryDirectory() as td:
            q=Path(td)/'ratchet.json'
            q.write_text(json.dumps({'schemaVersion':1,'id':'T','floors':{'sourceFidelity':100.0}}),encoding='utf-8')
            candidate={'sourceFidelity':99.99}
            r=qr.evaluate(candidate,read_json(q,{}))
            self.assertFalse(r['pass'])
            self.assertIn('sourceFidelity',r['regressions'])
        src=(ROOT/'tools/quality_ratchet.py').read_text(encoding='utf-8')
        self.assertIn('neverLower',src)

    def test_v7_quality_graph_links_protected_incidents_to_proofs(self):
        from compile_protection_pack import compile_pack
        from quality_graph import compile_graph
        compile_pack()
        g=compile_graph(ROOT)
        self.assertTrue(g['pass'])
        self.assertGreaterEqual(g['stats']['protectedIncidents'],20)
        self.assertEqual(g['stats']['unprotectedIncidents'],0)

    def test_v7_bake_cache_key_changes_with_source_tool_or_params(self):
        from bake_farm import cache_key
        a=cache_key('a'*64,'b'*64,{'x':1},'v1')
        self.assertEqual(a,cache_key('a'*64,'b'*64,{'x':1},'v1'))
        self.assertNotEqual(a,cache_key('c'*64,'b'*64,{'x':1},'v1'))
        self.assertNotEqual(a,cache_key('a'*64,'d'*64,{'x':1},'v1'))
        self.assertNotEqual(a,cache_key('a'*64,'b'*64,{'x':2},'v1'))
        src=(ROOT/'tools/bake_farm.py').read_text(encoding='utf-8')
        self.assertIn('sourceShaBefore',src);self.assertIn('sourceShaAfter',src)

    def test_v7_representative_canary_selection_is_not_first_n(self):
        from select_canaries import choose
        consumers=[
          {'name':'simple','metadata':{'criticality':1,'worldComplexity':1,'mobileTraffic':0.1,'webgpuTraffic':0.1,'family':'a'}},
          {'name':'mobile','metadata':{'criticality':5,'worldComplexity':3,'mobileTraffic':0.95,'webgpuTraffic':0.2,'family':'b'}},
          {'name':'gpu','metadata':{'criticality':4,'worldComplexity':5,'mobileTraffic':0.2,'webgpuTraffic':0.95,'family':'c'}},
          {'name':'complex','metadata':{'criticality':5,'worldComplexity':5,'mobileTraffic':0.5,'webgpuTraffic':0.5,'family':'d'}},
        ]
        picked=choose(consumers,2)
        names={x['name'] for x in picked}
        self.assertEqual(len(names),2)
        self.assertFalse(names=={'simple','mobile'})

    def test_v7_consumer_drift_is_release_blocking(self):
        src=(ROOT/'tools/consumer_drift_audit.py').read_text(encoding='utf-8')
        self.assertIn('runtimeHash',src);self.assertIn('packHash',src)
        self.assertIn('inheritQualityGenome',src)
        self.assertIn('pass',src)
        rules=read_json(ROOT/'quality/rules.json',{})['rules']
        r=next(x for x in rules if x['id']=='QA-023')
        self.assertIn('drift',r['title'].lower())

    def test_v7_unknown_fix_agent_is_sandboxed_and_proof_obligated(self):
        src=(ROOT/'tools/autonomous_fix_rollout_agent.py').read_text(encoding='utf-8')
        self.assertIn('TemporaryDirectory',src)
        self.assertIn('QUALITY_CODE_EXECUTOR',src)
        self.assertIn('quality_pipeline.py',src)
        self.assertIn('quality_ratchet.py',src)
        self.assertIn('sourceHash',src)
        self.assertIn('--apply',src)

    def test_v7_device_farm_and_neon_evidence_are_real_external_gates(self):
        dev=(ROOT/'tools/device_farm_runner.mjs').read_text(encoding='utf-8')
        self.assertIn('playwright',dev);self.assertIn('device-matrix.json',dev);self.assertIn('WebGPU',dev)
        neon=(ROOT/'migrations/003_quality_autopilot_v7.sql').read_text(encoding='utf-8')
        self.assertIn('quality_pattern_evidence',neon);self.assertIn('quality_project_state',neon)
        api=(ROOT/'api/quality-pattern-evidence.js').read_text(encoding='utf-8')
        self.assertIn('DATABASE_URL',api);self.assertIn('distinct',api.lower())

    def test_v7_global_standards_enable_new_non_degrading_fastpaths(self):
        s=read_json(ROOT/'quality/standards.json',{})
        fps=s['graphics']['fpsOptimization']
        self.assertTrue(fps['wasmSimdThreadPool'])
        self.assertTrue(fps['parallelBvhExactPrepass'])
        self.assertTrue(fps['webgpuSourceEquivalentPbr'])
        gates=set(s['qualityGates'])
        self.assertTrue({'webgpu-pbr-source-equivalence','wasm-simd-threaded-parity','monotonic-quality-ratchet','quality-knowledge-graph-complete','consumer-drift-audit'} <= gates)


    def test_v9_runtime_identity_and_manifest_fastpaths(self):
        standards=read_json(ROOT/'quality/standards.json',{})
        self.assertEqual(standards['id'],'WORLD_FACTORY_QUALITY_CORE_V10')
        self.assertEqual(standards['schemaVersion'],9)
        for _,_,m in iter_world_manifests():
            self.assertEqual(m['quality']['profile'],'WORLD_FACTORY_QUALITY_CORE_V10')
            fps=m['graphics']['fpsOptimization']
            for key in ('sharedArrayBufferDecode','webgpuExactMaterialTable','webgpuClusteredLighting','virtualTextureResidencyFullResolution','portalRoomVisibility','screenSpaceAnimationBudget','physicsSpatialHashBroadphase','losslessNetworkDeltaCompression','ratchetApprovedDeviceSchedules','frameBudgetOrchestrator','persistentDerivedArtifactCas','stutterRegressionGate'):
                self.assertTrue(fps[key],key)

    def test_v9_shared_memory_decode_isolation_and_fallback(self):
        v=read_json(ROOT/'vercel.json',{})
        headers={x['key']:x['value'] for h in v['headers'] for x in h.get('headers',[])}
        self.assertEqual(headers.get('Cross-Origin-Opener-Policy'),'same-origin')
        self.assertEqual(headers.get('Cross-Origin-Embedder-Policy'),'require-corp')
        src=(ROOT/'src/shared-memory-decode.js').read_text()
        worker=(ROOT/'src/workers/ply-decode-worker.js').read_text()
        self.assertIn('SharedArrayBuffer',src);self.assertIn('transferable-arraybuffer-fallback',src)
        self.assertIn('sharedOutput',worker);self.assertIn('SharedArrayBuffer',worker)

    def test_v9_exact_material_table_and_clustered_light_failbright(self):
        mt=(ROOT/'src/webgpu-material-table.js').read_text()
        cl=(ROOT/'src/webgpu-clustered-lighting.js').read_text()
        self.assertIn('sourceTextureDimensionsPreserved:true',mt);self.assertIn('lossyFallbackAllowed:false',mt)
        self.assertIn('full-light-list-fallback',cl);self.assertIn('nearCriticalLightsNeverDropped:true',cl)

    def test_v9_virtual_texture_plan_never_resamples_source(self):
        from build_virtual_texture_plan import build
        with tempfile.TemporaryDirectory() as td:
            td=Path(td);png=td/'x.png'
            # minimal PNG signature + IHDR length/type + 1024x768 dimensions; builder only reads header.
            png.write_bytes(b'\x89PNG\r\n\x1a\n'+b'\x00\x00\x00\rIHDR'+(1024).to_bytes(4,'big')+(768).to_bytes(4,'big'))
            before=sha256(png);d=build(png,256)
            self.assertEqual(d['width'],1024);self.assertEqual(d['height'],768);self.assertFalse(d['resampling']);self.assertFalse(d['recompression']);self.assertEqual(sha256(png),before)
            self.assertTrue(all(p['scale']==1 and p['sourceResolution'] for p in d['pages']))
        vt=(ROOT/'src/virtual-texture-residency.js').read_text();self.assertIn("missingPageFallback:'full-source-texture'",vt)

    def test_v9_portal_builder_is_conservative(self):
        from build_portal_visibility import build
        d=build({'rooms':[{'id':'a'},{'id':'b'}],'portals':[{'a':'a','b':'b','open':True},{'a':'b','b':'missing'}]})
        self.assertEqual(len(d['rooms']),2);self.assertEqual(len(d['portals']),1);self.assertTrue(d['unknownRoomFailVisible']);self.assertFalse(d['sourceGeometryModified'])
        src=(ROOT/'src/portal-visibility.js').read_text();self.assertIn('nearFieldNeverPortalCulled:true',src)

    def test_v9_animation_budget_preserves_near_and_interaction(self):
        s=(ROOT/'src/animation-budget.js').read_text()
        self.assertIn("tier='near'",s);self.assertIn('interactive||tier===\'near\'',s);self.assertIn('e.accum+=dt',s);self.assertIn('interactionBoundaryExact:true',s)

    def test_v9_physics_broadphase_never_sleeps_player_contact(self):
        s=(ROOT/'src/physics-spatial-broadphase.js').read_text()
        self.assertIn("m.playerContact===true",s);self.assertIn('d<=this.nearRadius',s);self.assertIn('nearBodiesNeverSlept:true',s);self.assertIn('collisionGeometryReduced:false',s)

    def test_v9_network_delta_is_lossless_and_unquantized(self):
        s=(ROOT/'src/network-delta-codec.js').read_text()
        self.assertIn('quantized:false',s);self.assertIn('localPlayerAlwaysAuthoritative:true',s);self.assertNotIn('Math.round',s)

    def test_v9_device_schedule_learns_only_safe_knobs(self):
        from learn_device_schedule import propose,SAFE
        samples=[{'fps':42,'targetFps':60,'sourceFidelity':100,'visualScore':100},{'fps':55,'targetFps':60,'sourceFidelity':100,'visualScore':99.9},{'fps':59,'targetFps':60,'sourceFidelity':100,'visualScore':100}]
        d=propose(samples,'mobile-mid')
        self.assertTrue(set(d['knobs'])<=SAFE);self.assertFalse(any('resolution' in k.lower() or 'texture' in k.lower() or 'geometry' in k.lower() for k in d['knobs']))
        with self.assertRaises(RuntimeError):propose([{'fps':60,'targetFps':60,'sourceFidelity':99,'visualScore':100}],'bad')

    def test_v9_derived_cas_is_content_addressed_and_source_safe(self):
        from cas_artifact_cache import put_local,sha256 as cas_sha
        with tempfile.TemporaryDirectory() as td:
            td=Path(td);src=td/'a.bin';src.write_bytes(b'quality-core-v8'*100);before=cas_sha(src)
            r=put_local(src,td/'cas','test')
            self.assertEqual(r['sha256'],before);self.assertEqual(cas_sha(src),before);self.assertTrue(Path(r['path']).is_file())
            r2=put_local(src,td/'cas','test');self.assertEqual(r2['key'],r['key'])

    def test_v9_pattern_applicability_firewall_blocks_blind_scope(self):
        from pattern_applicability_gate import gate
        consumers=[{'name':'a','capabilities':['webgpu'],'tags':['3d']},{'name':'b','capabilities':[],'tags':['2d']}]
        pattern={'state':'candidate','appliesTo':'scoped','requiresCapabilities':['webgpu'],'minimumEvidenceProjects':1}
        r=gate(pattern,[{'project':'a','pass':True,'visualScore':100,'sourceFidelity':100}],consumers)
        self.assertTrue(r['pass']);self.assertEqual(r['eligibleConsumers'],['a']);self.assertTrue(r['blindGlobalPropagationForbidden'])
        r2=gate({**pattern,'minimumEvidenceProjects':2},[{'project':'a','pass':True,'visualScore':100,'sourceFidelity':100}],consumers);self.assertFalse(r2['pass'])

    def test_v9_frame_budget_and_stutter_regression_are_quality_safe(self):
        from stutter_regression import compare
        good=compare([16,16,17,18,20,30],[16,16,17,18,20,30]);self.assertTrue(good['pass'])
        bad=compare([16,16,17,18,20,30],[16,16,17,18,80,120]);self.assertFalse(bad['pass'])
        fb=(ROOT/'src/frame-budget-orchestrator.js').read_text();self.assertIn('nearCriticalNeverDeferred:true',fb);self.assertIn('qualityKnobsTouched:false',fb)

    def test_v9_protection_pack_covers_new_failure_classes(self):
        inc=read_json(ROOT/'quality/knowledge/incidents.json',{})['incidents'];fps={x['fingerprint'] for x in inc}
        expected={'virtual-texture-evicted-near-detail','good-pattern-propagated-to-incompatible-project','device-learning-lowered-graphics','p99-stutter-regressed-after-fps-optimization'}
        self.assertTrue(expected<=fps)
        genome=read_json(ROOT/'quality/knowledge/quality-genome.json',{});self.assertEqual(genome['id'],'WORLD_QUALITY_GENOME_V10')

    def test_v9_performance_evidence_is_durable_and_fidelity_gated(self):
        mig=(ROOT/'migrations/004_quality_performance_v8.sql').read_text(encoding='utf-8')
        api=(ROOT/'api/quality-performance-evidence.js').read_text(encoding='utf-8')
        self.assertIn('quality_performance_evidence',mig)
        self.assertIn('quality_device_schedules',mig)
        self.assertIn('source_fidelity',mig);self.assertIn('near_field_fidelity',mig);self.assertIn('p99_frame_ms',mig)
        self.assertIn("quality-regression-evidence-rejected",api)
        self.assertIn('SAFE_KNOBS',api);self.assertIn('source>=100',api);self.assertIn('near>=100',api)

    def test_v9_optimization_gate_is_fail_closed_and_in_pipeline(self):
        gate=(ROOT/'tools/v8_optimization_gate.py').read_text(encoding='utf-8')
        pipe=(ROOT/'tools/quality_pipeline.py').read_text(encoding='utf-8')
        self.assertIn('REQUIRED_GATES',gate);self.assertIn('source SHA changed',gate)
        self.assertIn('blind pattern propagation is not forbidden',gate)
        self.assertIn('v9-cpu-first-optimization',pipe)


    def test_v9_cpu_first_server_never_requires_paid_gpu(self):
        s=read_json(ROOT/'quality/standards.json',{})
        self.assertEqual(s['id'],'WORLD_FACTORY_QUALITY_CORE_V10')
        self.assertFalse(s['cpuFirst']['serverDiscreteGpuRequired']);self.assertFalse(s['cpuFirst']['paidGpuRequired'])
        self.assertFalse(s['graphics']['fpsOptimization']['serverGpuRequired'])
        src=(ROOT/'src/cpu-first-orchestrator.js').read_text();self.assertIn('serverGpuRequired:false',src);self.assertIn('nearFieldFidelity:100',src)

    def test_v9_incremental_compiler_rebuilds_only_affected_systems(self):
        from incremental_world_compiler import build_plan
        with tempfile.TemporaryDirectory() as td:
            td=Path(td);(td/'a.json').write_text('{}');p1=build_plan(td,{})
            old={'files':p1['files']};(td/'a.json').write_text('{"x":1}');p2=build_plan(td,old)
            self.assertEqual(p2['changed'],['a.json']);self.assertFalse(p2['fullRebuild']);self.assertNotIn('lighting',p2['affectedSystems'])

    def test_v9_pvs_and_cpu_occlusion_are_conservative_near_field(self):
        from pvs_builder import build
        r=build([{'id':'a'},{'id':'b'},{'id':'c'}],[{'a':'a','b':'b'}]);self.assertTrue(r['failVisibleUnknown']);self.assertTrue(r['nearBypass']);self.assertNotIn('c',r['pvs']['a'])
        js=(ROOT/'src/cpu-occlusion-cache.js').read_text();self.assertIn("reason:'near-bypass'",js);self.assertIn('failVisible:true',js)

    def test_v9_predictive_streaming_uses_motion_and_camera_without_quality_loss(self):
        js=(ROOT/'src/predictive-streaming-v2.js').read_text();self.assertIn('velocity.x*this.lookAheadSec',js);self.assertIn('cameraForward',js);self.assertIn('sourceAssetChanged:false',js)

    def test_v9_simulation_lod_keeps_near_exact(self):
        js=(ROOT/'src/simulation-lod.js').read_text();self.assertIn("return 'near'",js);self.assertIn("physicsHz:t==='near'?60",js);self.assertIn('nearQualityReduced:false',js)

    def test_v9_incremental_cpu_light_bake_is_dirty_region_only(self):
        from incremental_light_bake import plan
        r=plan('a'*64,[{'min':[0,0,0],'max':[1,1,1]}]);self.assertTrue(r['dirtyCells']);self.assertFalse(r['rebuildWholeWorld']);self.assertFalse(r['gpuRequired']);self.assertFalse(r['sourceAssetModified'])

    def test_v9_nav_collision_cache_is_source_and_params_locked(self):
        from nav_collision_cache import cache_descriptor
        a=cache_descriptor('a'*64,'nav',{'cell':1});b=cache_descriptor('b'*64,'nav',{'cell':1});c=cache_descriptor('a'*64,'nav',{'cell':2})
        self.assertNotEqual(a['key'],b['key']);self.assertNotEqual(a['key'],c['key']);self.assertTrue(a['immutableSource'])

    def test_v9_cpu_autotuner_rejects_lossy_fidelity_knobs(self):
        from cpu_autotuner import choose
        base={'p99Ms':30,'hitches':3};c=[{'knobs':{'resolution':.5},'sourceFidelity':99,'nearFieldFidelity':99,'visualRegression':True,'p99Ms':10,'hitches':0,'fps':100},{'knobs':{'distantAiHz':2},'sourceFidelity':100,'nearFieldFidelity':100,'visualRegression':False,'p99Ms':25,'hitches':2,'fps':60}]
        r=choose(c,base);self.assertEqual(r['knobs'],{'distantAiHz':2})

    def test_v9_production_replay_is_permanent_and_deterministic(self):
        from deterministic_replay import normalize,fingerprint
        ev=[{'t':0.123456,'type':'move','data':{'x':1}},{'t':1,'type':'jump','data':{}}];a=normalize(ev);b=normalize(ev);self.assertEqual(fingerprint(a),fingerprint(b));self.assertEqual(a[0]['t'],0.1235)

    def test_v9_desktop_ai_must_not_stop_before_all_required_errors_are_fixed(self):
        d=(ROOT/'DESKTOP_AI_INSTRUCTIONS.md').read_text(encoding='utf-8')
        self.assertIn('НЕ ОСТАНАВЛИВАТЬСЯ',d);self.assertIn('пока все обязательные проверки не PASS',d);self.assertIn('external hard blocker',d)

    def test_v9_cpu_gate_is_wired_into_quality_pipeline(self):
        p=(ROOT/'tools/quality_pipeline.py').read_text();self.assertIn('v9-cpu-first-optimization',p);self.assertIn('tools/v9_cpu_first_gate.py',p)


    def test_v10_threaded_importer_pool_is_exact_and_has_fallback(self):
        js=(ROOT/'src/cpu-import-worker-pool.js').read_text(encoding='utf-8')
        self.assertIn('sourceBytesExact:true',js); self.assertIn("fallback:'single-worker-exact-byte-path'",js); self.assertIn('serverGpuRequired:false',js)

    def test_v10_mmap_stream_reader_is_bounded_and_exact(self):
        from streamed_asset_reader import self_test
        r=self_test(); self.assertTrue(r['pass']); self.assertFalse(r['wholeFileLoaded']); self.assertLess(r['maxWindowBytes'],r['bytes'])

    def test_v10_semantic_pvs_fails_visible_for_unknown(self):
        from semantic_pvs_builder import self_test
        r=self_test(); self.assertTrue(r['pass']); self.assertEqual(r['unknownSpacePolicy'],'fail-visible'); self.assertTrue(r['nearFieldBypass'])

    def test_v10_incremental_gi_reuses_only_hash_identical_cells(self):
        from incremental_gi_reuse import self_test
        r=self_test(); self.assertTrue(r['pass']); self.assertEqual(r['reuseCount'],1); self.assertEqual(r['rebuildCount'],2); self.assertTrue(r['reuseRequiresExactInputHash'])

    def test_v10_content_defined_chunking_is_byte_exact(self):
        from content_defined_chunking import self_test
        r=self_test(); self.assertTrue(r['byteExact']); self.assertEqual(r['sourceSha256'],r['reconstructionSha256']); self.assertFalse(r['sourceAssetModified'])

    def test_v10_derived_cache_codec_is_lossless(self):
        from derived_cache_codec import self_test
        r=self_test(); self.assertTrue(r['pass']); self.assertEqual(r['sourceSha256'],r['decodedSha256']); self.assertFalse(r['sourceAssetModified'])

    def test_v10_offline_and_multitab_cache_are_version_sha_isolated(self):
        sw=(ROOT/'sw.js').read_text(encoding='utf-8'); shared=(ROOT/'src/shared-cache-worker.js').read_text(encoding='utf-8')
        self.assertIn("CACHE_PREFIX='world-quality-v10-'",sw); self.assertIn('noImageResample:true',sw); self.assertIn('noMeshRewrite:true',sw)
        self.assertIn('keyIncludesSha256:true',shared); self.assertIn('crossVersionStaleReuse:false',shared)

    def test_v10_cpu_flamegraph_evidence_is_automatic_and_source_safe(self):
        from cpu_flamegraph import capture
        r=capture(); self.assertTrue(r['pass']); self.assertTrue(r['top']); self.assertFalse(r['capturesSourceAssets'])

    def test_v10_network_physics_replay_farm_is_deterministic(self):
        from replay_farm import run_farm
        r=run_farm([7,11,23]); self.assertTrue(r['pass']); self.assertTrue(all(x['deterministic'] for x in r['runs'])); self.assertFalse(r['serverGpuRequired'])

    def test_v10_dependency_graph_propagates_asset_to_game(self):
        from dependency_graph_v10 import build, impacted
        g=build(); self.assertTrue(g['pass']); self.assertTrue(g['failClosedOnMissingDependency']);
        src=next(n['id'] for n in g['nodes'] if n['kind']=='source-asset'); imp=impacted(g,[src]); kinds={n['id']:n['kind'] for n in g['nodes']}; self.assertTrue(any(kinds.get(x)=='game-manifest' for x in imp))

    def test_v10_binary_delta_reconstruction_is_exact(self):
        from binary_delta import self_test
        r=self_test(); self.assertTrue(r['pass']); self.assertTrue(r['exactReconstruction'])

    def test_v10_new_errors_are_protected_and_pipeline_wired(self):
        inc={x['fingerprint'] for x in read_json(ROOT/'quality/knowledge/incidents.json',{})['incidents']}
        expected={'threaded-importer-race-corrupted-asset','huge-world-parser-loaded-whole-file-oom','semantic-pvs-overculled-unknown-space','incremental-gi-reused-dirty-cell','content-defined-chunking-changed-bytes','offline-cache-served-wrong-sha','shared-worker-cache-cross-version-stale','cpu-tuning-without-causality-evidence','replay-farm-nondeterministic-network-physics','dependency-impact-missed-required-rebuild','derived-cache-compression-changed-bytes','binary-delta-reconstruction-mismatch'}
        self.assertTrue(expected<=inc)
        pipe=(ROOT/'tools/quality_pipeline.py').read_text(encoding='utf-8'); self.assertIn('v10-cpu-quality',pipe); self.assertIn('dependency-impact-graph',pipe)

    def test_v10_desktop_ai_no_stop_rule_remains_mandatory(self):
        d=(ROOT/'DESKTOP_AI_INSTRUCTIONS.md').read_text(encoding='utf-8')
        self.assertIn('НЕ ОСТАНАВЛИВАТЬСЯ',d); self.assertIn('пока все обязательные проверки не PASS',d); self.assertIn('external hard blocker',d)

if __name__=='__main__': unittest.main()
