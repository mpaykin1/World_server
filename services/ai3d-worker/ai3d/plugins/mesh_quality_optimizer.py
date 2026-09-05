from __future__ import annotations

from pathlib import Path

from ..mesh_optimizer import MeshOptimizationPipeline


class MeshQualityOptimizer:
    """Compatibility bridge used by PipelineRunner.

    The old optimizer performed an independent blind Decimate pass. V10 delegates to the
    canonical quality-gated pipeline so generated and uploaded models share one source of truth.
    """

    def __init__(self):
        service_root = Path(__file__).resolve().parents[2]
        self.pipeline = MeshOptimizationPipeline(service_root)

    def audit(self, path: Path) -> dict:
        path = Path(path)
        return {
            "path": str(path),
            "bytes": path.stat().st_size if path.is_file() else 0,
            "valid": bool(path.is_file() and path.stat().st_size >= 64),
            "pipelineVersion": self.pipeline.status().get("pipelineVersion"),
            "canonical": True,
        }

    def prepare(self, src: Path, job: Path, params: dict):
        src = Path(src)
        job = Path(job)
        merged_params = dict(params or {})
        status = self.pipeline.status()
        if not status.get("available"):
            report = job / "optimization-report.json"
            report.write_text(
                __import__("json").dumps(
                    {
                        "schemaVersion": 10,
                        "status": "SKIPPED_BLENDER_UNAVAILABLE",
                        "passed": True,
                        "sourcePreserved": True,
                        "source": str(src),
                        "pipelineVersion": status.get("pipelineVersion"),
                        "blender": status.get("blender"),
                        "reason": "Canonical Blender quality optimizer is optional after a valid source GLB; source model is preserved unchanged when Blender is unavailable.",
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
            return report, []
        for candidate in (job / "input.png", job / "input.jpg", job / "input.webp"):
            if candidate.is_file():
                merged_params.setdefault("_semanticReferenceImage", str(candidate))
                break
        result = self.pipeline.run(
            {
                "id": job.name,
                "mode": "mesh_optimize",
                "params": merged_params,
                "input_path": str(src),
            },
            lambda _value, _message: None,
        )
        report = job / "optimization-report.json"
        lods = [job / name for name in ("LOD0.glb", "LOD1.glb", "LOD2.glb", "LOD3.glb", "HLOD.glb") if (job / name).is_file()]
        if not report.is_file():
            raise RuntimeError(f"Canonical V10 mesh pipeline did not produce optimization-report.json (status={result.get('status')})")
        return report, lods
