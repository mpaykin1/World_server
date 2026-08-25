from __future__ import annotations
from pathlib import Path
import math
import shutil
import subprocess
import json
import cv2
import numpy as np
from PIL import Image


def colmap_available() -> bool:
    return shutil.which("colmap") is not None


def _face_rotation(name: str) -> np.ndarray:
    # local camera: +z forward, +x right, +y up
    if name == "front":
        f=np.array([0,0,1.],np.float32); up=np.array([0,1.,0],np.float32)
    elif name == "right":
        f=np.array([1.,0,0],np.float32); up=np.array([0,1.,0],np.float32)
    elif name == "back":
        f=np.array([0,0,-1.],np.float32); up=np.array([0,1.,0],np.float32)
    elif name == "left":
        f=np.array([-1.,0,0],np.float32); up=np.array([0,1.,0],np.float32)
    elif name == "top":
        f=np.array([0,1.,0],np.float32); up=np.array([0,0,-1.],np.float32)
    else:
        f=np.array([0,-1.,0],np.float32); up=np.array([0,0,1.],np.float32)
    right=np.cross(up,f); right/=np.linalg.norm(right)+1e-8
    up=np.cross(f,right); up/=np.linalg.norm(up)+1e-8
    return np.stack([right,up,f],axis=1)


def equirect_to_face(arr: np.ndarray, face: str, size: int = 512) -> np.ndarray:
    h,w,_=arr.shape
    xy=(np.arange(size,dtype=np.float32)+0.5)/size*2-1
    xx,yy=np.meshgrid(xy,-xy,indexing="xy")
    local=np.stack([xx,yy,np.ones_like(xx)],axis=-1)
    local/=np.maximum(np.linalg.norm(local,axis=-1,keepdims=True),1e-8)
    rot=_face_rotation(face)
    d=local@rot.T
    theta=np.arctan2(d[...,0],d[...,2])
    phi=np.arcsin(np.clip(d[...,1],-1,1))
    mapx=((theta/(2*math.pi)+0.5)%1.0*w).astype(np.float32)
    mapy=(np.clip(0.5-phi/math.pi,0,0.999999)*h).astype(np.float32)
    src=np.clip(arr*255,0,255).astype(np.uint8)
    return cv2.remap(src,mapx,mapy,cv2.INTER_LANCZOS4,borderMode=cv2.BORDER_WRAP)


def prepare_perspective_faces(image_dir: Path, work_dir: Path, face_size: int = 512) -> tuple[Path, dict]:
    out=work_dir/"perspective_faces"; out.mkdir(parents=True,exist_ok=True)
    files=[p for p in sorted(image_dir.iterdir()) if p.suffix.lower() in {".png",".jpg",".jpeg",".webp"}]
    mapping={}
    faces=("front","right","back","left","top","bottom")
    for pi,p in enumerate(files):
        arr=np.asarray(Image.open(p).convert("RGB"),dtype=np.float32)/255.0
        mapping[p.name]=[]
        for face in faces:
            im=equirect_to_face(arr,face,face_size)
            fn=f"p{pi:04d}_{face}.jpg"
            cv2.imwrite(str(out/fn),cv2.cvtColor(im,cv2.COLOR_RGB2BGR),[int(cv2.IMWRITE_JPEG_QUALITY),95])
            mapping[p.name].append(fn)
    (work_dir/"face_mapping.json").write_text(json.dumps(mapping,ensure_ascii=False,indent=2),encoding="utf-8")
    return out,mapping


def _commands(face_dir: Path, work_dir: Path):
    db=work_dir/"database.db"; sparse=work_dir/"sparse"; sparse.mkdir(parents=True,exist_ok=True)
    return [
        ["colmap","feature_extractor","--database_path",str(db),"--image_path",str(face_dir),"--ImageReader.single_camera","1","--SiftExtraction.use_gpu","0"],
        ["colmap","sequential_matcher","--database_path",str(db),"--SiftMatching.use_gpu","0","--SequentialMatching.overlap","12"],
        ["colmap","mapper","--database_path",str(db),"--image_path",str(face_dir),"--output_path",str(sparse)],
    ]


def _run(cmd):
    p=subprocess.run(cmd,capture_output=True,text=True)
    return {"command":cmd,"returncode":p.returncode,"stdout":p.stdout[-6000:],"stderr":p.stderr[-6000:]}


def _quat_to_rot(qw,qx,qy,qz):
    q=np.array([qw,qx,qy,qz],np.float64); q/=np.linalg.norm(q)+1e-12
    w,x,y,z=q
    return np.array([
        [1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
        [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
        [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]],np.float64)


def _parse_images_txt(path: Path):
    rows={}
    if not path.exists():return rows
    lines=path.read_text(encoding="utf-8",errors="ignore").splitlines()
    for idx,line in enumerate(lines):
        if not line or line.startswith("#") or idx%2==1: continue
        parts=line.split()
        if len(parts)<10:continue
        try:
            _,qw,qx,qy,qz,tx,ty,tz,_,name=parts[:10]
            R=_quat_to_rot(*map(float,[qw,qx,qy,qz])); t=np.array(list(map(float,[tx,ty,tz])))
            C=-R.T@t
            rows[name]={"center":C,"R":R}
        except Exception:pass
    return rows


def _panorama_poses_from_faces(rows: dict, mapping: dict, desired_spacing: float = 1.8, height: float = 1.65):
    centers=[]; names=[]
    for pname,faces in mapping.items():
        cs=[rows[f]["center"] for f in faces if f in rows]
        if not cs: continue
        centers.append(np.mean(cs,axis=0)); names.append(pname)
    if len(centers)<2:return None
    C=np.asarray(centers,np.float64)
    # Align arbitrary COLMAP frame to a stable capture-path frame with PCA.
    C0=C-C.mean(axis=0,keepdims=True)
    _,_,vt=np.linalg.svd(C0,full_matrices=False)
    zaxis=vt[0]; yaxis=np.array([0,1.,0])
    # choose a secondary axis from PCA but force orthogonality
    xaxis=vt[1]; xaxis=xaxis-zaxis*np.dot(xaxis,zaxis); xaxis/=np.linalg.norm(xaxis)+1e-8
    yaxis=np.cross(zaxis,xaxis); yaxis/=np.linalg.norm(yaxis)+1e-8
    aligned=np.stack([C0@xaxis,C0@yaxis,C0@zaxis],axis=1)
    steps=np.linalg.norm(np.diff(aligned[:,[0,2]],axis=0),axis=1)
    med=float(np.median(steps[steps>1e-6])) if np.any(steps>1e-6) else 1.0
    aligned*=desired_spacing/max(med,1e-6)
    aligned[:,1]=height
    yaws=[]
    for i in range(len(aligned)):
        if i+1<len(aligned): d=aligned[i+1]-aligned[i]
        else:d=aligned[i]-aligned[i-1]
        yaws.append(float(math.atan2(d[0],d[2])))
    return {"names":names,"poses":[[float(aligned[i,0]),float(height),float(aligned[i,2]),yaws[i]] for i in range(len(aligned))]}


def run_colmap_cpu(image_dir: Path, work_dir: Path, desired_spacing: float = 1.8, height: float = 1.65) -> dict:
    if not colmap_available():
        return {"available":False,"ran":False,"reason":"COLMAP executable not found"}
    work_dir.mkdir(parents=True,exist_ok=True)
    face_dir,mapping=prepare_perspective_faces(image_dir,work_dir)
    logs=[]
    for cmd in _commands(face_dir,work_dir):
        r=_run(cmd); logs.append(r)
        if r["returncode"]!=0:
            return {"available":True,"ran":True,"ok":False,"stage":cmd[1],"logs":logs}
    models=sorted((work_dir/"sparse").glob("*"))
    if not models:
        return {"available":True,"ran":True,"ok":False,"reason":"mapper produced no model","logs":logs}
    model=models[0]
    ba=["colmap","bundle_adjuster","--input_path",str(model),"--output_path",str(model),"--BundleAdjustment.refine_principal_point","0"]
    logs.append(_run(ba))
    text_dir=work_dir/"model_text"; text_dir.mkdir(exist_ok=True)
    conv=["colmap","model_converter","--input_path",str(model),"--output_path",str(text_dir),"--output_type","TXT"]
    logs.append(_run(conv))
    rows=_parse_images_txt(text_dir/"images.txt")
    pano=_panorama_poses_from_faces(rows,mapping,desired_spacing,height)
    registered=len(rows)
    return {"available":True,"ran":True,"ok":bool(pano),"registered_faces":registered,"panorama_pose_solution":pano,"logs":logs}
