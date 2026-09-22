import hashlib
import json
import os
import struct
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ai3d.plugins.motion_capture import BONES, MotionCaptureEngine, write_mannequin_glb
from ai3d.validation import verify_video


def frame(t, offset=0.0):
    joints = [[0.0, 0.0, 0.0] for _ in range(33)]
    for i in (11, 12):
        joints[i] = [-0.2 if i == 11 else 0.2, 1.4+offset, 0.0]
    joints[13], joints[14] = [-.4, 1.15+offset, 0], [.4, 1.15+offset, 0]
    joints[15], joints[16] = [-.5, .95+offset, 0], [.5, .95+offset, 0]
    joints[23], joints[24] = [-.15, .95+offset, 0], [.15, .95+offset, 0]
    joints[25], joints[26] = [-.14, .55+offset, 0], [.14, .55+offset, 0]
    joints[27], joints[28] = [-.13, .1+offset, 0], [.13, .1+offset, 0]
    joints[31], joints[32] = [-.13, .05+offset, -.12], [.13, .05+offset, -.12]
    return {"t":t,"joints":joints,"visibility":[1]*33}


class TestCommercialSafeMocap(unittest.TestCase):
    def test_unapproved_model_fails_closed_even_with_dependencies(self):
        with tempfile.TemporaryDirectory() as tmp:
            model = Path(tmp) / "pose.task"
            model.write_bytes(b"mock fake model not real weights")
            h = hashlib.sha256(model.read_bytes()).hexdigest()
            env = {"WORLD_MOCAP_MODEL_PATH":str(model),
                   "WORLD_MOCAP_MODEL_SHA256":h,
                   "WORLD_MOCAP_MODEL_COMMERCIAL_USE_APPROVED":"false"}
            with patch.dict(os.environ, env), patch("importlib.util.find_spec", return_value=object()):
                self.assertFalse(MotionCaptureEngine().status()["available"])
            env["WORLD_MOCAP_MODEL_COMMERCIAL_USE_APPROVED"] = "true"
            env["WORLD_MOCAP_MODEL_SHA256"] = "0"*64
            with patch.dict(os.environ, env), patch("importlib.util.find_spec", return_value=object()):
                self.assertFalse(MotionCaptureEngine().status()["available"])
            env["WORLD_MOCAP_MODEL_SHA256"] = h
            with patch.dict(os.environ, env), patch("importlib.util.find_spec", return_value=object()):
                self.assertTrue(MotionCaptureEngine().status()["available"])
            with patch.dict(os.environ, env), patch("importlib.util.find_spec", return_value=object()):
                with self.assertRaises(RuntimeError):
                    # No actual MediaPipe inferencing exercised; model rights still belong to operator.
                    MotionCaptureEngine().run(Path(tmp) / "never_uploaded.mp4", Path(tmp), {}, lambda *_: None)

    def test_real_gltf_binary_animation_from_synthetic_keypoints(self):
        with tempfile.TemporaryDirectory() as tmp:
            dst = Path(tmp) / "animation.glb"
            write_mannequin_glb([frame(0.0), frame(0.1, .1), frame(0.2, .2)], dst)
            blob = dst.read_bytes()
            magic, version, length = struct.unpack_from("<4sII", blob)
            self.assertEqual((magic, version, length), (b"glTF", 2, len(blob)))
            json_len, json_tag = struct.unpack_from("<I4s", blob, 12)
            self.assertEqual(json_tag, b"JSON")
            doc = json.loads(blob[20:20+json_len])
            self.assertEqual(len(doc["nodes"]), len(BONES))
            self.assertEqual(len(doc["animations"][0]["channels"]), 3*len(BONES))
            self.assertEqual(doc["accessors"][2]["count"], 3)
            self.assertIn("NOT rig retarget", doc["asset"]["generator"])
            binary_offset = 20 + json_len
            bin_size, bin_tag = struct.unpack_from("<I4s", blob, binary_offset)
            self.assertEqual(bin_tag, b"BIN\\x00")
            self.assertEqual(binary_offset+8+bin_size, len(blob))
            self.assertGreater(dst.stat().st_size, 1000)

    def test_reject_malformed_landmarks_and_non_monotonic_time(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "bad.glb"
            with self.assertRaises(ValueError):
                write_mannequin_glb([frame(0.0)], dest)
            with self.assertRaises(ValueError):
                write_mannequin_glb([frame(0.0), frame(0.0)], dest)
            bad = frame(0.1)
            bad["joints"][12][1] = float("nan")
            with self.assertRaises(ValueError):
                write_mannequin_glb([frame(0.0), bad], dest)

    def test_upload_header_not_filename_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            sample = Path(tmp) / "clip.mp4"
            sample.write_bytes(b"not a video, fake extension")
            with self.assertRaises(ValueError):
                verify_video(sample, "video/mp4")
            sample.write_bytes(bytes.fromhex("1a45dfa3")+"webm")
            verify_video(sample, "video/webm")
            with self.assertRaises(ValueError):
                verify_video(sample, "video/mp4")
            sample.write_bytes(bytes.fromhex("000000186674797069736f6d") + b"\\x00"*20)
            verify_video(sample, "video/mp4")


if __name__ == "__main__":
    unittest.main()
