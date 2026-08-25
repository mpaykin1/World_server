from __future__ import annotations
import argparse, json
from pathlib import Path
from ai3d.texture_runtime_v7 import evaluate_canary_rollout

p = argparse.ArgumentParser()
p.add_argument('baseline_json')
p.add_argument('candidate_json')
p.add_argument('--current-percent', type=float, default=1.0)
p.add_argument('--out', default='texture-canary-rollout-report.json')
a = p.parse_args()
base = json.loads(Path(a.baseline_json).read_text(encoding='utf-8'))
cand = json.loads(Path(a.candidate_json).read_text(encoding='utf-8'))
report = evaluate_canary_rollout(base, cand, a.current_percent)
Path(a.out).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'ok': True, 'action': report['action'], 'nextPercent': report['nextPercent'], 'out': a.out}))
