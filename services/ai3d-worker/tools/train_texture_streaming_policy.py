from __future__ import annotations
import argparse, json
from pathlib import Path
from ai3d.texture_runtime_v4 import build_camera_heatmap_feedback, read_telemetry_jsonl
from ai3d.texture_runtime_v5 import StreamingPolicyStore

def main():
    p=argparse.ArgumentParser(); p.add_argument('telemetry'); p.add_argument('--store',required=True); p.add_argument('--profiles',default='web_desktop,web_mobile,godot_desktop,godot_mobile,roblox'); p.add_argument('--accepted',action='store_true'); p.add_argument('--output')
    a=p.parse_args(); events=read_telemetry_jsonl(Path(a.telemetry)); feedback=build_camera_heatmap_feedback(events); store=StreamingPolicyStore(Path(a.store)); result=store.learn(feedback,[x.strip() for x in a.profiles.split(',') if x.strip()],accepted=a.accepted); result['policy']=store.export()
    text=json.dumps(result,indent=2); print(text)
    if a.output: Path(a.output).write_text(text,encoding='utf-8')
if __name__=='__main__': main()
