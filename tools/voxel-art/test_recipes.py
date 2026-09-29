"""Focused pure-Python regression tests for semantic voxel recipes."""
from __future__ import annotations
import sys
import unittest
from pathlib import Path

HERE=Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0,str(HERE))

from recipes_nature import BUILDERS as NATURE
from recipes_built import BUILDERS as BUILT

BUILDERS={**NATURE,**BUILT}


class RecipeTests(unittest.TestCase):
    def test_all_assets_are_deterministic_and_lod_is_monotonic(self):
        for kind,builder in BUILDERS.items():
            with self.subTest(kind=kind):
                a=builder(12345,0); b=builder(12345,0)
                lod1=builder(12345,1); lod2=builder(12345,2)
                self.assertEqual(a.voxels,b.voxels)
                self.assertEqual(
                    [f["id"] for f in a.graph()["features"]],
                    [f["id"] for f in b.graph()["features"]],
                )
                self.assertGreater(len(a.voxels),0)
                self.assertGreaterEqual(len(a.voxels),len(lod1.voxels))
                self.assertGreaterEqual(len(lod1.voxels),len(lod2.voxels))
                self.assertTrue(all(f["id"].startswith(kind+":") for f in a.graph()["features"]))

    def test_different_seeds_produce_bounded_variation(self):
        changed=0
        for kind,builder in BUILDERS.items():
            a,b=builder(111,0),builder(222,0)
            if a.voxels!=b.voxels:
                changed+=1
            ratio=max(len(a.voxels),len(b.voxels))/max(1,min(len(a.voxels),len(b.voxels)))
            self.assertLess(ratio,1.8,kind)
        self.assertGreaterEqual(changed,5)

    def test_volcano_semantic_and_lava_invariants(self):
        v=BUILDERS["volcano"](12345,0)
        required={
            "volcano:crater","volcano:lavaSource","volcano:lavaChannel:00",
            "volcano:lavaCascade:00","volcano:ridge:00","volcano:cliff:00",
            "volcano:ashZone","volcano:valley","volcano:rockField",
            "volcano:safeTerrace:00","volcano:vegetationZone",
        }
        self.assertTrue(required.issubset(v.features))
        lava=set().union(*(f.cells for f in v.features.values() if f.gameplay.get("activeLava")))
        vegetation=set().union(*(f.cells for f in v.features.values() if f.type=="vegetation"))
        self.assertTrue(lava)
        self.assertFalse(lava.intersection(vegetation))
        source=v.features["volcano:lavaSource"]
        self.assertTrue(source.cells)
        for i in range(3):
            self.assertTrue(v.features[f"volcano:lavaChannel:{i:02d}"].cells)
        self.assertGreater(v.stats()["featureCount"],30)
        self.assertGreater(v.stats()["mesoFeatures"],8)
        self.assertGreater(v.stats()["microFeatures"],8)

    def test_feature_ids_stay_stable_across_lods(self):
        for kind,builder in BUILDERS.items():
            high={f["id"] for f in builder(7,0).graph()["features"]}
            medium={f["id"] for f in builder(7,1).graph()["features"]}
            far={f["id"] for f in builder(7,2).graph()["features"]}
            self.assertEqual(high,medium,kind)
            self.assertEqual(medium,far,kind)

    def test_villager_is_parameterized_and_animation_ready(self):
        base=BUILDERS["villager"](31,0,{"role":"resident","height":10,"build":2})
        miner=BUILDERS["villager"](31,0,{"role":"miner","height":12,"build":3})
        self.assertNotEqual(base.voxels,miner.voxels)
        required={"villager:head","villager:face","villager:leftLeg","villager:rightLeg",
                  "villager:leftArm","villager:rightArm","villager:belt","villager:accessory"}
        self.assertTrue(required.issubset(base.features))
        self.assertEqual(miner.params["role"],"miner")
        self.assertEqual(
            miner.meta["preparedClips"],["idle","walk","work","carry","sit"])


if __name__=="__main__":
    unittest.main(verbosity=2)
