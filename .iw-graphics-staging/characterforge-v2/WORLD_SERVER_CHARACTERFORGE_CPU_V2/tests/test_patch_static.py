from __future__ import annotations

import ast
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    py_files = list(ROOT.rglob("*.py"))
    assert py_files, "No Python files"
    for path in py_files:
        ast.parse(path.read_text(encoding="utf-8"), filename=str(path))

    manifest = json.loads((ROOT / "PATCH_MANIFEST.json").read_text(encoding="utf-8"))
    assert manifest["version"] == "2.0.0"
    assert manifest["gpu_required"] is False
    assert "front/side/back/left multi-view upload endpoint" in manifest["core_features"]

    presets = json.loads((ROOT / "payload/services/ai3d-worker/characterforge/presets.json").read_text(encoding="utf-8"))
    profiles = presets["profiles"]
    values = [profiles[k]["voxelsPerCharacterHeight"] for k in ["very_coarse", "coarse", "balanced", "detailed", "very_detailed"]]
    assert values == sorted(values), values
    assert presets["semantic_detail_control"]["less_detail"]["resolution_multiplier"] < 1
    assert presets["semantic_detail_control"]["more_detail"]["resolution_multiplier"] > 1
    assert presets["multiview"]["enabled"] is True
    assert presets["identity_lock"]["palette_lock"] is True
    assert presets["cache"]["enabled"] is True
    assert presets["resource_governor"]["enabled"] is True

    plugin = (ROOT / "payload/services/ai3d-worker/ai3d/plugins/characterforge_cpu.py").read_text(encoding="utf-8")
    for token in ["content-addressed cache", "_apply_ram_governor", "_prune_cache", "_characterViews", "stable canonical palette", "godot-character", "GPU-only engines are never"]:
        assert token.lower() in plugin.lower(), token

    blender = (ROOT / "payload/services/ai3d-worker/scripts/characterforge_voxel_blender.py").read_text(encoding="utf-8")
    for token in ["--view-side", "--view-back", "--self-test", "paletteHash", "rigSchemaHash", "footContactMarkers", "characterforge-rig-map.json", "footLoopDrift"]:
        assert token in blender, token

    installer = (ROOT / "install_characterforge_cpu_v2.py").read_text(encoding="utf-8")
    assert "/v1/characterforge/jobs" in installer
    assert "characterforge:selftest" in installer
    assert "backupFiles" in installer and "createdFiles" in installer

    print(f"PATCH_STATIC_V2_PASS files={len(py_files)} profiles={values}")


if __name__ == "__main__":
    main()
