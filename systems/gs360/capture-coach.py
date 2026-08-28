#!/usr/bin/env python3
from __future__ import annotations
import argparse, json
from pathlib import Path

def load(p): return json.loads(p.read_text(encoding='utf-8'))

def plan(output: Path) -> dict:
    m=load(output/'GS360_MANIFEST.json')
    n=int(m.get('source_panorama_count',0) or 0)
    fidelity=0
    q=output/'GS360_QUALITY_REPORT.json'
    if q.is_file(): fidelity=int(load(q).get('reconstruction_fidelity',0) or 0)
    suggestions=[]
    if n<=1:
        suggestions=[
            {"priority":1,"move":"0.8–1.5 m left from the first camera center","why":"adds horizontal parallax and reveals hidden geometry"},
            {"priority":2,"move":"0.8–1.5 m right from the first camera center","why":"balances the baseline and reduces one-sided hallucination"},
            {"priority":3,"move":"0.5–1.0 m forward, keep similar height","why":"improves near/mid-depth separation"}
        ]
    elif n==2:
        suggestions=[
            {"priority":1,"move":"capture a third panorama forming a triangle, not a straight line","why":"improves triangulation stability"},
            {"priority":2,"move":"add a slightly higher/lower viewpoint if vertical structure matters","why":"reduces ceiling/floor ambiguity"}
        ]
    elif fidelity<70:
        suggestions=[
            {"priority":1,"move":"add 1–2 viewpoints near the weakest/occluded region","why":"target the remaining disocclusion holes instead of oversampling the whole scene"}
        ]
    return {
        "schema":"world-server.gs360-capture-plan/v1",
        "source_count":n,
        "current_fidelity":fidelity,
        "need_more_capture":bool(suggestions),
        "suggestions":suggestions,
        "rules":[
            "Do not create fake parallax by only cropping one panorama; translated viewpoints are needed for real geometric leverage.",
            "Keep overlap high and exposure/white balance stable when possible.",
            "For style-first preview, extra capture is optional; for accurate reconstruction it is strongly preferred."
        ]
    }

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--output',required=True);a=ap.parse_args();out=Path(a.output).expanduser().resolve();r=plan(out);p=out/'GS360_CAPTURE_PLAN.json';p.write_text(json.dumps(r,indent=2,ensure_ascii=False)+'\n',encoding='utf-8');print(json.dumps(r,ensure_ascii=False));return 0
if __name__=='__main__': raise SystemExit(main())
