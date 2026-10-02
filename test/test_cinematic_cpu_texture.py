"""CPU material art-direction regression: no Blender/GPU dependency."""
import importlib.util
import math
import unittest
from pathlib import Path

PATH = Path(__file__).resolve().parents[1] / "scripts/cinematic_cpu/texture_cpu.py"
spec = importlib.util.spec_from_file_location("texture_cpu", PATH)
texture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(texture)


class TextureCpuTests(unittest.TestCase):
    def test_seed_repeatability(self):
        a = texture.sample("concrete", .36, .91, 17, (.3, .32, .36))
        self.assertEqual(a, texture.sample("concrete", .36, .91, 17, (.3, .32, .36)))
        self.assertNotEqual(a, texture.sample("concrete", .37, .91, 17, (.3, .32, .36)))

    def test_color_and_normal_bounds(self):
        for kind, seed in (("steel", 18), ("basalt", 19), ("concrete", 17)):
            for x in range(17):
                for y in range(15):
                    values = texture.sample(kind, (x+.5)/17, (y+.5)/15,
                        seed, (.27, .31, .38))
                    for c in (*values[0], values[1], values[2]):
                        self.assertTrue(math.isfinite(c))
                        self.assertGreaterEqual(c, 0)
                        self.assertLessEqual(c, 1)

    def test_distinct_weathered_materials(self):
        coords = [(.1,.2),(.37,.66),(.81,.77)]
        samples = {k: [texture.field(k,u,v,33) for u,v in coords]
            for k in ("concrete","steel","basalt")}
        self.assertNotEqual(samples["basalt"], samples["steel"])
        self.assertNotEqual(samples["steel"], samples["concrete"])
        self.assertLess(texture.field("steel",.2,.3,33)[2], 1)

    def test_fail_closed_kind(self):
        with self.assertRaisesRegex(ValueError, "unknown texture"):
            texture.field("unsupported", .2, .3, 3)


if __name__ == "__main__":
    unittest.main()
