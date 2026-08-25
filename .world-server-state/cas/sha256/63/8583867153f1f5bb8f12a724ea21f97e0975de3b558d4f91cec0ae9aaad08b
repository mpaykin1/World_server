import tempfile,unittest
from pathlib import Path
from ai3d.error_ledger_v11 import ErrorLedgerV11
from ai3d.autofix_actuator_v12 import choose_issue_v12,progress_report_v12

class TestAutofixActuatorV12(unittest.TestCase):
    def test_choose_escalated_issue_first(self):
        with tempfile.TemporaryDirectory() as d:
            l=ErrorLedgerV11(Path(d)/'l.json')
            f1=l.record_failure(check='a',category='x',message='one')
            f2=l.record_failure(check='b',category='x',message='two')
            l.record_failure(check='b',category='x',message='two')
            self.assertEqual(choose_issue_v12(l)['fingerprint'],f2)
    def test_progress_requires_zero(self):
        self.assertFalse(progress_report_v12([{'openAfter':['x'],'checksPassed':True}])['passed'])
