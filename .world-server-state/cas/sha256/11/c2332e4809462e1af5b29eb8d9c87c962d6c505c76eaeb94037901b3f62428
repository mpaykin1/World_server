from __future__ import annotations

import json
from contextlib import closing
import sqlite3
import time
from pathlib import Path


def bucket_key(input_bucket: dict) -> str:
    triangles = int(input_bucket.get("triangles", 0) or 0)
    if triangles < 10_000:
        tri_bucket = "tiny"
    elif triangles < 100_000:
        tri_bucket = "small"
    elif triangles < 1_000_000:
        tri_bucket = "large"
    else:
        tri_bucket = "huge"
    materials = int(input_bucket.get("materials", 0) or 0)
    mat_bucket = "few" if materials <= 4 else ("medium" if materials <= 16 else "many")
    return "|".join([
        str(input_bucket.get("extension") or "unknown"),
        tri_bucket,
        mat_bucket,
        "rigged" if input_bucket.get("hasArmature") else "static",
        "shapekeys" if input_bucket.get("hasShapeKeys") else "no-shapekeys",
    ])


class QualityRegistryV5:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(self._connect()) as con:
            con.execute("PRAGMA journal_mode=WAL")
            con.execute("""
                CREATE TABLE IF NOT EXISTS quality_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    bucket TEXT NOT NULL,
                    hardware_tier TEXT NOT NULL,
                    source_fingerprint TEXT NOT NULL,
                    policy_json TEXT NOT NULL,
                    metrics_json TEXT NOT NULL,
                    gates_json TEXT NOT NULL,
                    created_at REAL NOT NULL
                )
            """)
            con.execute("CREATE INDEX IF NOT EXISTS idx_quality_runs_bucket ON quality_runs(bucket, hardware_tier, created_at)")
            con.commit()

    def _connect(self):
        return sqlite3.connect(self.path, timeout=15)

    def suggest(self, input_bucket: dict, hardware_tier: str, limit: int = 20) -> dict:
        key = bucket_key(input_bucket)
        with closing(self._connect()) as con:
            rows = con.execute(
                "SELECT policy_json, metrics_json, created_at FROM quality_runs WHERE bucket=? AND hardware_tier=? ORDER BY created_at DESC LIMIT ?",
                (key, hardware_tier, max(1, min(int(limit), 100))),
            ).fetchall()
        policies = []
        metrics = []
        for policy_json, metrics_json, created_at in rows:
            try:
                policy = json.loads(policy_json)
                metric = json.loads(metrics_json)
            except Exception:
                continue
            if metric.get("accepted"):
                policies.append(policy)
                metrics.append(metric)
        if not policies:
            return {"status": "NO_MATCH", "bucket": key, "hardwareTier": hardware_tier, "samples": 0}
        lod0 = sorted(float(p.get("lod0Ratio", 1.0)) for p in policies if p.get("lod0Ratio") is not None)
        median = lod0[len(lod0) // 2] if lod0 else 1.0
        visual_floor = min(float(m.get("visualSimilarity", 1.0) or 1.0) for m in metrics)
        return {
            "status": "SUGGESTION_AVAILABLE",
            "bucket": key,
            "hardwareTier": hardware_tier,
            "samples": len(policies),
            "suggestedLod0Ratio": round(median, 4),
            "observedVisualSimilarityFloor": round(visual_floor, 6),
            "rule": "Suggestion is a seed only; every new asset must still pass all gates.",
        }

    def record(self, input_bucket: dict, hardware_tier: str, source_fingerprint: str, policy: dict, metrics: dict, gates: dict) -> None:
        if not metrics.get("accepted"):
            return
        with closing(self._connect()) as con:
            con.execute(
                "INSERT INTO quality_runs(bucket,hardware_tier,source_fingerprint,policy_json,metrics_json,gates_json,created_at) VALUES(?,?,?,?,?,?,?)",
                (
                    bucket_key(input_bucket), hardware_tier, source_fingerprint,
                    json.dumps(policy, separators=(",", ":")),
                    json.dumps(metrics, separators=(",", ":")),
                    json.dumps(gates, separators=(",", ":")),
                    time.time(),
                ),
            )
            con.commit()
