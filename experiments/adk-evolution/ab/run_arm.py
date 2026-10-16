"""Run ONE arm of one A/B pair.

  python run_arm.py --task T1 --arm A      # AGES direct: real opencode subprocess
  python run_arm.py --task T1 --arm B      # same subprocess inside a google-adk BaseAgent

Both arms: fresh copy of baselines/improved.html as <workdir>/game.html, identical argv, identical env,
same timeout. Afterwards the acceptance test runs and results/<task>-<arm>.json is written.
"""
import argparse
import asyncio
import difflib
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent


def sha256_file(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def utc():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def git_head():
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], cwd=HERE, capture_output=True, text=True, timeout=20).stdout.strip() or "UNKNOWN"
    except Exception:
        return "UNKNOWN"


def run_direct(argv, cwd, timeout, log_path):
    """Arm A: plain subprocess."""
    with open(log_path, "wb") as log:
        try:
            p = subprocess.Popen(argv, cwd=cwd, stdout=log, stderr=subprocess.STDOUT)
        except OSError as e:
            return {"pid": None, "returncode": None, "timed_out": False, "start_error": str(e)}
        try:
            rc = p.wait(timeout=timeout)
            return {"pid": p.pid, "returncode": rc, "timed_out": False}
        except subprocess.TimeoutExpired:
            p.kill()
            p.wait()
            return {"pid": p.pid, "returncode": p.returncode, "timed_out": True}


def run_via_adk(argv, cwd, timeout, log_path):
    """Arm B: the SAME subprocess, started by a google-adk BaseAgent that runs under InMemoryRunner."""
    from google.adk.agents import BaseAgent, SequentialAgent
    from google.adk.events import Event
    from google.adk.runners import InMemoryRunner
    from google.genai import types

    info = {"pid": None, "returncode": None, "timed_out": False, "adk_events": 0}

    class OpenCodeAgent(BaseAgent):
        async def _run_async_impl(self, ctx):
            with open(log_path, "wb") as log:
                try:
                    proc = await asyncio.create_subprocess_exec(*argv, cwd=cwd, stdout=log, stderr=asyncio.subprocess.STDOUT)
                except OSError as e:
                    info["start_error"] = str(e)
                    proc = None
                if proc is not None:
                    info["pid"] = proc.pid
                    try:
                        info["returncode"] = await asyncio.wait_for(proc.wait(), timeout=timeout)
                    except asyncio.TimeoutError:
                        proc.kill()
                        await proc.wait()
                        info["returncode"] = proc.returncode
                        info["timed_out"] = True
            yield Event(author=self.name, content=types.Content(role="model", parts=[types.Part(text=f"opencode exit {info['returncode']}")]))

    async def go():
        root = SequentialAgent(name="ab_pipeline", sub_agents=[OpenCodeAgent(name="opencode_agent")])
        runner = InMemoryRunner(agent=root, app_name="ab_arm_b")
        await runner.session_service.create_session(app_name="ab_arm_b", user_id="ab", session_id="run")
        async for ev in runner.run_async(user_id="ab", session_id="run", new_message=types.Content(role="user", parts=[types.Part(text="run task")])):
            if ev.author == "opencode_agent":
                info["adk_events"] += 1

    asyncio.run(go())
    return info


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--task", required=True, choices=["T1", "T2", "T3"])
    ap.add_argument("--arm", required=True, choices=["A", "B"])
    ap.add_argument("--rules", default=str(HERE / "RULES.json"))
    ap.add_argument("--results", default=str(HERE / "results"))
    ap.add_argument("--workdir", default=None)
    ap.add_argument("--three-dir", default=os.environ.get("THREE_DIR", ""))
    ap.add_argument("--test-python", default=sys.executable, help="python that has playwright with an installed chromium (runs the acceptance test)")
    a = ap.parse_args()

    rules = json.loads(Path(a.rules).read_text(encoding="utf-8"))
    task = json.loads((HERE / "tasks" / f"{a.task}.json").read_text(encoding="utf-8"))
    if rules["model"].startswith("FILL"):
        sys.exit("RULES.json model is not set: fill it and commit before the first run")
    if hashlib.sha256(task["prompt"].encode("utf-8")).hexdigest() != task["prompt_sha256"]:
        sys.exit("task prompt does not match its registered prompt_sha256")
    base = EXP / rules["base_file"]
    if sha256_file(base) != rules["base_sha256"]:
        sys.exit("baseline HTML does not match the registered sha256")
    if not a.three_dir or not Path(a.three_dir, "build", "three.module.js").is_file():
        sys.exit("set --three-dir/THREE_DIR to the folder of the npm package three@0.160.0")

    results = Path(a.results)
    results.mkdir(parents=True, exist_ok=True)
    work = Path(a.workdir or tempfile.mkdtemp(prefix=f"ab_{a.task}_{a.arm}_"))
    work.mkdir(parents=True, exist_ok=True)
    game = work / "game.html"
    game.write_bytes(base.read_bytes())

    argv = [x.format(model=rules["model"], prompt=task["prompt"]) for x in rules["agent_cmd"]]
    log_path = results / f"{a.task}-{a.arm}.agent.log"
    start = utc()
    t0 = time.perf_counter()
    if a.arm == "A":
        info = run_direct(argv, str(work), rules["agent_timeout_seconds"], log_path)
    else:
        info = run_via_adk(argv, str(work), rules["agent_timeout_seconds"], log_path)
    wall = round(time.perf_counter() - t0, 2)
    end = utc()

    # acceptance test (not counted in wall_seconds)
    env = dict(os.environ, THREE_DIR=a.three_dir)
    t = subprocess.run([a.test_python, str(HERE / "tests" / f"test_{a.task}.py"), str(game)], capture_output=True, text=True, env=env, timeout=900)
    (results / f"{a.task}-{a.arm}.acceptance.log").write_text(t.stdout + "\n" + t.stderr, encoding="utf-8")
    m = re.search(r"RESULT \w+: (\d+)/(\d+) checks passed", t.stdout)
    passed, total = (int(m.group(1)), int(m.group(2))) if m else (0, 0)

    # diff
    old = base.read_text(encoding="utf-8").splitlines(keepends=True)
    new = game.read_text(encoding="utf-8", errors="replace").splitlines(keepends=True)
    diff = list(difflib.unified_diff(old, new, "a/game.html", "b/game.html"))
    (results / f"{a.task}-{a.arm}.patch").write_text("".join(diff), encoding="utf-8")
    added = sum(1 for l in diff if l.startswith("+") and not l.startswith("+++"))
    removed = sum(1 for l in diff if l.startswith("-") and not l.startswith("---"))

    rec = {
        "task": a.task, "arm": a.arm, "model_id": rules["model"], "input_sha": git_head(), "base_sha256": sha256_file(base),
        "cmdline": argv[:-1] + ["<prompt:%s>" % task["prompt_sha256"][:12]], "cmdline_full_sha256": hashlib.sha256("\0".join(argv).encode("utf-8")).hexdigest(),
        "prompt_sha256": task["prompt_sha256"], "start_utc": start, "end_utc": end, "wall_seconds": wall,
        "tokens_in": "UNKNOWN", "tokens_out": "UNKNOWN", "llm_calls": "UNKNOWN", "retries": 0, "human_interventions": 0,
        "agent_pid": info.get("pid"), "agent_returncode": info.get("returncode"), "timed_out": info.get("timed_out", False),
        "start_error": info.get("start_error"), "adk_events": info.get("adk_events", 0) if a.arm == "B" else None,
        "acceptance_test_exit_code": t.returncode, "tests_passed": passed, "tests_total": total, "acceptance_pass": t.returncode == 0,
        "diff_added": added, "diff_removed": removed, "patch_file": f"{a.task}-{a.arm}.patch", "agent_log_file": f"{a.task}-{a.arm}.agent.log",
    }
    (results / f"{a.task}-{a.arm}.json").write_text(json.dumps(rec, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: rec[k] for k in ("task", "arm", "wall_seconds", "agent_returncode", "tests_passed", "tests_total", "acceptance_pass", "diff_added", "diff_removed")}))


if __name__ == "__main__":
    main()
