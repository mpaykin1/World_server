from __future__ import annotations
import argparse, json
from pathlib import Path
from ai3d.texture_runtime_v8 import analyze_memory_residency_soak

def main():
    p=argparse.ArgumentParser(); p.add_argument('samples'); p.add_argument('--min-seconds',type=float,default=1800); a=p.parse_args()
    data=json.loads(Path(a.samples).read_text(encoding='utf-8'))
    samples=data.get('samples',data) if isinstance(data,dict) else data
    print(json.dumps(analyze_memory_residency_soak(samples,a.min_seconds),ensure_ascii=False,indent=2))
if __name__=='__main__': main()
