import tempfile,unittest
from pathlib import Path
from ai3d.error_ledger_v11 import ErrorLedgerV11,blocker_evidence_valid,close_resolved_check_failures,zero_known_fixable_errors_gate

class TestErrorLedgerV11(unittest.TestCase):
    def test_open_failure_blocks_zero_gate(self):
        with tempfile.TemporaryDirectory() as td:
            l=ErrorLedgerV11(Path(td)/"ledger.json")
            fp=l.record_failure(check="unit",category="test",message="boom")
            self.assertFalse(zero_known_fixable_errors_gate(l)["passed"])
            l.mark_fixed(fp,regression_test="tests/test_boom.py",verification={"passed":True})
            self.assertTrue(zero_known_fixable_errors_gate(l)["passed"])
    def test_fixed_requires_regression_and_pass(self):
        with tempfile.TemporaryDirectory() as td:
            l=ErrorLedgerV11(Path(td)/"ledger.json");fp=l.record_failure(check="x",category="t",message="m")
            with self.assertRaises(ValueError):l.mark_fixed(fp,regression_test="",verification={"passed":True})
            with self.assertRaises(ValueError):l.mark_fixed(fp,regression_test="t",verification={"passed":False})
    def test_same_check_pass_closes_previous_failure(self):
        with tempfile.TemporaryDirectory() as td:
            l=ErrorLedgerV11(Path(td)/"ledger.json")
            fp=l.record_failure(check="npm run check",category="verification",message="failed")
            closed=close_resolved_check_failures(l,[{"command":"npm run check","passed":True,"returnCode":0}])
            self.assertIn(fp,closed);self.assertTrue(zero_known_fixable_errors_gate(l)["passed"])
    def test_recurring_error_escalates(self):
        with tempfile.TemporaryDirectory() as td:
            l=ErrorLedgerV11(Path(td)/"ledger.json")
            fp=l.record_failure(check="unit",category="test",message="same failure")
            self.assertEqual(l.data["issues"][fp]["escalationLevel"],"NORMAL_FIX")
            fp=l.record_failure(check="unit",category="test",message="same failure")
            self.assertEqual(l.data["issues"][fp]["escalationLevel"],"ROOT_CAUSE_MODE")
            fp=l.record_failure(check="unit",category="test",message="same failure")
            self.assertTrue(l.data["issues"][fp]["impactScanRequired"])
    def test_external_blocker_must_be_proven(self):
        ok,fail=blocker_evidence_valid({"kind":"permission","observedCommand":"git push","evidenceHash":"abc","detail":"403","codeFixAvailable":False})
        self.assertTrue(ok);self.assertEqual(fail,[])
        ok,_=blocker_evidence_valid({"kind":"permission"});self.assertFalse(ok)
