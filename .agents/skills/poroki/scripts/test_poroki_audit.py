"""Run: python -m unittest discover -s scripts -p 'test_*.py'."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from poroki_audit import inspect_text, is_code


class PorokiAuditTests(unittest.TestCase):
    def test_large_file_boundary(self):
        self.assertFalse(any(x["kind"] == "large-file" for x in inspect_text("x.py", "x\n" * 400)))
        self.assertTrue(any(x["kind"] == "large-file" for x in inspect_text("x.py", "x\n" * 401)))

    def test_import_limit(self):
        text = "".join("import module{}\n".format(i) for i in range(11))
        self.assertEqual(1, sum(x["kind"] == "many-imports" for x in inspect_text("x.py", text)))

    def test_reports_risky_patterns_as_review_only(self):
        text = "eval(input);\nconst x = Math.random();\ntry {} catch (e) {}\n"
        actual = {x["kind"] for x in inspect_text("x.js", text)}
        self.assertTrue({"dynamic-execution", "nondeterministic-input", "empty-catch"} <= actual)

    def test_skips_bundles_and_non_code(self):
        self.assertFalse(is_code(Path("node_modules/lib/index.js")))
        self.assertFalse(is_code(Path("assets/banner.png")))
        self.assertTrue(is_code(Path("shared/world.js")))


if __name__ == "__main__":
    unittest.main()
