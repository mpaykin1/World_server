"""One-command pre-flight for the A/B experiment (stages a, b, c). Works on Windows and Linux.

  py -3.12 win_check.py --three-dir <...\\node_modules\\three> [--log win_check.log] [--skip-opencode]

a) baseline control: T1/T2/T3 acceptance tests on baselines/improved.html must FAIL as registered (6/10, 7/12, 4/9)
b) reference control: reference/Tn.patch applied to a copy must PASS completely (15/15, 17/17, 9/9)
c) OpenCode answers "OK" on the registered model within 120 s
Every stage prints "STAGE <name> START" / "STAGE <name> END exit=<n>" and everything is also written to the log.
"""
import argparse, json, os, re, shutil, subprocess, sys, tempfile  # noqa: E401
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASE = HERE.parent / "baselines" / "improved.html"
EXPECT_BASE = {"T1": "6/10", "T2": "7/12", "T3": "4/9"}
EXPECT_REF = {"T1": "15/15", "T2": "17/17", "T3": "9/9"}
LOG = None


def say(msg):
    print(msg, flush=True)
    if LOG:
        LOG.write(msg + "\n")
        LOG.flush()


def run(cmd, env, timeout, cwd=None):
    try:
        p = subprocess.run(cmd, env=env, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout)
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except subprocess.TimeoutExpired as e:
        return 124, f"TIMEOUT after {timeout}s\n{(e.stdout or b'')[-2000:]!r}"
    except OSError as e:
        return 127, f"cannot start {cmd[0]}: {e}"


def result_of(out, task):
    m = re.search(r"RESULT %s: (\d+)/(\d+) checks passed" % task, out)
    return f"{m.group(1)}/{m.group(2)}" if m else "NO-RESULT"


def stage(name, fn):
    say(f"STAGE {name} START")
    code = fn()
    say(f"STAGE {name} END exit={code}")
    return code


def main():
    global LOG
    ap = argparse.ArgumentParser()
    ap.add_argument("--three-dir", required=True)
    ap.add_argument("--log", default="win_check.log")
    ap.add_argument("--skip-opencode", action="store_true")
    a = ap.parse_args()
    LOG = open(a.log, "w", encoding="utf-8")
    td = Path(a.three_dir)
    ver = json.loads((td / "package.json").read_text(encoding="utf-8")).get("version") if (td / "package.json").is_file() else None
    say(f"python={sys.version.split()[0]} THREE_DIR={td} three_version={ver} module_exists={(td / 'build' / 'three.module.js').is_file()}")
    if ver != "0.160.0" or not (td / "build" / "three.module.js").is_file():
        say("ABORT: THREE_DIR is not three@0.160.0")
        return 2
    env = dict(os.environ, THREE_DIR=str(td), PYTHONIOENCODING="utf-8")
    tmp = Path(tempfile.mkdtemp(prefix="adk_win_check_"))
    bad = []

    def one(label, task, html, expect):
        code, out = run([sys.executable, str(HERE / "tests" / f"test_{task}.py"), str(html)], env, 300, cwd=str(HERE / "tests"))
        got = result_of(out, task)
        warns = [l for l in out.splitlines() if l.startswith("ENV-WARN")]
        say(f"{label} {task}: got={got} expected={expect} env_warn={len(warns)} {'OK' if got == expect else 'MISMATCH'}")
        if got != expect:
            bad.append(f"{label} {task}")
            say("\n".join(out.strip().splitlines()[-40:]))
        for w in warns[:2]:
            say("  " + w[:300])
        return got == expect

    def stage_a():
        return 0 if all([one("baseline", t, BASE, e) for t, e in EXPECT_BASE.items()]) else 1

    def stage_b():
        ok = True
        for t, e in EXPECT_REF.items():
            work = tmp / t
            work.mkdir()
            shutil.copy(BASE, work / "game.html")
            c, o = run(["git", "apply", "--whitespace=nowarn", str(HERE / "reference" / f"{t}.patch")], env, 60, cwd=str(work))
            if c != 0:
                # patch paths are relative to the game file; retry with explicit file target
                c, o = run(["git", "apply", "--whitespace=nowarn", "--directory=.", str(HERE / "reference" / f"{t}.patch")], env, 60, cwd=str(work))
            if c != 0:
                say(f"reference {t}: git apply failed: {o[-600:]}")
                bad.append(f"reference-apply {t}")
                ok = False
                continue
            ok = one("reference", t, work / "game.html", e) and ok
        return 0 if ok else 1

    def stage_c():
        rules = json.loads((HERE / "RULES.json").read_text(encoding="utf-8"))
        model = rules.get("model")
        cmd = [x.replace("{model}", model).replace("{prompt}", "ответь словом OK") for x in rules["agent_cmd"]]
        say("cmd=" + json.dumps(cmd, ensure_ascii=False))
        code, out = run(cmd, env, 120)
        say(f"opencode exit={code}\n" + out[-1500:])
        return 0 if code == 0 and "OK" in out else 1

    codes = {"a-baseline": stage("a-baseline", stage_a), "b-reference": stage("b-reference", stage_b)}
    if a.skip_opencode:
        codes["c-opencode"] = "skipped"
    else:
        codes["c-opencode"] = stage("c-opencode", stage_c)
    shutil.rmtree(tmp, ignore_errors=True)
    say("SUMMARY " + json.dumps(codes) + (" MISMATCHES=" + ",".join(bad) if bad else ""))
    return 0 if all(v in (0, "skipped") for v in codes.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
