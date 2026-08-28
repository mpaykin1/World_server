from __future__ import annotations

import argparse
import json
import os
import py_compile
import shutil
import subprocess
import tempfile
from pathlib import Path


def find_root(start: Path) -> Path:
    p = start.resolve()
    for candidate in [p, *p.parents]:
        if (candidate / "package.json").is_file() and (candidate / "services" / "ai3d-worker").is_dir():
            return candidate
    raise SystemExit("World_server root not found. Run inside the repository.")


def find_blender() -> str | None:
    env = os.environ.get("BLENDER_BIN", "").strip()
    if env and Path(env).is_file():
        return env
    found = shutil.which("blender")
    if found:
        return found
    if os.name == "nt":
        roots = [
            Path(os.environ.get("PROGRAMFILES", r"C:\Program Files")) / "Blender Foundation",
            Path(os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)")) / "Blender Foundation",
        ]
        for root in roots:
            if root.is_dir():
                exes = sorted(root.glob("Blender */blender.exe"), reverse=True)
                if exes:
                    return str(exes[0])
    return None


def check_glb(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 20:
        return False
    with path.open("rb") as f:
        return f.read(4) == b"glTF"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--require-blender", action="store_true")
    parser.add_argument("--blender-selftest", action="store_true")
    args = parser.parse_args()
    root = find_root(Path.cwd())
    worker = root / "services" / "ai3d-worker"
    plugin = worker / "ai3d" / "plugins" / "characterforge_cpu.py"
    blender_script = worker / "scripts" / "characterforge_voxel_blender.py"
    server = worker / "server.py"
    runner = worker / "ai3d" / "runner.py"
    presets_path = worker / "characterforge" / "presets.json"

    checks = []
    def check(name, ok, detail=""):
        checks.append({"name": name, "pass": bool(ok), "detail": detail})

    check("plugin_exists", plugin.is_file(), str(plugin))
    check("blender_script_exists", blender_script.is_file(), str(blender_script))
    check("presets_exists", presets_path.is_file(), str(presets_path))
    for path, label in [(plugin, "plugin_python_compile"), (blender_script, "blender_script_compile")]:
        if path.is_file():
            try:
                py_compile.compile(str(path), doraise=True)
                check(label, True)
            except Exception as exc:
                check(label, False, str(exc))

    server_text = server.read_text(encoding="utf-8") if server.is_file() else ""
    runner_text = runner.read_text(encoding="utf-8") if runner.is_file() else ""
    check("api_mode_registered", '"character_voxel"' in server_text)
    check("multiview_endpoint_registered", '/v1/characterforge/jobs' in server_text)
    check("runner_import_registered", "CharacterForgeCpuEngine" in runner_text)
    check("runner_mode_registered", 'mode == "character_voxel"' in runner_text)
    check("cpu_truth_policy", "No GPU backend may be claimed" in runner_text)

    if presets_path.is_file():
        try:
            presets = json.loads(presets_path.read_text(encoding="utf-8"))
            values = [presets["profiles"][k]["voxelsPerCharacterHeight"] for k in ["very_coarse", "coarse", "balanced", "detailed", "very_detailed"]]
            check("lod_profile_order", values == sorted(values), str(values))
            check("identity_lock_enabled", bool(presets.get("identity_lock", {}).get("enabled")))
            check("multiview_enabled", bool(presets.get("multiview", {}).get("enabled")))
            check("cache_enabled", bool(presets.get("cache", {}).get("enabled")))
        except Exception as exc:
            check("presets_parse", False, str(exc))

    blender = find_blender()
    if blender:
        try:
            proc = subprocess.run([blender, "--version"], capture_output=True, text=True, timeout=30)
            first = (proc.stdout or proc.stderr).splitlines()[0] if (proc.stdout or proc.stderr) else ""
            check("blender_runs", proc.returncode == 0, first)
        except Exception as exc:
            check("blender_runs", False, str(exc))
    elif args.require_blender or args.blender_selftest:
        check("blender_required", False, "Install Blender 4.x/5.x or set BLENDER_BIN")
    else:
        check("blender_discovery_optional_static", True, "not found; strict verification will require it")

    if args.blender_selftest and blender and blender_script.is_file():
        try:
            with tempfile.TemporaryDirectory(prefix="characterforge-selftest-") as td:
                out = Path(td)
                cmd = [
                    blender, "--background", "--factory-startup", "--python", str(blender_script), "--",
                    "--self-test", "--output-dir", str(out), "--resolutions", "16,24,36", "--primary", "24",
                    "--palette-size", "8", "--animations", "idle,walk,run,jump",
                ]
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60 * 20)
                check("blender_selftest_process", proc.returncode == 0, (proc.stderr or proc.stdout)[-1200:])
                glbs = [out / "character_voxel_16vph.glb", out / "character_voxel.glb", out / "character_voxel_36vph.glb"]
                check("blender_selftest_three_glbs", all(check_glb(p) for p in glbs), ", ".join(p.name for p in glbs))
                summary = json.loads((out / "characterforge-blender-summary.json").read_text(encoding="utf-8"))
                identity = json.loads((out / "characterforge-identity.json").read_text(encoding="utf-8"))
                palette_hashes = {x.get("paletteHash") for x in summary}
                rig_hashes = {x.get("rigSchemaHash") for x in summary}
                check("selftest_palette_stable", len(palette_hashes) == 1, str(palette_hashes))
                check("selftest_rig_stable", len(rig_hashes) == 1, str(rig_hashes))
                check("selftest_identity_stable", bool(identity.get("stableAcrossLods")))
                check("selftest_foot_markers", bool(identity.get("footContactMarkers")))
                check("selftest_foot_contact_stabilized", bool(identity.get("footContactStabilizedAcrossLods")))
                check("selftest_rig_map", (out / "characterforge-rig-map.json").is_file())
                check("selftest_animation_contract", (out / "characterforge-animation-contract.json").is_file())
        except Exception as exc:
            check("blender_selftest_exception", False, str(exc))

    try:
        import rembg  # type: ignore  # noqa: F401
        check("rembg_cpu_optional", True, "installed")
    except Exception:
        check("rembg_cpu_optional", True, "optional enhancement: pip install rembg[cpu]")

    passed = all(x["pass"] for x in checks)
    report = {
        "technology": "CharacterForge CPU Voxel Pipeline",
        "version": "2.0.0",
        "status": "PASS" if passed else "FAIL",
        "checks": checks,
        "note": "Use --require-blender --blender-selftest before production promotion on the CPU worker host.",
    }
    path = root / "CHARACTERFORGE_CPU_VERIFY.json"
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(0 if passed else 2)


if __name__ == "__main__":
    main()
