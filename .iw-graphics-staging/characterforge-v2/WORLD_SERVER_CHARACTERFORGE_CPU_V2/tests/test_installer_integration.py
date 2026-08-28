from __future__ import annotations

import importlib.util
import json
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("installer", ROOT / "install_characterforge_cpu_v2.py")
installer = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(installer)

SERVER = '''from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile\nimport json, shutil, uuid\nfrom pathlib import Path\napp=FastAPI()\nRUNTIME=Path("runtime")\nMAX_UPLOAD=25*1024*1024\nALLOWED_IMAGE_TYPES={"image/png","image/jpeg","image/webp"}\ndef verify_image(p): pass\ndef require_token(): pass\ndef dispatch(i): pass\ndef public_job(j): return j\nclass S:\n def create(self,*a): pass\n def get(self,*a): return {}\nstore=S()\n@app.post("/v1/jobs")\nasync def create_job(mode: str = Form(...), params: str = Form("{}"), file: UploadFile | None = File(default=None), _token=Depends(require_token)):\n    if mode not in {"auto", "image_to_3d", "depth", "building", "map", "voxel_city"}:\n        raise HTTPException(status_code=400, detail="Unsupported mode.")\n    needs_image = mode in {"auto", "image_to_3d", "depth", "voxel_city"}\n@app.get("/v1/jobs/{job_id}")\ndef get_job(job_id: str): return {}\n'''

RUNNER = '''import json,time\nfrom pathlib import Path\nfrom .plugins.world_quality import WorldQualityEnhancer\nclass PipelineRunner:\n def __init__(self):\n        self.world_quality = WorldQualityEnhancer()\n def plugin_status(self):\n  return {\n            "voxel_tools": {"voxelsrv": (Path("C:/Users/user/Desktop/майн/voxelsrv/src").is_dir()), "littlecubes": (Path("C:/Users/user/Desktop/майн/LittleCubes/src").is_dir())},\n  }\n def run(self,job,progress):\n        mode=job["mode"]\n        params=job.get("params",{})\n        input_path=Path(job["input_path"]) if job.get("input_path") else None\n        if mode in {"auto", "image_to_3d", "depth", "voxel_city"} and not input_path:\n            raise RuntimeError()\n        if mode in {"auto", "depth"} or (mode == "image_to_3d" and bool(params.get("depthPreview", True))):\n            pass\n'''


def main():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        worker = root / "services/ai3d-worker"
        (worker / "ai3d/plugins").mkdir(parents=True)
        (worker / "scripts").mkdir(parents=True)
        (worker / "characterforge").mkdir(parents=True)
        (root / "package.json").write_text(json.dumps({"scripts": {"check": "node --test"}}), encoding="utf-8")
        server = worker / "server.py"
        runner = worker / "ai3d/runner.py"
        server.write_text(SERVER, encoding="utf-8")
        runner.write_text(RUNNER, encoding="utf-8")

        installer.patch_server(server)
        installer.patch_runner(runner)
        installer.patch_package_json(root / "package.json")
        # Idempotence: a second pass must not duplicate the integration.
        installer.patch_server(server)
        installer.patch_runner(runner)
        installer.patch_package_json(root / "package.json")

        st = server.read_text(encoding="utf-8")
        rt = runner.read_text(encoding="utf-8")
        pkg = json.loads((root / "package.json").read_text(encoding="utf-8"))
        assert st.count('/v1/characterforge/jobs') == 1
        assert '"character_voxel"' in st
        assert rt.count("CharacterForgeCpuEngine") == 2  # import + constructor
        assert rt.count('if mode == "character_voxel":') == 1
        assert pkg["scripts"]["characterforge:selftest"].endswith("--blender-selftest")
        print("INSTALLER_INTEGRATION_V2_PASS")


if __name__ == "__main__":
    main()
