from __future__ import annotations
import argparse, json
from pathlib import Path
from ai3d.texture_runtime_v4 import build_camera_heatmap_feedback, read_telemetry_jsonl
from ai3d.texture_runtime_v5 import StreamingPolicyStore, promote_streaming_policy_if_verified
from tools.verify_texture_runtime import DEFAULTS, verify


def main():
    p=argparse.ArgumentParser(); p.add_argument('telemetry'); p.add_argument('metrics'); p.add_argument('--store',required=True); p.add_argument('--profiles',default='web_desktop,web_mobile,godot_desktop,godot_mobile,roblox'); p.add_argument('--output')
    p.add_argument('--min-fps',type=float,default=DEFAULTS['minFps']); p.add_argument('--max-p95-frame-ms',type=float,default=DEFAULTS['maxP95FrameMs']); p.add_argument('--max-texture-vram-mb',type=float,default=DEFAULTS['maxTextureVramMB']); p.add_argument('--max-visual-delta',type=float,default=DEFAULTS['maxVisualDelta'])
    a=p.parse_args(); events=read_telemetry_jsonl(Path(a.telemetry)); feedback=build_camera_heatmap_feedback(events); metrics=json.loads(Path(a.metrics).read_text('utf-8'))
    gate=verify(metrics,{'minFps':a.min_fps,'maxP95FrameMs':a.max_p95_frame_ms,'maxTextureVramMB':a.max_texture_vram_mb,'maxVisualDelta':a.max_visual_delta})
    store=StreamingPolicyStore(Path(a.store)); result=promote_streaming_policy_if_verified(store,feedback,[x.strip() for x in a.profiles.split(',') if x.strip()],gate); result['runtimeGate']=gate
    text=json.dumps(result,indent=2); print(text)
    if a.output: Path(a.output).write_text(text,encoding='utf-8')
    raise SystemExit(0 if result['promoted'] else 2)
if __name__=='__main__': main()
