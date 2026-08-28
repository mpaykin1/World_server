from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SERVER = '''from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile\nimport json, shutil, uuid\nfrom pathlib import Path\napp=FastAPI()\nRUNTIME=Path("runtime")\nMAX_UPLOAD=25*1024*1024\nALLOWED_IMAGE_TYPES={"image/png","image/jpeg","image/webp"}\ndef verify_image(p): pass\ndef require_token(): pass\ndef dispatch(i): pass\ndef public_job(j): return j\nclass S:\n def create(self,*a): pass\n def get(self,*a): return {}\nstore=S()\n@app.post("/v1/jobs")\nasync def create_job(mode: str = Form(...), params: str = Form("{}"), file: UploadFile | None = File(default=None), _token=Depends(require_token)):\n    if mode not in {"auto", "image_to_3d", "depth", "building", "map", "voxel_city"}:\n        raise HTTPException(status_code=400, detail="Unsupported mode.")\n    needs_image = mode in {"auto", "image_to_3d", "depth", "voxel_city"}\n@app.get("/v1/jobs/{job_id}")\ndef get_job(job_id: str): return {}\n'''

RUNNER = '''import json,time\nfrom pathlib import Path\nfrom .plugins.world_quality import WorldQualityEnhancer\nclass PipelineRunner:\n def __init__(self):\n        self.world_quality = WorldQualityEnhancer()\n def plugin_status(self):\n  return {\n            "voxel_tools": {"voxelsrv": (Path("C:/Users/user/Desktop/майн/voxelsrv/src").is_dir()), "littlecubes": (Path("C:/Users/user/Desktop/майн/LittleCubes/src").is_dir())},\n  }\n def run(self,job,progress):\n        mode=job["mode"]\n        params=job.get("params",{})\n        input_path=Path(job["input_path"]) if job.get("input_path") else None\n        if mode in {"auto", "image_to_3d", "depth", "voxel_city"} and not input_path:\n            raise RuntimeError()\n        if mode in {"auto", "depth"} or (mode == "image_to_3d" and bool(params.get("depthPreview", True))):\n            pass\n'''


def main():
    with tempfile.TemporaryDirectory() as td:
        repo = Path(td)
        worker = repo / "services/ai3d-worker"
        (worker / "ai3d/plugins").mkdir(parents=True)
        (worker / "scripts").mkdir(parents=True)
        server = worker / "server.py"
        runner = worker / "ai3d/runner.py"
        package = repo / "package.json"
        server.write_text(SERVER, encoding="utf-8")
        runner.write_text(RUNNER, encoding="utf-8")
        package.write_text(json.dumps({"scripts": {"check": "node --test"}}), encoding="utf-8")
        original = {"server": server.read_text(), "runner": runner.read_text(), "package": package.read_text()}

        proc = subprocess.run([sys.executable, str(ROOT / "install_characterforge_cpu_v2.py")], cwd=repo, capture_output=True, text=True)
        assert proc.returncode == 0, proc.stdout + proc.stderr
        assert "CHARACTERFORGE_CPU_V2_INSTALL_PASS" in proc.stdout
        assert (worker / "ai3d/plugins/characterforge_cpu.py").is_file()
        assert (worker / "scripts/characterforge_voxel_blender.py").is_file()
        assert '/v1/characterforge/jobs' in server.read_text()
        state = json.loads((repo / "CHARACTERFORGE_CPU_INSTALL.json").read_text())
        assert state["version"] == "2.0.0"

        rb = subprocess.run([sys.executable, str(ROOT / "rollback_characterforge_cpu_v2.py")], cwd=repo, capture_output=True, text=True)
        assert rb.returncode == 0, rb.stdout + rb.stderr
        assert "ROLLBACK_PASS" in rb.stdout
        assert server.read_text() == original["server"]
        assert runner.read_text() == original["runner"]
        assert package.read_text() == original["package"]
        assert not (worker / "ai3d/plugins/characterforge_cpu.py").exists()
        print("FULL_INSTALL_ROLLBACK_V2_PASS")


if __name__ == "__main__":
    main()
