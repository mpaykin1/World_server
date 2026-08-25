from __future__ import annotations
import argparse, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ai3d.texture_runtime_v4 import build_camera_heatmap_feedback, read_telemetry_jsonl, retune_runtime_plan

p = argparse.ArgumentParser()
p.add_argument('telemetry')
p.add_argument('--runtime-plan')
p.add_argument('--output', default='texture-camera-feedback-plan.json')
a = p.parse_args()
events = read_telemetry_jsonl(Path(a.telemetry))
runtime = json.loads(Path(a.runtime_plan).read_text(encoding='utf-8')) if a.runtime_plan else None
feedback = build_camera_heatmap_feedback(events, runtime)
result = {'feedback': feedback}
if runtime:
    result['retunedRuntimePlan'] = retune_runtime_plan(runtime, feedback)
Path(a.output).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'ok': True, 'events': len(events), 'sets': feedback['materialSetsObserved'], 'output': a.output}, ensure_ascii=False))
