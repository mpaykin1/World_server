#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, math, struct
from pathlib import Path

REQ_PROPS = {"x","y","z","f_dc_0","f_dc_1","f_dc_2","opacity","scale_0","scale_1","scale_2","rot_0","rot_1","rot_2","rot_3"}

def load_json(p: Path):
    return json.loads(p.read_text(encoding='utf-8'))

def parse_ply_header(path: Path) -> dict:
    with path.open('rb') as f:
        header = []
        total = 0
        while True:
            line = f.readline()
            if not line: break
            total += len(line)
            text = line.decode('ascii', errors='replace').rstrip('\r\n')
            header.append(text)
            if text == 'end_header': break
            if total > 1024*1024: break
    fmt = next((x.split(' ',1)[1] for x in header if x.startswith('format ')), None)
    vertex_count = 0
    props = []
    in_vertex = False
    for line in header:
        if line.startswith('element '):
            parts=line.split()
            in_vertex = len(parts)>=3 and parts[1]=='vertex'
            if in_vertex:
                try: vertex_count=int(parts[2])
                except: vertex_count=0
        elif in_vertex and line.startswith('property '):
            parts=line.split()
            if len(parts)>=3: props.append(parts[-1])
    return {"format":fmt,"vertex_count":vertex_count,"properties":props,"header_bytes":total,"header_lines":header}

def audit(output: Path) -> dict:
    manifest_p=output/'GS360_MANIFEST.json'
    transforms_p=output/'dataset'/'transforms.json'
    game_p=output/'game'/'scene.gs360.json'
    if not manifest_p.is_file():
        return {"schema":"world-server.gs360-artifact-audit/v1","pass":False,"status":"MISSING_MANIFEST","score":0}
    m=load_json(manifest_p)
    trained=bool(m.get('quality_contract',{}).get('trained_3dgs'))
    candidates=[]
    if trained:
        art=m.get('artifacts',{}).get('trained')
        if art:
            p=Path(art)
            if p.is_file(): candidates.append(p)
            elif p.is_dir(): candidates += sorted(p.rglob('*.ply'))[-3:]
    seed=output/'game'/'seed_gaussians.ply'
    if seed.is_file(): candidates.append(seed)
    problems=[]
    score=100
    if not transforms_p.is_file(): problems.append('missing_transforms'); score-=20
    if not game_p.is_file(): problems.append('missing_game_manifest'); score-=15
    ply_reports=[]
    if not candidates:
        problems.append('no_ply_artifact'); score-=40
    for p in candidates:
        try:
            h=parse_ply_header(p)
            missing=sorted(REQ_PROPS-set(h['properties']))
            file_size=p.stat().st_size
            plaus=True
            if h['vertex_count']<=0: plaus=False; problems.append(f'zero_vertices:{p.name}'); score-=20
            if missing: plaus=False; problems.append(f'missing_properties:{p.name}:{",".join(missing)}'); score-=15
            if file_size<=h['header_bytes']: plaus=False; problems.append(f'empty_payload:{p.name}'); score-=15
            ply_reports.append({"path":str(p),"size_bytes":file_size,"format":h['format'],"vertex_count":h['vertex_count'],"missing_required_properties":missing,"plausible":plaus})
        except Exception as e:
            problems.append(f'ply_parse_error:{p.name}:{type(e).__name__}')
            score-=20
    frames=0
    if transforms_p.is_file():
        try:
            t=load_json(transforms_p); frames=len(t.get('frames',[]))
            missing_frames=[]
            for fr in t.get('frames',[])[:5000]:
                rel=fr.get('file_path','')
                if rel and not (output/'dataset'/rel).is_file(): missing_frames.append(rel)
            if missing_frames:
                problems.append(f'missing_frame_files:{len(missing_frames)}'); score-=min(25,len(missing_frames))
        except Exception as e:
            problems.append(f'transforms_invalid:{type(e).__name__}'); score-=20
    score=max(0,min(100,score))
    return {
        "schema":"world-server.gs360-artifact-audit/v1",
        "pass":score>=75 and not any(x.startswith(('missing_manifest','no_ply_artifact','zero_vertices','missing_properties','empty_payload')) for x in problems),
        "status":"PASS" if score>=75 and not problems else ("WARN" if score>=60 else "FAIL"),
        "score":score,
        "trained_3dgs":trained,
        "frame_count":frames,
        "ply":ply_reports,
        "problems":problems,
    }

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--output',required=True); a=ap.parse_args()
    out=Path(a.output).expanduser().resolve(); rep=audit(out)
    p=out/'GS360_ARTIFACT_AUDIT.json'; p.write_text(json.dumps(rep,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print(json.dumps(rep,ensure_ascii=False)); return 0 if rep['status']!='FAIL' else 2
if __name__=='__main__': raise SystemExit(main())
