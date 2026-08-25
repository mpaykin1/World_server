from __future__ import annotations

import unittest

from ai3d.material_profiles import classify_material_name, classify_object, deterministic_variation, profile_for


class MaterialProfileTests(unittest.TestCase):
    def test_common_classes(self):
        self.assertEqual(classify_material_name("old_cobblestone_01"), "stone")
        self.assertEqual(classify_material_name("rusty_iron"), "metal")
        self.assertEqual(classify_material_name("oak_planks"), "wood")
        self.assertEqual(classify_material_name("vitraj_glass"), "glass")

    def test_object_votes_materials(self):
        self.assertEqual(classify_object("mesh01", ["brick_wall", "mortar"]), "brick")

    def test_profile_has_physical_fields(self):
        p = profile_for("metal")
        self.assertGreaterEqual(p["metallic"], 0.9)
        self.assertLess(p["roughness"], 0.5)

    def test_variation_is_deterministic(self):
        self.assertEqual(deterministic_variation("same"), deterministic_variation("same"))
        self.assertNotEqual(deterministic_variation("same"), deterministic_variation("other"))


if __name__ == "__main__":
    unittest.main()
