from __future__ import annotations
import argparse, json
from pathlib import Path
from ai3d.texture_runtime_v8 import classify_regression_root_cause

def load(path): return json.loads(Path(path).read_text(encoding='utf-8'))
def main():
    p=argparse.ArgumentParser(); p.add_argument('--baseline',required=True); p.add_argument('--candidate',required=True); p.add_argument('--signals'); a=p.parse_args()
    print(json.dumps(classify_regression_root_cause(load(a.baseline),load(a.candidate),load(a.signals) if a.signals else {}),ensure_ascii=False,indent=2))
if __name__=='__main__': main()
