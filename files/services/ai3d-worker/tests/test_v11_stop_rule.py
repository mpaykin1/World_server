import unittest
from ai3d.production_v11 import convergence_gate_v11

class TestV11StopRule(unittest.TestCase):
    def test_proven_external_is_not_pass(self):
        c=convergence_gate_v11(static_checks_passed=True,zero_error_gate={"passed":True},regression_closure={"passed":True},reproducibility={"passed":True},flaky_tests={"passed":True},fault_injection={"passed":True},external_blockers=[{"kind":"permission"}])
        self.assertFalse(c["passed"]);self.assertEqual(c["status"],"EXTERNALLY_BLOCKED_NOT_CONVERGED")
    def test_all_green_converges(self):
        c=convergence_gate_v11(static_checks_passed=True,zero_error_gate={"passed":True},regression_closure={"passed":True},reproducibility={"passed":True},flaky_tests={"passed":True},fault_injection={"passed":True},external_blockers=[])
        self.assertTrue(c["passed"]);self.assertEqual(c["status"],"CONVERGED_ZERO_KNOWN_ERRORS")
