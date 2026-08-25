from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any


class JobStore:
    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._init()

    def _connect(self) -> sqlite3.Connection:
        con = sqlite3.connect(self.db_path, timeout=30)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("PRAGMA synchronous=NORMAL")
        return con

    def _init(self) -> None:
        with self._lock, self._connect() as con:
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    mode TEXT NOT NULL,
                    status TEXT NOT NULL,
                    progress INTEGER NOT NULL DEFAULT 0,
                    params_json TEXT NOT NULL DEFAULT '{}',
                    input_path TEXT,
                    result_json TEXT NOT NULL DEFAULT '{}',
                    message TEXT NOT NULL DEFAULT '',
                    error TEXT,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, created_at)")

    def create(self, job_id: str, mode: str, params: dict[str, Any], input_path: str | None) -> None:
        now = time.time()
        with self._lock, self._connect() as con:
            con.execute(
                "INSERT INTO jobs(id,mode,status,progress,params_json,input_path,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
                (job_id, mode, "queued", 0, json.dumps(params, separators=(",", ":")), input_path, now, now),
            )

    def update(self, job_id: str, **fields: Any) -> None:
        allowed = {"status", "progress", "result_json", "message", "error", "input_path"}
        items = [(k, v) for k, v in fields.items() if k in allowed]
        if not items:
            return
        normalized = []
        for key, value in items:
            if key == "result_json" and not isinstance(value, str):
                value = json.dumps(value, separators=(",", ":"))
            normalized.append((key, value))
        normalized.append(("updated_at", time.time()))
        sql = "UPDATE jobs SET " + ",".join(f"{k}=?" for k, _ in normalized) + " WHERE id=?"
        with self._lock, self._connect() as con:
            con.execute(sql, [v for _, v in normalized] + [job_id])

    def get(self, job_id: str) -> dict[str, Any] | None:
        with self._lock, self._connect() as con:
            row = con.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
        return self._decode(row) if row else None

    def by_status(self, statuses: tuple[str, ...]) -> list[dict[str, Any]]:
        marks = ",".join("?" for _ in statuses)
        with self._lock, self._connect() as con:
            rows = con.execute(f"SELECT * FROM jobs WHERE status IN ({marks}) ORDER BY created_at", statuses).fetchall()
        return [self._decode(row) for row in rows]

    def recover_interrupted(self) -> None:
        with self._lock, self._connect() as con:
            con.execute(
                "UPDATE jobs SET status='queued', progress=0, message='Recovered after worker restart', updated_at=? WHERE status='running'",
                (time.time(),),
            )

    def purge_older_than(self, seconds: int) -> list[str]:
        threshold = time.time() - seconds
        with self._lock, self._connect() as con:
            rows = con.execute("SELECT id FROM jobs WHERE updated_at < ? AND status IN ('completed','failed')", (threshold,)).fetchall()
            ids = [row["id"] for row in rows]
            if ids:
                con.executemany("DELETE FROM jobs WHERE id=?", [(job_id,) for job_id in ids])
        return ids

    @staticmethod
    def _decode(row: sqlite3.Row) -> dict[str, Any]:
        out = dict(row)
        try: out["params"] = json.loads(out.pop("params_json") or "{}")
        except json.JSONDecodeError: out["params"] = {}
        try: out["result"] = json.loads(out.pop("result_json") or "{}")
        except json.JSONDecodeError: out["result"] = {}
        return out
