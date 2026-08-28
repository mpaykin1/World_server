from __future__ import annotations
import argparse,json,re,sys
from pathlib import Path
SERVICE_ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(SERVICE_ROOT))
from ai3d.production_v8 import validate_roblox_place_runtime

def main():
    p=argparse.ArgumentParser();p.add_argument('--input',type=Path,required=True);p.add_argument('--upload-result',type=Path);p.add_argument('--output',type=Path,default=Path('roblox-place-verification-v8.json'));a=p.parse_args()
    text=a.input.read_text(encoding='utf-8',errors='replace')
    try:data=json.loads(text)
    except Exception:
        m=re.search(r'\[AI3D_V8_ROBLOX_VERIFY\](\{.*\})',text,re.S)
        if not m:raise SystemExit('No V8 Roblox verification JSON marker found')
        data=json.loads(m.group(1))
    if a.upload_result and a.upload_result.is_file():data['upload']=json.loads(a.upload_result.read_text(encoding='utf-8'))
    report=validate_roblox_place_runtime(data);a.output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2));raise SystemExit(0 if report.get('passed') else 1)
if __name__=='__main__':main()
