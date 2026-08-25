from __future__ import annotations

import json
import tempfile
import time
import unittest
from pathlib import Path

from ai3d.texture_runtime_v9 import (
    AtomicCdnPublisher,
    CanonicalTileLibrary,
    DeviceLabStore,
    LearnedPrefetchStore,
    MultiHostTextureQueue,
    PromotionLedger,
    analyze_cohort_drift,
    analyze_temporal_shimmer,
    build_atomic_cdn_publisher_plan,
    build_bounded_learned_prefetch_plan,
    build_canonical_tile_library_plan,
    build_device_lab_plan,
    build_shader_cache_prewarm_plan,
    build_unified_governor_adapter_manifest,
    build_v9_system_plan,
)


class TextureV9Tests(unittest.TestCase):
    def test_01_temporal_insufficient_frames_blocks(self):
        r = analyze_temporal_shimmer([{'frame': i, 'shimmerScore': .01} for i in range(4)], min_frames=8)
        self.assertEqual(r['gate'], 'INSUFFICIENT_FRAMES'); self.assertTrue(r['promotionBlocked'])

    def test_02_temporal_pass(self):
        r = analyze_temporal_shimmer([{'frame': i, 'shimmerScore': .01, 'normalVarianceDelta': .01, 'lumaFlicker': .01} for i in range(30)])
        self.assertEqual(r['gate'], 'PASS'); self.assertFalse(r['promotionBlocked'])

    def test_03_temporal_detects_shimmer(self):
        rows = [{'frame': i, 'shimmerScore': .08 if i > 10 else .01, 'normalVarianceDelta': .01, 'lumaFlicker': .01} for i in range(30)]
        r = analyze_temporal_shimmer(rows)
        self.assertEqual(r['gate'], 'FAIL'); self.assertIn('SHIMMER', r['failReasons'])

    def test_04_queue_idempotent_enqueue(self):
        with tempfile.TemporaryDirectory() as td:
            q=MultiHostTextureQueue(Path(td)/'q.db'); a=q.enqueue('x', {'a':1}); b=q.enqueue('x', {'a':1}); self.assertEqual(a,b)

    def test_05_queue_capability_filter(self):
        with tempfile.TemporaryDirectory() as td:
            q=MultiHostTextureQueue(Path(td)/'q.db'); q.enqueue('x', {'requiredCapabilities':['astc']})
            self.assertIsNone(q.lease('h1', capabilities=['bc7']))
            self.assertIsNotNone(q.lease('h2', capabilities=['astc']))

    def test_06_queue_fence_rejects_stale_completion(self):
        with tempfile.TemporaryDirectory() as td:
            q=MultiHostTextureQueue(Path(td)/'q.db'); jid=q.enqueue('x', {})
            lease=q.lease('h1', lease_seconds=10); self.assertEqual(jid, lease['id'])
            self.assertFalse(q.complete(jid, 'h1', lease['fence']+1, {'ok':True}))
            self.assertTrue(q.complete(jid, 'h1', lease['fence'], {'ok':True}))

    def test_07_queue_heartbeat_stats(self):
        with tempfile.TemporaryDirectory() as td:
            q=MultiHostTextureQueue(Path(td)/'q.db'); q.heartbeat('host',['gpu']); self.assertEqual(q.stats()['activeHosts'],1)

    def test_08_queue_dead_letter_after_attempts(self):
        with tempfile.TemporaryDirectory() as td:
            q=MultiHostTextureQueue(Path(td)/'q.db', max_attempts=1); jid=q.enqueue('x', {}); lease=q.lease('h')
            self.assertTrue(q.fail(jid,'h',lease['fence'],'bad')); self.assertEqual(q.stats()['jobs'].get('dead'),1)

    def test_09_shader_prewarm_dedupes(self):
        p=build_shader_cache_prewarm_plan({'variants':[{'name':'a','features':['X']},{'name':'a','features':['X']}]})
        self.assertEqual(p['entryCount'],1)

    def test_10_shader_prewarm_is_bounded(self):
        p=build_shader_cache_prewarm_plan({'variants':[{'name':f's{i}'} for i in range(20)]},max_variants=5)
        self.assertEqual(p['entryCount'],5); self.assertTrue(p['truncated'])

    def test_11_prefetch_store_learns_routes(self):
        with tempfile.TemporaryDirectory() as td:
            s=LearnedPrefetchStore(Path(td)/'p.db'); s.observe_route(['a','b','a','b','c'])
            r=s.predict('a'); self.assertEqual(r[0]['setKey'],'b')

    def test_12_prefetch_plan_network_clamps(self):
        with tempfile.TemporaryDirectory() as td:
            s=LearnedPrefetchStore(Path(td)/'p.db'); s.observe_route(['a','b','a','c','a','d'])
            p=build_bounded_learned_prefetch_plan('a',s,{'bandwidthMbps':2},{'action':'KEEP'},max_candidates=4)
            self.assertLessEqual(p['candidateCount'],1)

    def test_13_prefetch_plan_thermal_clamps(self):
        with tempfile.TemporaryDirectory() as td:
            s=LearnedPrefetchStore(Path(td)/'p.db'); s.observe_route(['a','b','a','c'])
            p=build_bounded_learned_prefetch_plan('a',s,{'bandwidthMbps':100},{'action':'CONSERVE'},max_candidates=4)
            self.assertEqual(p['maxCandidates'],1)

    def test_14_atomic_publisher_content_addressed(self):
        with tempfile.TemporaryDirectory() as td:
            p=AtomicCdnPublisher(td,'0123456789abcdef'); a=p.put_bytes(b'hello'); b=p.put_bytes(b'hello'); self.assertEqual(a['sha256'],b['sha256'])

    def test_15_atomic_publisher_switch_and_verify(self):
        with tempfile.TemporaryDirectory() as td:
            p=AtomicCdnPublisher(td,'0123456789abcdef'); r=p.publish_manifest({'objects':[]},'candidate'); cur=p.current('candidate')
            self.assertTrue(r['atomicSwitch']); self.assertTrue(p.verify(cur))

    def test_16_atomic_plan_blocks_without_secret_root(self):
        p=build_atomic_cdn_publisher_plan({}); self.assertTrue(p['promotionBlocked'])

    def test_17_canonical_library_dedupes_blob(self):
        with tempfile.TemporaryDirectory() as td:
            lib=CanonicalTileLibrary(td); a=lib.add(b'abc',kind='tile',semantic_key='stone',quality=.8); b=lib.add(b'abc',kind='tile',semantic_key='stone',quality=.9)
            self.assertEqual(a,b); self.assertEqual(lib.best('tile','stone')[0]['sha256'],a)

    def test_18_canonical_plan_marks_repeated_family(self):
        p=build_canonical_tile_library_plan([{'setKey':'stone_a'},{'setKey':'stone_b'},{'setKey':'wood_a'}])
        stone=[x for x in p['candidates'] if x['semanticKey']=='stone'][0]; self.assertTrue(stone['eligibleForCanonicalTile'])

    def test_19_device_lab_plan_has_required_classes(self):
        p=build_device_lab_plan({}); self.assertGreaterEqual(p['jobCount'],12); self.assertTrue(p['requiresPhysicalOrTrustedRemoteHardware'])

    def test_20_device_lab_store_summary(self):
        with tempfile.TemporaryDirectory() as td:
            s=DeviceLabStore(Path(td)/'d.db'); s.ingest('r','iphone','mobile',{'p95FrameMs':15,'textureVramMB':100,'gate':'PASS'})
            self.assertEqual(s.summarize('r')['gate'],'PASS')

    def test_21_governor_manifest_has_all_platforms(self):
        p=build_unified_governor_adapter_manifest({'actions':{'textures':'keep'}}); self.assertEqual(set(p['adapters']),{'web','godot','roblox'})

    def test_22_cohort_insufficient_blocks(self):
        r=analyze_cohort_drift([{}]*3,[{}]*3,min_samples=5); self.assertEqual(r['gate'],'INSUFFICIENT_DATA'); self.assertTrue(r['promotionBlocked'])

    def test_23_cohort_detects_frame_drift(self):
        base=[{'p95FrameMs':10,'textureVramMB':100,'cacheHitRate':.9,'residencyReloads':1,'visualDelta':.01} for _ in range(25)]
        cand=[{'p95FrameMs':15,'textureVramMB':100,'cacheHitRate':.9,'residencyReloads':1,'visualDelta':.01} for _ in range(25)]
        r=analyze_cohort_drift(base,cand); self.assertEqual(r['gate'],'FAIL'); self.assertIn('p95FrameMs',r['badMetrics'])

    def test_24_ledger_chain_verifies_and_detects_tamper(self):
        with tempfile.TemporaryDirectory() as td:
            path=Path(td)/'ledger.jsonl'; l=PromotionLedger(path,'0123456789abcdef'); l.append('candidate-built',{'sha':'a'}); l.append('tests-pass',{'n':1}); self.assertTrue(l.verify()['ok'])
            lines=path.read_text().splitlines(); row=json.loads(lines[0]); row['event']='tampered'; lines[0]=json.dumps(row); path.write_text('\n'.join(lines)+'\n')
            self.assertFalse(l.verify()['ok'])

    def test_25_v9_plan_contains_all_ten_systems(self):
        p=build_v9_system_plan([{'setKey':'stone_a'}], {'unifiedQualityGovernor':{'actions':{}}}, {'trimDecal':{}}, {}, {})
        expected={'temporalShimmerGate','multiHostQueue','shaderCachePrewarm','boundedLearnedPrefetch','atomicCdnPublisher','canonicalTileTrimLibrary','deviceLab','unifiedGovernorAdapters','cohortDrift','promotionLedger'}
        self.assertTrue(expected.issubset(p.keys()))

    def test_26_v9_hard_rules_protect_promotion(self):
        p=build_v9_system_plan([],{}, {}, {}, {})
        self.assertTrue(p['hardRules']['promotionLedgerChainMustVerify']); self.assertTrue(p['hardRules']['cdnPromotionRequiresSignedAtomicManifest'])


if __name__ == '__main__':
    unittest.main()
