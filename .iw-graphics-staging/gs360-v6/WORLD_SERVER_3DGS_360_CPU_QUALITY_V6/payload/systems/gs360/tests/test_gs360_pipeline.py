import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PIPELINE = ROOT / "gs360_pipeline.py"
QUALITY_GATE = ROOT / "quality-gate.py"
ARTIFACT_AUDIT = ROOT / "artifact-audit.py"
CAPTURE_COACH = ROOT / "capture-coach.py"
INPUT_QUALITY = ROOT / "input-quality.py"
SYNTHETIC_CONSISTENCY = ROOT / "synthetic-consistency.py"


def make_pano(path: Path, w=640, h=320, phase=0):
    yy, xx = np.meshgrid(np.arange(h), np.arange(w), indexing="ij")
    arr = np.zeros((h, w, 3), dtype=np.uint8)
    arr[..., 0] = ((xx + phase) % 256).astype(np.uint8)
    arr[..., 1] = ((yy * 2) % 256).astype(np.uint8)
    arr[..., 2] = (((xx // 8 + yy // 8) % 2) * 180 + 40).astype(np.uint8)
    Image.fromarray(arr, "RGB").save(path)


class GS360Tests(unittest.TestCase):
    def run_pipe(self, inputs, out, extra=None):
        cmd = [
            sys.executable, str(PIPELINE),
            "--input", *map(str, inputs),
            "--output", str(out),
            "--views", "4", "--width", "96", "--height", "96", "--seed-points", "700",
            "--benchmark-root", str(out / "bench")
        ]
        if extra:
            cmd.extend(extra)
        r = subprocess.run(cmd, text=True, capture_output=True)
        self.assertEqual(r.returncode, 0, msg=r.stderr + "\n" + r.stdout)
        return json.loads(r.stdout.strip().splitlines()[-1])

    def test_approximate_auto_one_panorama(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            p = td / "pano.png"; make_pano(p)
            out = td / "out"
            result = self.run_pipe([p], out)
            self.assertTrue(result["pass"])
            self.assertEqual(result["mode"], "STYLE_FIRST_360")
            self.assertEqual(result["selected_preference"], "approximate")
            manifest = json.loads((out / "GS360_MANIFEST.json").read_text())
            self.assertEqual(manifest["total_frames"], 8)
            self.assertFalse(manifest["quality_contract"]["trained_3dgs"])
            self.assertTrue((out / "game" / "seed_gaussians.ply").is_file())
            self.assertTrue((out / "GS360_EXECUTION_PLAN.json").is_file())
            self.assertIn("estimated_time_human", manifest)

    def test_accurate_manual_multiple_panoramas(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            p1 = td / "pano1.png"; p2 = td / "pano2.png"
            make_pano(p1, phase=0); make_pano(p2, phase=33)
            out = td / "out"
            result = self.run_pipe([p1, p2], out, ["--preference", "accurate", "--pose-estimation", "off"])
            self.assertEqual(result["mode"], "QUALITY_360")
            manifest = json.loads((out / "GS360_MANIFEST.json").read_text())
            self.assertEqual(manifest["selected_preference"], "accurate")
            self.assertEqual(manifest["source_panorama_count"], 2)
            self.assertEqual(manifest["total_frames"], 16)
            self.assertIn("hardware", manifest)

    def test_inspect_only(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            p = td / "pano.png"; make_pano(p)
            r = subprocess.run([sys.executable, str(PIPELINE), "--input", str(p), "--output", str(td / 'o'), "--inspect-only"], text=True, capture_output=True)
            self.assertEqual(r.returncode, 0, msg=r.stderr)
            payload = json.loads(r.stdout)
            self.assertTrue(payload["pass"])
            self.assertIn("hardware", payload)
            self.assertIn("estimated_time_seconds", payload)

    def test_quality_gate_preview_and_accurate_truthfulness(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            p1 = td / "pano1.png"; p2 = td / "pano2.png"
            make_pano(p1); make_pano(p2, phase=17)

            fast = td / "fast"
            self.run_pipe([p1], fast, ["--preference", "approximate"])
            r1 = subprocess.run([sys.executable, str(QUALITY_GATE), "--output", str(fast)], text=True, capture_output=True)
            self.assertEqual(r1.returncode, 0, msg=r1.stderr + r1.stdout)
            q1 = json.loads((fast / "GS360_QUALITY_REPORT.json").read_text())
            self.assertTrue(q1["ready_for_game_preview"])
            self.assertFalse(q1["ready_for_accurate_delivery"])

            accurate = td / "accurate"
            self.run_pipe([p1, p2], accurate, ["--preference", "accurate", "--pose-estimation", "off"])
            r2 = subprocess.run([sys.executable, str(QUALITY_GATE), "--output", str(accurate)], text=True, capture_output=True)
            self.assertEqual(r2.returncode, 0, msg=r2.stderr + r2.stdout)
            q2 = json.loads((accurate / "GS360_QUALITY_REPORT.json").read_text())
            self.assertEqual(q2["status"], "NEEDS_REAL_BACKEND")
            self.assertFalse(q2["ready_for_accurate_delivery"])

    def test_shared_benchmark_registry_is_written(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            p = td / "pano.png"; make_pano(p)
            out = td / "out"
            bench = td / "shared_bench"
            self.run_pipe([p], out, ["--benchmark-root", str(bench)])
            history = bench / ".benchmarks" / "gs360_benchmarks.json"
            self.assertTrue(history.is_file())
            rows = json.loads(history.read_text())
            self.assertGreaterEqual(len(rows), 1)


    def test_artifact_audit_seed_preview(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            p = td / "pano.png"; make_pano(p)
            out = td / "out"
            self.run_pipe([p], out, ["--preference", "approximate"])
            r = subprocess.run([sys.executable, str(ARTIFACT_AUDIT), "--output", str(out)], text=True, capture_output=True)
            self.assertEqual(r.returncode, 0, msg=r.stderr + r.stdout)
            a = json.loads((out / "GS360_ARTIFACT_AUDIT.json").read_text())
            self.assertTrue(a["pass"])
            self.assertGreaterEqual(a["score"], 75)

    def test_capture_coach_single_panorama(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            p = td / "pano.png"; make_pano(p)
            out = td / "out"
            self.run_pipe([p], out)
            r = subprocess.run([sys.executable, str(CAPTURE_COACH), "--output", str(out)], text=True, capture_output=True)
            self.assertEqual(r.returncode, 0, msg=r.stderr + r.stdout)
            c = json.loads((out / "GS360_CAPTURE_PLAN.json").read_text())
            self.assertTrue(c["need_more_capture"])
            self.assertGreaterEqual(len(c["suggestions"]), 3)

    def test_adaptive_accurate_defaults(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            p1 = td / "p1.png"; p2 = td / "p2.png"
            make_pano(p1); make_pano(p2, phase=10)
            r = subprocess.run([sys.executable, str(PIPELINE), "--input", str(p1), str(p2), "--output", str(td / "o"), "--preference", "accurate", "--inspect-only"], text=True, capture_output=True)
            self.assertEqual(r.returncode, 0, msg=r.stderr)
            payload = json.loads(r.stdout)
            self.assertGreaterEqual(payload["adaptive_defaults"]["views"], 16)
            self.assertFalse(payload["adaptive_defaults"]["views_explicit"])


    def test_input_quality_report(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            p = td / "pano.png"; make_pano(p)
            out = td / "out"
            self.run_pipe([p], out)
            r = subprocess.run([sys.executable, str(INPUT_QUALITY), "--output", str(out)], text=True, capture_output=True)
            self.assertEqual(r.returncode, 0, msg=r.stderr + r.stdout)
            iq = json.loads((out / "GS360_INPUT_QUALITY.json").read_text())
            self.assertIn(iq["status"], {"PASS", "WARN", "FAIL"})
            self.assertGreaterEqual(iq["score"], 0)
            self.assertLessEqual(iq["score"], 100)


    def test_synthetic_consistency_report(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            p = td / "pano.png"; make_pano(p)
            out = td / "out"
            self.run_pipe([p], out, ["--preference", "approximate"])
            r = subprocess.run([sys.executable, str(SYNTHETIC_CONSISTENCY), "--output", str(out)], text=True, capture_output=True)
            self.assertIn(r.returncode, (0,2), msg=r.stderr + r.stdout)
            rep = json.loads((out / "GS360_SYNTHETIC_CONSISTENCY.json").read_text())
            self.assertIn(rep["status"], {"PASS", "WARN", "FAIL", "NOT_APPLICABLE"})
            if rep.get("score") is not None:
                self.assertGreaterEqual(rep["score"], 0)
                self.assertLessEqual(rep["score"], 100)

    def test_strict_rejects_non_panorama(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            bad = td / "bad.png"
            Image.new("RGB", (200, 200), (10, 20, 30)).save(bad)
            r = subprocess.run([sys.executable, str(PIPELINE), "--input", str(bad), "--output", str(td / 'o'), "--strict-panorama"], text=True, capture_output=True)
            self.assertEqual(r.returncode, 3)


if __name__ == "__main__":
    unittest.main()
