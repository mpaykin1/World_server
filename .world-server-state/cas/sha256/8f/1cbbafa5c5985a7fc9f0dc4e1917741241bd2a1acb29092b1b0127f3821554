from __future__ import annotations
from pathlib import Path
import json, subprocess, sys, time

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output'/'demo_build';OUT.mkdir(parents=True,exist_ok=True)
commands=[
    [sys.executable,'-m','compileall','-q','pixel3dgs','tools','*.py'],
    [sys.executable,'v6_self_test.py'],
    [sys.executable,'self_test.py'],
    [sys.executable,'video_self_test.py'],
]
results=[];ok=True
for cmd in commands:
    # compileall does not expand globs; source dirs above are sufficient and root scripts are tested by execution.
    if '*.py' in cmd: cmd=[x for x in cmd if x!='*.py']
    t=time.time();p=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True);dt=time.time()-t
    item={'command':cmd,'returncode':p.returncode,'seconds':round(dt,2),'stdout':p.stdout[-12000:],'stderr':p.stderr[-12000:]}
    results.append(item)
    if p.returncode!=0: ok=False;break
report={'ok':ok,'results':results,'rule':'Do not stop until every failed check is fixed and the full regression chain is re-run green.'}
path=OUT/'desktop_ai_regression_report_v6.json';path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'ok':ok,'report':str(path)},ensure_ascii=False))
raise SystemExit(0 if ok else 1)
