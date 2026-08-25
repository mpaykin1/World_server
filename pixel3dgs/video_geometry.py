from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import math
import cv2
import numpy as np

from .depth_cpu import NeuralDepthCPU, blend_relative_depth
from .character_cpu import CharacterConfig, character_orbit_cameras
from .advanced_features_cpu import dense_flow_correspondences
from .model_manager import resolve_model
from .matcher_onnx import PairMatcherONNX


@dataclass
class PerspectiveConfig:
    fov_deg: float = 70.0
    space_step_m: float = 0.42
    camera_height_m: float = 1.65
    near_distance_m: float = 0.35
    far_distance_m: float = 45.0
    neural_depth_strength: float = 0.44
    min_confidence: float = 0.14


def _K(w:int,h:int,fov_deg:float)->np.ndarray:
    f=0.5*w/math.tan(math.radians(fov_deg)*0.5)
    return np.array([[f,0,(w-1)*0.5],[0,f,(h-1)*0.5],[0,0,1]],np.float64)


def _gray(frame_rgb:np.ndarray)->np.ndarray:
    return cv2.cvtColor(np.clip(frame_rgb*255,0,255).astype(np.uint8),cv2.COLOR_RGB2GRAY)


def _sift_matches(a:np.ndarray,b:np.ndarray):
    onnx_path=resolve_model('matcher')
    if onnx_path:
        onnx=PairMatcherONNX(onnx_path)
        pts=onnx.match(a,b) if onnx.available else np.empty((0,4),np.float32)
        if len(pts)>=8:
            return pts[:,:2],pts[:,2:],int(len(pts))
    sift=cv2.SIFT_create(nfeatures=3000)
    ka,da=sift.detectAndCompute(a,None);kb,db=sift.detectAndCompute(b,None)
    if da is not None and db is not None and len(ka)>=8 and len(kb)>=8:
        knn=cv2.BFMatcher(cv2.NORM_L2).knnMatch(da,db,k=2)
        good=[m for m,n in knn if m.distance<0.76*n.distance]
        if len(good)>=8:
            p1=np.float32([ka[m.queryIdx].pt for m in good]);p2=np.float32([kb[m.trainIdx].pt for m in good])
            return p1,p2,len(good)
    dense=dense_flow_correspondences(a,b,grid_step=16,max_points=900)
    if len(dense)>=8:return dense[:,:2],dense[:,2:],len(dense)
    return None,None,int(len(dense))


def estimate_space_cameras(frames_rgb:list[np.ndarray],cfg:PerspectiveConfig)->tuple[list[dict],dict]:
    h,w=frames_rgb[0].shape[:2];K=_K(w,h,cfg.fov_deg)
    cams=[{'C':np.array([0,cfg.camera_height_m,0],np.float32),'R':np.eye(3,dtype=np.float32),'source':'vo_start'}]
    reports=[];yaw=0.0;C=np.array([0,cfg.camera_height_m,0],np.float32)
    for i in range(len(frames_rgb)-1):
        p1,p2,nm=_sift_matches(_gray(frames_rgb[i]),_gray(frames_rgb[i+1]))
        ok=False;inliers=0;dyaw=0.0;direction=np.array([0,0,1],np.float32)
        if p1 is not None:
            E,mask=cv2.findEssentialMat(p1,p2,K,method=cv2.RANSAC,prob=.999,threshold=1.4)
            if E is not None:
                try:
                    n,R,t,pm=cv2.recoverPose(E,p1,p2,K)
                    inliers=int(n);ok=inliers>=8
                    dyaw=float(math.atan2(R[0,2],R[2,2]))
                    cc=(-R.T@t).reshape(3).astype(np.float32)
                    cc[1]=0
                    if np.linalg.norm(cc)>.05: direction=cc/np.linalg.norm(cc)
                except cv2.error: pass
        if ok:
            yaw+=float(np.clip(dyaw,-.22,.22))
            cy,sy=math.cos(yaw),math.sin(yaw)
            Ry=np.array([[cy,0,sy],[0,1,0],[-sy,0,cy]],np.float32)
            dw=Ry@direction
            if dw[2]<-0.15:dw=-dw
            C=C+dw*cfg.space_step_m;C[1]=cfg.camera_height_m
            Rw=Ry
        else:
            C=C+np.array([math.sin(yaw),0,math.cos(yaw)],np.float32)*cfg.space_step_m
            cy,sy=math.cos(yaw),math.sin(yaw);Rw=np.array([[cy,0,sy],[0,1,0],[-sy,0,cy]],np.float32)
        cams.append({'C':C.copy(),'R':Rw.copy(),'source':'essential' if ok else 'fallback'})
        reports.append({'pair':[i,i+1],'matches':nm,'inliers':inliers,'ok':ok,'yaw_delta_rad':dyaw})
    # loop-closure drift correction when first and last visibly overlap
    p1,p2,nm=_sift_matches(_gray(frames_rgb[0]),_gray(frames_rgb[-1])) if len(frames_rgb)>5 else (None,None,0)
    loop=False
    if p1 is not None and nm>=30:
        drift=cams[-1]['C']-cams[0]['C']
        if np.linalg.norm(drift)<cfg.space_step_m*len(frames_rgb)*0.7:
            for i,c in enumerate(cams):
                c['C']=c['C']-drift*(i/max(1,len(cams)-1))*0.35
            loop=True
    return cams,{'pairs':reports,'valid_pose_ratio':round(sum(r['ok'] for r in reports)/max(1,len(reports)),4),'loop_closure_used':loop,'first_last_matches':nm}


def pinhole_rays(h:int,w:int,fov_deg:float,R:np.ndarray)->np.ndarray:
    f=0.5*w/math.tan(math.radians(fov_deg)*0.5);cx=(w-1)*.5;cy=(h-1)*.5
    xs=(np.arange(w,dtype=np.float32)-cx)/f;ys=-(np.arange(h,dtype=np.float32)-cy)/f
    xx,yy=np.meshgrid(xs,ys)
    d=np.stack([xx,yy,np.ones_like(xx)],axis=-1);d/=np.maximum(np.linalg.norm(d,axis=-1,keepdims=True),1e-7)
    return (d@R.T).astype(np.float32)


def _perspective_sample(img:np.ndarray,points:np.ndarray,cam:dict,fov_deg:float)->tuple[np.ndarray,np.ndarray]:
    h,w=img.shape[:2];f=0.5*w/math.tan(math.radians(fov_deg)*.5);cx=(w-1)*.5;cy=(h-1)*.5
    q=(points-cam['C'][None,None,None,:])@cam['R']
    z=q[...,2];u=f*q[...,0]/np.maximum(z,1e-6)+cx;v=cy-f*q[...,1]/np.maximum(z,1e-6)
    valid=(z>.05)&(u>=0)&(u<w-1)&(v>=0)&(v<h-1)
    xi=np.clip(np.rint(u),0,w-1).astype(np.int32);yi=np.clip(np.rint(v),0,h-1).astype(np.int32)
    return img[yi,xi],valid


def _space_prior(frame:np.ndarray,rays:np.ndarray,C:np.ndarray,cfg:PerspectiveConfig,neural:NeuralDepthCPU):
    h,w=frame.shape[:2];lum=.2126*frame[...,0]+.7152*frame[...,1]+.0722*frame[...,2]
    gy,gx=np.gradient(lum);edge=np.clip(np.sqrt(gx*gx+gy*gy)/.22,0,1)
    row=np.linspace(0,1,h,dtype=np.float32)[:,None]
    d=8.0+18.0*(1-row)-3.3*edge+3.0*(1-lum)
    d=np.clip(d,cfg.near_distance_m,cfg.far_distance_m)
    floor=(row>.58)&(rays[...,1]<-.04)
    floor=np.broadcast_to(floor,(h,w))
    floor_d=(0-C[1])/np.minimum(rays[...,1],-1e-3)
    d[floor]=np.clip(floor_d[floor],cfg.near_distance_m,cfg.far_distance_m)
    sem=np.zeros((h,w),np.uint8);sem[floor]=1;sem[(row<.17)&(lum<.35)]=2
    rel=neural.predict_relative(frame) if neural.available else None
    d,nstat=blend_relative_depth(d.astype(np.float32),rel,cfg.neural_depth_strength)
    return d.astype(np.float32),sem,nstat


def _character_prior(mask:np.ndarray,rays:np.ndarray,cam:dict,cfg:PerspectiveConfig,char_cfg:CharacterConfig,frame:np.ndarray,neural:NeuralDepthCPU):
    radius=float(np.linalg.norm(cam['C']-np.array([0,char_cfg.target_height_m*.52,0],np.float32)))
    yy,xx=np.indices(mask.shape);ys,xs=np.where(mask>0)
    if len(xs):
        cx=float(np.mean(xs));cy=float(np.mean(ys));rx=max(float(np.ptp(xs))*.55,1);ry=max(float(np.ptp(ys))*.55,1)
        rr=np.clip(((xx-cx)/rx)**2+((yy-cy)/ry)**2,0,2)
    else:rr=np.ones(mask.shape,np.float32)
    d=np.full(mask.shape,radius-.28,np.float32)+.14*np.clip(rr,0,1)
    rel=neural.predict_relative(frame) if neural.available else None
    if rel is not None:
        rel=cv2.resize(rel,(mask.shape[1],mask.shape[0]),interpolation=cv2.INTER_LINEAR)
        r=rel[mask>0]
        if len(r):
            r=(rel-float(np.median(r)))/(float(np.std(r))+1e-6)
            d+=np.clip(r,-2,2)*.08
    return np.clip(d,.2,radius+.5).astype(np.float32),np.zeros(mask.shape,np.uint8),{'used':rel is not None}


def _refine_depth(i,frames,cams,prior,rays,cfg,masks=None):
    factors=np.array([.82,.91,1.,1.09,1.20],np.float32);cand=prior[...,None]*factors
    err=np.zeros_like(cand);valid_count=np.zeros_like(cand)
    source=frames[i][...,None,:]
    neighbors=[]
    for gap in (1,2):
        if i-gap>=0:neighbors.append(i-gap)
        if i+gap<len(frames):neighbors.append(i+gap)
    C=cams[i]['C'];pts=C[None,None,None,:]+rays[...,None,:]*cand[...,None]
    for j in neighbors:
        samp,valid=_perspective_sample(frames[j],pts,cams[j],cfg.fov_deg)
        e=np.mean(np.abs(samp-source),axis=-1)
        if masks is not None:
            # reproject masks using nearest projected coordinates indirectly by sampling a 3-channel mask image
            mm=np.repeat((masks[j][...,None]/255.0).astype(np.float32),3,axis=2)
            ms,mvalid=_perspective_sample(mm,pts,cams[j],cfg.fov_deg)
            valid &= (ms[...,0]>.35)&mvalid
        err+=np.where(valid,e,0);valid_count+=valid.astype(np.float32)
    base_pen=np.abs(np.log(factors))[None,None,:]*.055
    eavg=np.where(valid_count>0,err/np.maximum(valid_count,1)+base_pen,.35+base_pen)
    best=np.argmin(eavg,axis=-1);ref=np.take_along_axis(cand,best[...,None],axis=-1)[...,0]
    be=np.take_along_axis(eavg,best[...,None],axis=-1)[...,0]
    vc=np.take_along_axis(valid_count,best[...,None],axis=-1)[...,0]
    conf=np.clip(np.exp(-be*4.8)*np.clip(vc/2,0.35,1),.04,1)
    return ref.astype(np.float32),conf.astype(np.float32)


def _normals(pmap:np.ndarray,rays:np.ndarray):
    du=np.roll(pmap,-1,axis=1)-np.roll(pmap,1,axis=1);dv=np.roll(pmap,-1,axis=0)-np.roll(pmap,1,axis=0)
    n=np.cross(du,dv);n/=np.maximum(np.linalg.norm(n,axis=-1,keepdims=True),1e-7)
    flip=np.sum(n*rays,axis=-1)>0;n[flip]*=-1;n[0]=n[1];n[-1]=n[-2]
    return n.astype(np.float32)


def reconstruct_perspective(frames_rgb:list[np.ndarray],mode:str,palette:np.ndarray,cfg:PerspectiveConfig,depth_model_path:Path|None=None,masks:list[np.ndarray]|None=None,char_cfg:CharacterConfig|None=None,dynamic_masks:list[np.ndarray]|None=None,external_cameras:list[dict]|None=None,external_pose_report:dict|None=None):
    neural=NeuralDepthCPU(depth_model_path)
    if external_cameras is not None and len(external_cameras)==len(frames_rgb):
        cams=external_cameras;pose_report=external_pose_report or {'mode':'external_pose','valid_pose_ratio':1.0}
    elif mode=='character':
        char_cfg=char_cfg or CharacterConfig();cams=character_orbit_cameras(len(frames_rgb),char_cfg);pose_report={'mode':'character_orbit','valid_pose_ratio':1.0}
    else:
        cams,pose_report=estimate_space_cameras(frames_rgb,cfg)
    allp=[];allc=[];alln=[];allconf=[];allsem=[];allview=[];depth_stats=[]
    for i,frame in enumerate(frames_rgb):
        rays=pinhole_rays(frame.shape[0],frame.shape[1],cfg.fov_deg,cams[i]['R'])
        if mode=='character':prior,sem,nstat=_character_prior(masks[i],rays,cams[i],cfg,char_cfg,frame,neural)
        else:prior,sem,nstat=_space_prior(frame,rays,cams[i]['C'],cfg,neural)
        dep,conf=_refine_depth(i,frames_rgb,cams,prior,rays,cfg,masks if mode=='character' else None)
        pmap=cams[i]['C'][None,None,:]+rays*dep[...,None];norm=_normals(pmap,rays)
        keep=conf>=cfg.min_confidence
        if mode=='character':keep&=(masks[i]>0)
        elif dynamic_masks is not None:keep&=(dynamic_masks[i]==0)
        # remove strongly clipped pixels
        lum=.2126*frame[...,0]+.7152*frame[...,1]+.0722*frame[...,2];keep&=(lum>.008)
        allp.append(pmap[keep]);allc.append(frame[keep]);alln.append(norm[keep]);allconf.append(conf[keep]);allsem.append(sem[keep]);allview.append(np.full(int(np.sum(keep)),i,np.int16))
        depth_stats.append({'median':float(np.median(dep[keep])) if np.any(keep) else 0,'confidence_mean':float(np.mean(conf[keep])) if np.any(keep) else 0,'neural':nstat})
    colors=np.concatenate(allc).astype(np.float32)
    # palette assignment in batches
    q=np.empty_like(colors);batch=20000
    for s in range(0,len(colors),batch):
        c=colors[s:s+batch];d=c[:,None,:]-palette[None,:,:];q[s:s+batch]=palette[np.argmin(np.sum(d*d,axis=2),axis=1)]
    return {
        'points':np.concatenate(allp).astype(np.float32),'colors':q,'normals':np.concatenate(alln).astype(np.float32),
        'confidence':np.concatenate(allconf).astype(np.float32),'semantic':np.concatenate(allsem).astype(np.uint8),
        'views':np.concatenate(allview).astype(np.int16),'cameras':cams,'pose_report':pose_report,'depth_stats':depth_stats,
        'neural_depth_available':neural.available,
    }
