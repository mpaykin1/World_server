from __future__ import annotations
from pathlib import Path
import json, math, shutil
import cv2
import numpy as np
from pixel3dgs.video_pipeline import VideoBuildConfig, build_video

BASE=Path(__file__).resolve().parent
TMP=BASE/'output'/'video_self_test_tmp'
if TMP.exists():shutil.rmtree(TMP)
TMP.mkdir(parents=True)
W,H=320,180;fourcc=cv2.VideoWriter_fourcc(*'MJPG')

def make_space(path:Path):
    v=cv2.VideoWriter(str(path),fourcc,15,(W,H))
    for i in range(42):
        img=np.zeros((H,W,3),np.uint8);img[:]=(25,20,18)
        for x in range(0,W,40):cv2.line(img,(x,H),(W//2+(x-W//2)//5,H//2),(90,80,70),1)
        for y in range(H//2,H,18):cv2.line(img,(0,y),(W,y),(70,65,60),1)
        sh=i*2
        for k in range(8):
            x=(k*55-sh)%500-80
            cv2.rectangle(img,(x,35),(x+34,120),(40+10*k,70,110),-1)
            cv2.rectangle(img,(x+7,50),(x+25,70),(200,80,40),-1)
        cv2.putText(img,'SPACE',(12,28),cv2.FONT_HERSHEY_SIMPLEX,.7,(220,220,220),1,cv2.LINE_AA)
        v.write(img)
    v.release()

def make_character(path:Path):
    v=cv2.VideoWriter(str(path),fourcc,15,(W,H))
    for i in range(48):
        img=np.full((H,W,3),(35,45,55),np.uint8)
        for x in range(0,W,32):cv2.line(img,(x,0),(x,H),(45,55,65),1)
        ang=2*math.pi*i/48;cx=W//2+int(6*math.sin(ang));bodyw=int(25+5*abs(math.cos(ang)))
        cv2.circle(img,(cx,45),16,(80,130,210),-1)
        cv2.rectangle(img,(cx-bodyw//2,62),(cx+bodyw//2,125),(70,120,200),-1)
        cv2.line(img,(cx-bodyw//2,72),(cx-35,110),(70,120,200),10);cv2.line(img,(cx+bodyw//2,72),(cx+35,110),(70,120,200),10)
        cv2.line(img,(cx-10,125),(cx-18,168),(65,110,190),11);cv2.line(img,(cx+10,125),(cx+18,168),(65,110,190),11)
        v.write(img)
    v.release()

space=TMP/'space.avi';character=TMP/'character.avi';make_space(space);make_character(character)
results={}
for mode,path in [('space',space),('character',character)]:
    out=TMP/f'build_{mode}'
    r=build_video(VideoBuildConfig(video_path=path,output_dir=out,mode=mode,max_frames=12,min_frames=8,target_fps=2.5,sample_width=96,sample_height=64,palette_size=12,chunk_size_m=5.0,use_poisson_if_available=False,use_surface_completion=True,keep_extracted_frames=False))
    assert r['ok'] and r['mode']==mode
    assert r['lod_counts']['lod0']>=r['lod_counts']['lod1']>=r['lod_counts']['lod2']>0
    assert (out/'viewer_auto.html').exists() and (out/'video_manifest.json').exists()
    if mode=='space':
        assert (out/'collision_proxy.glb').exists() and (out/'navgrid.json').exists() and (out/'hybrid_structure_proxy.glb').exists()
    else:
        assert (out/'character_collision.glb').exists() and (out/'hybrid_character_proxy.glb').exists()
    results[mode]={'quality':r['quality_report']['pipeline_health_percent'],'lod_counts':r['lod_counts']}
report={'ok':True,'tests':results}
(BASE/'output'/'video_self_test_report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
shutil.rmtree(TMP,ignore_errors=True)
