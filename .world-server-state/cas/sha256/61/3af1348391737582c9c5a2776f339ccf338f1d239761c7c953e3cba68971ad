#!/usr/bin/env python3
"""
Real end-to-end smoke: image -> JobStore -> PipelineRunner -> artifacts -> validation.
Separates PIPELINE COMPLETION (VERIFIED) from VISUAL QUALITY (UNTESTED).
If GPU is absent, uses REAL CPU volumetric (not placeholder) and reports blocker.
"""
from __future__ import annotations

import os
import sys
import tempfile
import shutil
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))

from PIL import Image
from ai3d.store import JobStore
from ai3d.runner import PipelineRunner
from ai3d.validation import validate_glb, quality_score
from ai3d.evidence import enforce_evidence_report

def make_test_image(path: Path, size=(512, 512)):
    # Deterministic test scene: background + foreground object + depth structure
    img = Image.new("RGB", size, (135, 206, 235))  # sky
    from PIL import ImageDraw
    draw = ImageDraw.Draw(img)
    # Background hills
    draw.ellipse([-100, 300, 300, 500], fill=(100, 180, 100))
    draw.ellipse([200, 280, 600, 550], fill=(80, 160, 80))
    # Foreground object: red cube-like with shading
    draw.rectangle([176, 176, 336, 336], fill=(200, 40, 40), outline=(0, 0, 0), width=3)
    draw.polygon([(176, 176), (206, 146), (366, 146), (336, 176)], fill=(220, 60, 60), outline=(0, 0, 0), width=2)
    draw.polygon([(336, 176), (366, 146), (366, 306), (336, 336)], fill=(160, 30, 30), outline=(0, 0, 0), width=2)
    # Ground line
    draw.rectangle([0, 380, size[0], size[1]], fill=(120, 100, 80))
    # Small depth cue: shadow
    draw.ellipse([190, 340, 320, 360], fill=(0, 0, 0, 80))
    img.save(path, format="PNG")
    return path

def main():
    runtime = SERVICE_ROOT / "runtime"
    runtime.mkdir(parents=True, exist_ok=True)
    tmp_db = Path(tempfile.mktemp(suffix=".sqlite3"))
    store = JobStore(tmp_db)
    runner = PipelineRunner(runtime)

    print("=== AI3D E2E smoke ===")
    print("Capabilities:", runner.plugin_status())

    job_id = "e2e-smoke-" + os.urandom(4).hex()
    job_dir = runtime / "jobs" / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    img_path = job_dir / "input.png"
    make_test_image(img_path)
    print(f"Test image: {img_path} ({img_path.stat().st_size} bytes)")

    overall_ok = True
    for mode in ["image_to_3d"]:
        sub_id = f"{job_id}-{mode}"
        sub_dir = runtime / "jobs" / sub_id
        sub_dir.mkdir(parents=True, exist_ok=True)
        import shutil as _sh
        inp = sub_dir / "input.png"
        _sh.copy(img_path, inp)
        store.create(sub_id, mode, {"depthPreview": False, "decimationTarget": 80000}, str(inp))
        job = store.get(sub_id)
        print(f"\n--- Mode: {mode} (job {sub_id}) ---")
        def prog(pct, msg):
            print(f"  [{pct:3}%] {msg}")
        try:
            result = runner.run(job, prog)
            for f in result["files"]:
                p = sub_dir / f["name"]
                if f["role"] in ("model", "depth", "building", "world"):
                    if f["name"].endswith(".glb"):
                        validate_glb(p)
                        print(f"  validate_glb OK: {p.name} ({f['bytes']} bytes)")
                        # Use the original input image for binding
                        inp_for_quality = sub_dir / "input.png"
                        qs = quality_score(p, input_path=inp_for_quality if inp_for_quality.is_file() else None)
                        print(f"  quality: geometry_integrity {qs['geometry_integrity']['percent']}% VERIFIED, glb_validity {qs['glb_validity']['percent']}% VERIFIED, volumetric {qs['volumetric_artifact_integrity']['percent']}%")
                    elif f["name"].endswith(".png"):
                        from ai3d.validation import verify_image
                        verify_image(p)
                        print(f"  verify_image OK: {p.name}")
            manifest = sub_dir / "manifest.json"
            if manifest.is_file():
                import json
                m = json.loads(manifest.read_text(encoding="utf-8"))
                print(f"  manifest chosenEngine: {m.get('chosenEngine')}, infraBlocker: {m.get('infraBlocker')}")
                print(f"  godotPackageReady: {m.get('godotPackageReady')}, godotRuntimeAvailable: {m.get('godotRuntimeAvailable')}, godotRuntimeTested: {m.get('godotRuntimeTested')}")
                print(f"  depthEngine: {m.get('depthEngine')}, depthInferenceVerified: {m.get('depthInferenceVerified')}, blenderEnhancementUsed: {m.get('blenderEnhancementUsed')}")
                # Check quality-report.json
                qr = sub_dir / "quality-report.json"
                if qr.is_file():
                    qj = json.loads(qr.read_text(encoding="utf-8"))
                    print(f"  quality-report evidencePolicy: {qj.get('evidencePolicy')}")
                    enforce_evidence_report(qj)
                    print(f"  evidence gate PASS for quality-report")
                if m.get("infraBlocker"):
                    print(f"  >>> INFRA BLOCKER: {m['infraBlocker']}")
            # PIPELINE COMPLETION — VERIFIED
            print(f"  PIPELINE COMPLETION: VERIFIED 100% ({len(result['files'])} files, {result['durationSeconds']}s)")
            # VISUAL QUALITY — must be UNTESTED without ground truth
            print(f"  IMAGE->3D VISUAL QUALITY: UNTESTED (no ground-truth/render-back)")
            assert any(f["name"].endswith(".glb") for f in result["files"]), "No GLB produced"
        except Exception as exc:
            print(f"  FAILED: {exc}")
            import traceback; traceback.print_exc()
            overall_ok = False

    caps = runner.plugin_status()
    print("\n=== Summary ===")
    print(f"TRELLIS available: {caps['trellis2']['available']} (needs Linux+CUDA 24GB)")
    print(f"InstantMesh available: {caps['instantmesh']['available']}")
    print(f"Depth Small available: {caps['depth_anything_v2_small']['available']}")
    print(f"Blender auto-found: {caps['blender']}")
    print(f"Godot voxel bridge packageReady: {caps['godot_voxel_factory']['godotPackageReady']}")

    try:
        tmp_db.unlink(missing_ok=True)
        shutil.rmtree(job_dir, ignore_errors=True)
    except Exception:
        pass

    if overall_ok:
        print("\nPIPELINE COMPLETION: VERIFIED 100%")
        print("IMAGE->3D VISUAL QUALITY: UNTESTED")
        sys.exit(0)
    else:
        print("\nE2E SMOKE FAILED")
        sys.exit(1)

if __name__ == "__main__":
    main()
