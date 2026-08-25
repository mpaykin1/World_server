import unittest
from ai3d.production_v11 import reproducibility_gate_v11,flaky_test_gate_v11,fault_injection_gate_v11,regression_closure_gate_v11,convergence_gate_v11,quality_confidence_v11

class TestProductionV11(unittest.TestCase):
    def test_reproducibility_ignores_timestamps(self):
        rows=[{"timestamp":i,"result":{"triangles":100,"score":.9}} for i in range(3)]
        self.assertTrue(reproducibility_gate_v11(rows)["passed"])
    def test_reproducibility_detects_drift(self):
        rows=[{"result":{"triangles":100}},{"result":{"triangles":101}},{"result":{"triangles":100}}]
        self.assertFalse(reproducibility_gate_v11(rows)["passed"])
    def test_flaky_gate(self):
        rows=[{"name":"a","passed":True},{"name":"a","passed":False},{"name":"a","passed":True}]
        self.assertEqual(flaky_test_gate_v11(rows)["status"],"FLAKY")
    def test_fault_injection_requires_all(self):
        required=["syntax_error","fake_runtime_evidence"]
        rows=[{"faultClass":"syntax_error","detected":True,"detectorFailedClosed":True},{"faultClass":"fake_runtime_evidence","detected":True,"detectorFailedClosed":True}]
        self.assertTrue(fault_injection_gate_v11(rows,{"requiredFaultClasses":required})["passed"])
    def test_regression_closure_fails_open(self):
        ledger={"issues":{"x":{"fingerprint":"x","status":"OPEN_FIXABLE","fixable":True}}}
        self.assertFalse(regression_closure_gate_v11(ledger)["passed"])
    def test_convergence_requires_zero(self):
        c=convergence_gate_v11(static_checks_passed=True,zero_error_gate={"passed":False},regression_closure={"passed":False},reproducibility={"passed":True},flaky_tests={"passed":True},fault_injection={"passed":True},external_blockers=[])
        self.assertEqual(c["status"],"CONTINUE_FIX_LOOP")
    def test_confidence_is_non_compensating(self):
        q=quality_confidence_v11({"static":1,"zeroErrors":1,"regression":1,"semantic":1,"runtime":0,"deviceFleet":1,"profiler":1,"roblox":1,"pvsCanary":1})
        self.assertFalse(q["passed"]);self.assertLessEqual(q["confidencePercent"],15.01)
