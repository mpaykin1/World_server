from __future__ import annotations
import argparse,json
from ai3d.texture_runtime_v10 import optimize_scene_quality
p=argparse.ArgumentParser(); p.add_argument('options_json'); p.add_argument('--budgets-json'); a=p.parse_args(); opts=json.load(open(a.options_json,encoding='utf-8')); budgets=json.load(open(a.budgets_json,encoding='utf-8')) if a.budgets_json else {}; r=optimize_scene_quality(opts,budgets); print(json.dumps(r,indent=2)); raise SystemExit(0 if r.get('withinBudget') else 2)
