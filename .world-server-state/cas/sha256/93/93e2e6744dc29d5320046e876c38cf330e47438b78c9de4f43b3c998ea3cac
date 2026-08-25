import gc,tempfile,unittest,warnings
from pathlib import Path
from ai3d.production_v9 import FleetHistoryV9

class TestSqliteLifecycleV11(unittest.TestCase):
    def test_fleet_history_does_not_leak_sqlite_connections(self):
        with tempfile.TemporaryDirectory() as td, warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter('always', ResourceWarning)
            h=FleetHistoryV9(Path(td)/'fleet.sqlite3')
            h.record([{'executedInTarget':True,'target':'web','hardwareTier':'low','deviceId':'d','sessionId':'s','buildId':'b','passed':True,'avgFps':60,'p95FrameMs':16}])
            self.assertEqual(len(h.rows()),1)
            del h;gc.collect()
            leaks=[w for w in caught if issubclass(w.category,ResourceWarning) and 'database' in str(w.message).lower()]
            self.assertEqual(leaks,[])
