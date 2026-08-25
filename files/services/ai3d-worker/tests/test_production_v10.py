import tempfile
import unittest
from pathlib import Path

from ai3d.production_v10 import (
    build_roblox_verification_contract_v10,
    device_farm_integrity_gate_v10,
    evidence_completeness_gate_v10,
    fleet_drift_gate_v10,
    normalize_profiler_evidence_v10,
    pvs_pruning_proof_v10,
    validate_roblox_verification_result_v10,
    validate_semantic_model_contract_v10,
)


class ProductionV10Tests(unittest.TestCase):
    def test_semantic_contract_rejects_unproven_model(self):
        r = validate_semantic_model_contract_v10({"modelSha256": "0" * 64, "modelVersion": "1", "featureSchemaVersion": 9})
        self.assertFalse(r["passed"])
        self.assertIn("precision", r["failures"])

    def test_semantic_contract_verifies_real_hash_and_metrics(self):
        import hashlib
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "model.onnx"; p.write_bytes(b"real-model")
            sha = hashlib.sha256(p.read_bytes()).hexdigest()
            contract = {
                "modelSha256": sha, "modelVersion": "10.1", "featureSchemaVersion": 9,
                "validationDatasetSha256": "1" * 64, "validationSamples": 5000,
                "metrics": {"precision": .96, "recall": .95, "expectedCalibrationError": .03},
                "provenance": {"source": "training_pipeline", "trainingRunId": "train-42"},
            }
            self.assertTrue(validate_semantic_model_contract_v10(contract, p)["passed"])

    def test_profiler_normalization_rejects_synthetic(self):
        r = normalize_profiler_evidence_v10([{"target":"web","executedInTarget":True,"telemetrySource":"webgl_timer_query","evidenceKind":"synthetic","gpuP95FrameMs":10}])
        self.assertFalse(r["passed"])

    def test_profiler_normalization_accepts_measured(self):
        r = normalize_profiler_evidence_v10([{"target":"godot","executedInTarget":True,"telemetrySource":"godot_renderingserver","gpuP95FrameMs":9.2,"vramUsedMB":500}])
        self.assertTrue(r["passed"])
        self.assertEqual(r["normalized"][0]["gpuFrameMsP95"], 9.2)

    def test_device_farm_rejects_duplicates(self):
        row={"providerExecutionId":"p1","deviceId":"d1","sessionId":"s1","target":"web","hardwareTier":"low","executedInTarget":True,"sampleCount":200,"avgFps":60,"p95FrameMs":17,"buildId":"b1"}
        r=device_farm_integrity_gate_v10([row,row])
        self.assertFalse(r["passed"])
        self.assertEqual(len(r["duplicates"]),1)

    def test_drift_gate_detects_fps_regression(self):
        rows=[]
        for i in range(40): rows.append({"executedInTarget":True,"timestampEpoch":i,"avgFps":80,"p95FrameMs":12,"passed":True})
        for i in range(40,60): rows.append({"executedInTarget":True,"timestampEpoch":i,"avgFps":50,"p95FrameMs":19,"passed":True})
        r=fleet_drift_gate_v10(rows,{"minRunsPerWindow":20,"recentFraction":.33})
        self.assertTrue(r["regressionDetected"])

    def test_pvs_proof_requires_diversity(self):
        pvs={"sets":{"A":["A","B"]}}
        cand=[{"room":"A","visibleRoom":"B"}]
        samples=[{"room":"A","sessionId":"s1","buildId":"b1","deviceId":"d1","portalStateHash":"p1","visibleRooms":["A"]} for _ in range(300)]
        self.assertFalse(pvs_pruning_proof_v10(pvs,samples,cand)["passed"])

    def test_pvs_proof_can_be_ready_but_never_auto_applies(self):
        pvs={"sets":{"A":["A","B"]}}; cand=[{"room":"A","visibleRoom":"B"}]
        samples=[]
        for s in range(50):
            for i in range(6):
                samples.append({"room":"A","sessionId":f"s{s}","buildId":f"b{s%3}","deviceId":f"d{s%5}","portalStateHash":f"p{s%3}","visibleRooms":["A"],"timestampEpoch":s*10+i})
        r=pvs_pruning_proof_v10(pvs,samples,cand,{"minHoldoutObservations":250})
        self.assertTrue(r["passed"]); self.assertEqual(r["autoRemovalsApplied"],0)

    def test_roblox_contract_binds_result_to_contract_hash(self):
        with tempfile.TemporaryDirectory() as td:
            c=build_roblox_verification_contract_v10(Path(td),[])
            checks={k:True for k in c["requiredChecks"]}
            result={"marker":c["marker"],"contractSha256":c["contractSha256"],"studioVersion":"x","verificationRunId":"r","placeId":"1","placeChecks":checks,"automation":{"studioLaunched":True,"resultCaptured":True,"commandVerified":True}}
            self.assertTrue(validate_roblox_verification_result_v10(result,c)["passed"])
            result["contractSha256"]="bad"
            self.assertFalse(validate_roblox_verification_result_v10(result,c)["passed"])

    def test_evidence_completeness_does_not_compensate_missing_runtime(self):
        r=evidence_completeness_gate_v10({"fidelity":True},{"passed":True},{"status":"UNVERIFIED"},{"passed":True},{"passed":True},{"passed":True},{"status":"STABLE"},{"passed":True},{"passed":True},{"requireSemanticModelContract":True,"requireProfiler":True,"requireDeviceFarm":True,"requireRobloxStudio":True,"requirePvsPruningProof":True})
        self.assertFalse(r["passed"])
        self.assertEqual(r["status"],"CODE_VERIFIED_RUNTIME_INCOMPLETE")

    def test_evidence_completeness_can_be_complete(self):
        r=evidence_completeness_gate_v10({"fidelity":True,"temporal":True},{"passed":True},{"status":"VERIFIED"},{"passed":True},{"passed":True},{"passed":True},{"status":"STABLE"},{"passed":True},{"passed":True},{"requireSemanticModelContract":True,"requireProfiler":True,"requireDeviceFarm":True,"requireRobloxStudio":True,"requirePvsPruningProof":True})
        self.assertTrue(r["passed"])
        self.assertEqual(r["evidenceCompletenessPercent"],100.0)


if __name__ == "__main__": unittest.main()

class PvsCanaryV10Tests(unittest.TestCase):
    def test_pvs_canary_requires_bound_result_and_all_checks(self):
        from ai3d.production_v10 import build_pvs_canary_plan_v10, validate_pvs_canary_result_v10
        pvs={"sets":{"A":["A","B"]}}
        proof={"proofReadyCandidates":[{"room":"A","visibleRoom":"B"}]}
        plan=build_pvs_canary_plan_v10(pvs,proof)
        checks={k:True for k in plan["requiredChecks"]}
        result={"planSha256":plan["planSha256"],"baselinePvsSha256":plan["baselinePvsSha256"],"canaryRunId":"c1","checks":checks}
        self.assertTrue(validate_pvs_canary_result_v10(result,plan)["passed"])
        result["checks"]["noCameraPopRegression"]=False
        self.assertTrue(validate_pvs_canary_result_v10(result,plan)["rollbackRequired"])
