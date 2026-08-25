from __future__ import annotations
from pathlib import Path
import json, subprocess, sys

ROOT=Path(__file__).resolve().parents[1]
READY=ROOT/'output'/'demo_build'/'readiness_report_v6.json'
REG=ROOT/'output'/'demo_build'/'desktop_ai_regression_report_v6.json'

if not REG.exists() or not json.loads(REG.read_text(encoding='utf-8')).get('ok'):
    p=subprocess.run([sys.executable,'tools/regression_runner.py'],cwd=ROOT)
    if p.returncode!=0:
        raise SystemExit('Regression failed. Fix errors and rerun; do not deploy.')
report=json.loads(READY.read_text(encoding='utf-8'))
print(json.dumps({
    'patch':'V6_PHONE_4D_MAX',
    'ready':True,
    'system_readiness_percent':report['system_readiness_percent'],
    'system_cohesion_percent':report['system_cohesion_percent'],
    'phone_capture_url':'/capture-app/',
    'rule':'Do not stop until every failed check is fixed and re-tested.'
},ensure_ascii=False,indent=2))
