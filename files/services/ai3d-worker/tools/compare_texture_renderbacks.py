from __future__ import annotations
import argparse, json, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from ai3d.renderback_compare import compare_renderbacks
p=argparse.ArgumentParser(); p.add_argument('before'); p.add_argument('after'); p.add_argument('--output'); a=p.parse_args()
result=compare_renderbacks(Path(a.before),Path(a.after))
text=json.dumps(result,ensure_ascii=False,indent=2)
if a.output: Path(a.output).write_text(text,encoding='utf-8')
print(text)
