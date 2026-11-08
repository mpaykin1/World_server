"""Compute the A/B verdict from results/*.json. No LLM, no judgement calls: the rules are RULES.json "verdict_policy".

  python compare.py [--results results] [--out results/VERDICT.md]
"""
import argparse
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEED_MARGIN = 0.10   # a difference below 10% of arm A's time counts as "same"


def load(results):
    recs = {}
    for p in sorted(Path(results).glob("T*-[AB].json")):
        r = json.loads(p.read_text(encoding="utf-8"))
        recs[(r["task"], r["arm"])] = r
    return recs


def real_agent(r):
    return r.get("agent_pid") is not None and r.get("agent_returncode") is not None and not r.get("start_error")


def pair_status(a, b, rules):
    if a is None or b is None:
        return False, "missing arm"
    why = []
    if a["model_id"] != b["model_id"]:
        why.append("model differs")
    if a["prompt_sha256"] != b["prompt_sha256"]:
        why.append("prompt differs")
    if a["cmdline_full_sha256"] != b["cmdline_full_sha256"]:
        why.append("cmdline differs")
    if a["base_sha256"] != rules["base_sha256"] or b["base_sha256"] != rules["base_sha256"]:
        why.append("baseline hash differs")
    if not real_agent(a) or not real_agent(b):
        why.append("agent process did not run")
    if not (b.get("adk_events") or 0) >= 1:
        why.append("arm B has no ADK events")
    return (not why), "; ".join(why) or "ok"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--results", default=str(HERE / "results"))
    ap.add_argument("--rules", default=str(HERE / "RULES.json"))
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    rules = json.loads(Path(args.rules).read_text(encoding="utf-8"))
    recs = load(args.results)
    tasks = sorted({t for t, _ in recs} | {"T1", "T2", "T3"})

    lines = ["# ADK vs AGES: verdict computed by compare.py", "",
             "| task | pair valid | A pass | B pass | A wall s | B wall s | A diff +/- | B diff +/- | note |", "|---|---|---|---|---|---|---|---|---|"]
    valid = []
    for t in tasks:
        a, b = recs.get((t, "A")), recs.get((t, "B"))
        ok, note = pair_status(a, b, rules)
        f = lambda r, k: ("%s" % r[k]) if r else "n/a"
        d = lambda r: f"+{r['diff_added']}/-{r['diff_removed']}" if r else "n/a"
        lines.append(f"| {t} | {'yes' if ok else 'NO'} | {f(a,'tests_passed') + '/' + f(a,'tests_total') if a else 'n/a'} | {f(b,'tests_passed') + '/' + f(b,'tests_total') if b else 'n/a'} | {f(a,'wall_seconds')} | {f(b,'wall_seconds')} | {d(a)} | {d(b)} | {note} |")
        if ok:
            valid.append((t, a, b))

    n = len(valid)
    b_better = sum(1 for _, a, b in valid if b["acceptance_pass"] and not a["acceptance_pass"])
    b_worse = sum(1 for _, a, b in valid if a["acceptance_pass"] and not b["acceptance_pass"])
    both_pass = [(t, a, b) for t, a, b in valid if a["acceptance_pass"] and b["acceptance_pass"]]
    faster = sum(1 for _, a, b in both_pass if b["wall_seconds"] < a["wall_seconds"] * (1 - SPEED_MARGIN))
    slower = sum(1 for _, a, b in both_pass if b["wall_seconds"] > a["wall_seconds"] * (1 + SPEED_MARGIN))

    if n < 3:
        verdict = "INCONCLUSIVE"
        reason = f"only {n} valid pair(s); at least 3 are required"
    elif b_better > b_worse:
        verdict = "ADK_BETTER_QUALITY_TENTATIVE"
        reason = f"arm B passed acceptance where arm A did not in {b_better} pair(s); the reverse in {b_worse}"
    elif b_worse > b_better:
        verdict = "ADK_WORSE_QUALITY"
        reason = f"arm A passed acceptance where arm B did not in {b_worse} pair(s); the reverse in {b_better}"
    elif both_pass and faster >= 2 and slower == 0:
        verdict = "ADK_FASTER_TENTATIVE"
        reason = f"equal quality; B faster by >{int(SPEED_MARGIN*100)}% in {faster} of {len(both_pass)} pairs, never slower"
    elif both_pass and slower >= 2 and faster == 0:
        verdict = "ADK_SLOWER"
        reason = f"equal quality; B slower by >{int(SPEED_MARGIN*100)}% in {slower} of {len(both_pass)} pairs, never faster"
    else:
        verdict = "NO_CLEAR_DIFFERENCE"
        reason = f"quality equal or mixed (B better {b_better}, B worse {b_worse}); speed mixed (B faster {faster}, slower {slower})"

    lines += ["", f"**VERDICT: {verdict}**", "", f"Reason: {reason}.", "",
              f"Valid pairs: {n} of 3. Tokens and cost: UNKNOWN unless observed. With n = 3 this is a tentative signal, not a statistical claim.",
              "ADK is promoted only if there are no regressions, equal or better independent QA and a reproducible gain; this file alone never authorises changing the five production roles."]
    text = "\n".join(lines) + "\n"
    print(text)
    out = Path(args.out) if args.out else Path(args.results) / "VERDICT.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
