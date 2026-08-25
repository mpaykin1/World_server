import unittest
from ai3d.mesh_optimizer import normalize_policy


class MeshOptimizerV10PolicyTests(unittest.TestCase):
    def test_v10_defaults_do_not_require_external_optional_systems(self):
        p=normalize_policy({})
        self.assertFalse(p["semanticModelContractV10"]["required"])
        self.assertFalse(p["profilerEvidenceV10"]["required"])
        self.assertFalse(p["robloxVerificationV10"]["required"])
        self.assertTrue(p["evidenceCompletenessV10"]["requireRuntime"])
        self.assertTrue(p["evidenceCompletenessV10"]["requireLongitudinalFleet"])

    def test_v10_external_requirements_propagate_to_evidence_gate(self):
        p=normalize_policy({"semanticModelContractV10":{"required":True},"deviceFarmIntegrityV10":{"required":True},"robloxVerificationV10":{"required":True}})
        self.assertTrue(p["evidenceCompletenessV10"]["requireSemanticModelContract"])
        self.assertTrue(p["evidenceCompletenessV10"]["requireDeviceFarm"])
        self.assertTrue(p["evidenceCompletenessV10"]["requireRobloxStudio"])

    def test_v10_clamps_calibration_safety_values(self):
        p=normalize_policy({"semanticModelContractV10":{"minPrecision":2,"maxExpectedCalibrationError":-1},"fleetDriftV10":{"recentFraction":.9}})
        self.assertEqual(p["semanticModelContractV10"]["minPrecision"],1.0)
        self.assertEqual(p["semanticModelContractV10"]["maxExpectedCalibrationError"],0.0)
        self.assertEqual(p["fleetDriftV10"]["recentFraction"],0.5)

if __name__ == "__main__": unittest.main()
