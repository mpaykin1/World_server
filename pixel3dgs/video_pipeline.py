from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Callable, Literal
import json
import math
import shutil

import cv2
import numpy as np

from .video_ingest import VideoIngestConfig, extract_keyframes
from .video_geometry import PerspectiveConfig, reconstruct_perspective, estimate_space_cameras
from .character_cpu import CharacterConfig, segment_character_frames, export_character_collision
from .hybrid_mesh import build_space_planar_proxy, build_character_hull_proxy
from .depth_cpu import NeuralDepthCPU
from .surface_completion import manhattan_optimize, tangent_gap_completion, surfel_fusion_relax, sparse_tsdf_completion, optional_poisson_mesh
from .viewer_ewa import write_ewa_viewer
from . import pipeline_base as b
from .pipeline import build_scene, BuildConfig as PanoramaBuildConfig, _covariance6
from .capture_pose import fuse_capture_poses
from .model_manager import resolve_model
from .dynamic4d_cpu import build_character_temporal_tracks
from .semantic_cpu import combine_dynamic_and_semantic


@dataclass
class VideoBuildConfig:
    video_path: Path
    output_dir: Path
    mode: Literal['auto','space','character'] = 'auto'
    max_frames: int = 72
    min_frames: int = 12
    target_fps: float = 2.5
    sample_width: int = 192
    sample_height: int = 108
    palette_size: int = 24
    voxel_size: float | None = None
    chunk_size_m: float = 8.0
    fov_deg: float = 70.0
    camera_height_m: float = 1.65
    space_step_m: float = 0.42
    character_height_m: float = 1.75
    character_camera_radius_m: float = 2.8
    character_orbit_degrees: float = 360.0
    segmentation_model_path: str | None = None
    depth_model_path: str | None = None
    use_dynamic_masking: bool = True
    use_surface_completion: bool = True
    use_poisson_if_available: bool = True
    keep_extracted_frames: bool = True
    capture_pose_path: str | None = None
    auto_optional_models: bool = True
    semantic_model_path: str | None = None
    build_dynamic_4d_tracks: bool = True


def _load_frames(folder: Path, w:int,h:int)->list[np.ndarray]:
    files=sorted(folder.glob('frame_*.png'));out=[]
    for p in files:
        im=cv2.imread(str(p),cv2.IMREAD_COLOR)
        if im is None:continue
        im=cv2.resize(im,(w,h),interpolation=cv2.INTER_AREA)
        out.append(cv2.cvtColor(im,cv2.COLOR_BGR2RGB).astype(np.float32)/255.0)
    return out


def _global_palette(frames:list[np.ndarray],n:int)->np.ndarray:
    return b._global_palette(frames,n)


def _dynamic_masks(frames_rgb:list[np.ndarray])->tuple[list[np.ndarray],dict]:
    """Conservative motion/outlier masks after homography compensation.

    It removes only very high residual motion, leaving most parallax/static edges intact.
    """
    n=len(frames_rgb);masks=[np.zeros(frames_rgb[0].shape[:2],np.uint8) for _ in frames_rgb]
    ratios=[];valid_pairs=0
    for i in range(n-1):
        a=np.clip(frames_rgb[i]*255,0,255).astype(np.uint8);c=np.clip(frames_rgb[i+1]*255,0,255).astype(np.uint8)
        ga=cv2.cvtColor(a,cv2.COLOR_RGB2GRAY);gb=cv2.cvtColor(c,cv2.COLOR_RGB2GRAY)
        orb=cv2.ORB_create(nfeatures=1800);ka,da=orb.detectAndCompute(ga,None);kb,db=orb.detectAndCompute(gb,None)
        if da is None or db is None:continue
        knn=cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(da,db,k=2);good=[x for x,y in knn if x.distance<.72*y.distance]
        if len(good)<18:continue
        p1=np.float32([ka[x.queryIdx].pt for x in good]);p2=np.float32([kb[x.trainIdx].pt for x in good])
        H,inl=cv2.findHomography(p2,p1,cv2.RANSAC,3.0)
        if H is None:continue
        warped=cv2.warpPerspective(c,H,(a.shape[1],a.shape[0]),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT)
        diff=np.mean(np.abs(a.astype(np.float32)-warped.astype(np.float32)),axis=2)/255.0
        # robust threshold: only extreme residuals become dynamic candidates
        med=float(np.median(diff));mad=float(np.median(np.abs(diff-med))+1e-6);thr=max(.22,med+5.5*mad)
        mask=(diff>thr).astype(np.uint8)*255
        mask=cv2.morphologyEx(mask,cv2.MORPH_OPEN,np.ones((3,3),np.uint8));mask=cv2.dilate(mask,np.ones((3,3),np.uint8),iterations=1)
        # cap removal to 12% of image to avoid destroying architecture under parallax
        if np.mean(mask>0)>.12:
            q=np.quantile(diff,.91);mask=(diff>max(q,thr)).astype(np.uint8)*255
        masks[i]=cv2.bitwise_or(masks[i],mask);ratios.append(float(np.mean(mask>0)));valid_pairs+=1
    if n>1:masks[-1]=masks[-2].copy()
    return masks,{'valid_pairs':valid_pairs,'masked_ratio_mean':round(float(np.mean(ratios)) if ratios else 0.0,4),'method':'homography_residual_conservative'}


def _auto_voxel_video(raw:dict,cfg:VideoBuildConfig,mode:str)->float:
    if cfg.voxel_size is not None:return float(cfg.voxel_size)
    p=raw['points'];center=np.median(p,axis=0);med=float(np.median(np.linalg.norm(p-center,axis=1)))
    footprint=2*max(med,.2)*math.tan(math.radians(cfg.fov_deg)/2)/max(cfg.sample_width,64)
    return float(np.clip(footprint*(1.2 if mode=='space' else .72),.018 if mode=='character' else .06,.18 if mode=='character' else .48))


def _normalize_character(scene:dict,target_height:float,voxel:float)->tuple[dict,dict]:
    p=scene['points'];mn=np.percentile(p,2,axis=0);mx=np.percentile(p,98,axis=0);h=float(mx[1]-mn[1])
    if h<=1e-4:return scene,{'scaled':False}
    s=target_height/h
    center=np.array([(mn[0]+mx[0])/2,mn[1],(mn[2]+mx[2])/2],np.float32)
    scene=dict(scene);scene['points']=(scene['points']-center)*s;scene['points'][:,1]+=0.0
    scene['scale_u']=scene['scale_u']*s;scene['scale_v']=scene['scale_v']*s
    scene['keys']=np.floor(scene['points']/(voxel*s)).astype(np.int32)
    return scene,{'scaled':True,'scale_factor':round(float(s),5),'source_height_m':round(h,5),'target_height_m':target_height}


def _quality_video(ingest,raw,scene,mode,pose_report,seg_report,dynamic_report,voxel,hybrid,poisson)->dict:
    recs=ingest['frames'];blur=float(np.mean([r['blur'] for r in recs]));fq=float(np.mean([r['quality'] for r in recs]))
    conf=float(np.mean(scene['confidence']));support=float(np.mean(scene['view_support']));pose=float(pose_report.get('valid_pose_ratio',1 if mode=='character' else 0))
    capture=np.clip(.42*fq+.28*np.clip(blur/130,0,1)+.30*np.clip(len(recs)/36,0,1),0,1)
    geometry=np.clip(.32*conf+.26*np.clip((support-1)/2,0,1)+.27*pose+.15*(1 if hybrid.get('ok') else .4),0,1)
    if mode=='character' and seg_report:
        geometry*=float(np.clip(.72+.28*np.clip(seg_report.get('foreground_area_mean',.3)/.3,0,1),.7,1))
    health=100*(.45*capture+.55*geometry)
    return {
        'pipeline_health_percent':round(float(np.clip(health,0,100)),1),
        'capture_quality_percent':round(float(capture*100),1),
        'mode':mode,'selected_frames':len(recs),'mean_blur':round(blur,2),'mean_frame_quality':round(fq,4),
        'multiview_confidence_mean':round(conf,4),'multi_camera_support_mean':round(support,4),'pose_valid_ratio':round(pose,4),
        'raw_points':int(len(raw['points'])),'final_splats':int(len(scene['points'])),'voxel_size_m':round(float(voxel),5),
        'segmentation':seg_report,'dynamic_masking':dynamic_report,'hybrid_mesh':hybrid,'poisson':poisson,
        'notes':['Video quality score is measured separately from engineering readiness.','Character mode assumes the subject is mostly rigid while the camera or subject rotates around a common center.']
    }


def build_video(cfg:VideoBuildConfig,progress:Callable[[str,float],None]|None=None)->dict:
    cfg.video_path=Path(cfg.video_path);cfg.output_dir=Path(cfg.output_dir);cfg.output_dir.mkdir(parents=True,exist_ok=True)
    work=cfg.output_dir/'video_work';work.mkdir(exist_ok=True)
    ingest=extract_keyframes(cfg.video_path,work,VideoIngestConfig(mode=cfg.mode,max_frames=cfg.max_frames,min_frames=cfg.min_frames,target_fps=cfg.target_fps),progress)
    mode=ingest['resolved_mode'];meta=ingest['video']
    if cfg.auto_optional_models:
        if not cfg.depth_model_path:
            auto_depth=resolve_model('depth'); cfg.depth_model_path=str(auto_depth) if auto_depth else None
        if not cfg.segmentation_model_path:
            auto_seg=resolve_model('segmentation'); cfg.segmentation_model_path=str(auto_seg) if auto_seg else None
        if not cfg.semantic_model_path:
            auto_sem=resolve_model('segmentation'); cfg.semantic_model_path=str(auto_sem) if auto_sem else None
    if progress:progress('mode_resolved_'+mode,.24)

    # True 360 moving-space video can reuse the mature panorama backend after automatic keyframing.
    if mode=='space' and meta.get('is_equirectangular_360'):
        pano_out=cfg.output_dir/'scene'
        result=build_scene(PanoramaBuildConfig(input_dir=Path(ingest['frames_dir']),output_dir=pano_out,camera_spacing_m=cfg.space_step_m,sample_width=cfg.sample_width,sample_height=max(64,cfg.sample_width//2),palette_size=cfg.palette_size,voxel_size=cfg.voxel_size,chunk_size_m=cfg.chunk_size_m,depth_model_path=cfg.depth_model_path))
        vm={'version':'4.0-video','video_mode':'space_360','video_ingest':ingest,'scene_result':result}
        (cfg.output_dir/'video_manifest.json').write_text(json.dumps(vm,ensure_ascii=False,indent=2),encoding='utf-8')
        if progress:progress('complete',1.0)
        return {'ok':True,'mode':'space_360','output_dir':str(cfg.output_dir),'scene':result,'video_manifest':str(cfg.output_dir/'video_manifest.json')}

    frames=_load_frames(Path(ingest['frames_dir']),cfg.sample_width,cfg.sample_height)
    if len(frames)<cfg.min_frames:raise RuntimeError('Too few decoded keyframes after resize')
    palette=_global_palette(frames,cfg.palette_size)
    masks=None;seg_report=None;dynamic_report={'used':False};dynamic4d_report={'ok':False,'reason':'not_character_or_disabled'}
    char_cfg=None
    if mode=='character':
        bgr=[cv2.cvtColor(np.clip(f*255,0,255).astype(np.uint8),cv2.COLOR_RGB2BGR) for f in frames]
        char_cfg=CharacterConfig(target_height_m=cfg.character_height_m,camera_radius_m=cfg.character_camera_radius_m,orbit_degrees=cfg.character_orbit_degrees,segmentation_model_path=cfg.segmentation_model_path)
        masks,seg_report=segment_character_frames(bgr,char_cfg)
        mask_dir=work/'masks';mask_dir.mkdir(exist_ok=True)
        for i,m in enumerate(masks):cv2.imwrite(str(mask_dir/f'mask_{i:04d}.png'),m)
        if cfg.build_dynamic_4d_tracks:
            dynamic4d_report=build_character_temporal_tracks(bgr,masks,cfg.output_dir/'dynamic4d')
    elif cfg.use_dynamic_masking:
        masks_dynamic,dynamic_report=_dynamic_masks(frames);dynamic_report['used']=True
        masks_dynamic,semantic_report=combine_dynamic_and_semantic(masks_dynamic,frames,cfg.semantic_model_path)
        dynamic_report['semantic']=semantic_report
    else:masks_dynamic=None
    if progress:progress('masks_ready',.35)

    depth_path=Path(cfg.depth_model_path) if cfg.depth_model_path else None
    pcfg=PerspectiveConfig(fov_deg=cfg.fov_deg,space_step_m=cfg.space_step_m,camera_height_m=cfg.camera_height_m,neural_depth_strength=.44,min_confidence=.14)
    external_cameras=None;external_pose_report=None
    if mode=='space' and cfg.capture_pose_path:
        base_cameras,base_pose_report=estimate_space_cameras(frames,pcfg)
        external_cameras,sensor_report=fuse_capture_poses(base_cameras,ingest['frames'],cfg.capture_pose_path)
        external_pose_report=dict(base_pose_report);external_pose_report['sensor_fusion']=sensor_report
        if sensor_report.get('used'):
            external_pose_report['mode']='visual_odometry_plus_phone_sensors'
            external_pose_report['valid_pose_ratio']=max(float(base_pose_report.get('valid_pose_ratio',0)),float(sensor_report.get('coverage_ratio',0)))
    raw=reconstruct_perspective(frames,mode,palette,pcfg,depth_path,masks,char_cfg,masks_dynamic if mode=='space' and cfg.use_dynamic_masking else None,external_cameras,external_pose_report)
    if progress:progress('perspective_reconstruction',.58)
    voxel=_auto_voxel_video(raw,cfg,mode)
    scene=b._merge_voxels(raw['points'],raw['colors'],raw['normals'],raw['confidence'],raw['semantic'],raw['views'],voxel,True)
    scene,fill1=b._fill_single_voxel_holes(scene,voxel,.06 if mode=='space' else .035)
    completion={}
    if cfg.use_surface_completion:
        scene,surfel=surfel_fusion_relax(scene,voxel,2);completion['surfel']=surfel
        if mode=='space':
            scene,manhattan=manhattan_optimize(scene,voxel);completion['manhattan']=manhattan
            scene,fill2=tangent_gap_completion(scene,voxel,.035);completion['tangent_fill']=fill2
            scene,tsdf=sparse_tsdf_completion(raw,np.array([[*c['C'],0] for c in raw['cameras']],np.float32),scene,voxel,.02);completion['tsdf']=tsdf
    norm_report=None
    if mode=='character':scene,norm_report=_normalize_character(scene,cfg.character_height_m,voxel);voxel=voxel*(norm_report.get('scale_factor',1.0) if norm_report else 1.0)
    planes=b._plane_report(scene,voxel)
    if progress:progress('surface_completion',.72)

    poisson={'available':False,'ran':False}
    if cfg.use_poisson_if_available:poisson=optional_poisson_mesh(scene,cfg.output_dir/'poisson_proxy.ply',depth=8)
    if mode=='space':
        hybrid=build_space_planar_proxy(scene,planes,voxel,cfg.output_dir/'hybrid_structure_proxy.glb')
        b._collision_and_nav(scene,cfg.output_dir,planes,voxel)
    else:
        hybrid=build_character_hull_proxy(scene,cfg.output_dir/'hybrid_character_proxy.glb')
        char_collision=export_character_collision(scene,cfg.output_dir/'character_collision.glb',cfg.character_height_m)
        (cfg.output_dir/'character_collision.json').write_text(json.dumps(char_collision,ensure_ascii=False,indent=2),encoding='utf-8')
    if progress:progress('proxy_geometry',.82)

    lod0=scene;lod1=b._lod(scene,voxel,1.7);lod2=b._lod(scene,voxel,2.7);lods={'lod0':lod0,'lod1':lod1,'lod2':lod2}
    for name,s in lods.items():
        b._write_ply(cfg.output_dir/f'scene_{name}.ply',s);np.savez_compressed(cfg.output_dir/f'covariance_{name}.npz',covariance6=_covariance6(s))
    chunks={name:b._chunks(s,cfg.output_dir,name,cfg.chunk_size_m) for name,s in lods.items()}
    quality=_quality_video(ingest,raw,lod0,mode,raw['pose_report'],seg_report,dynamic_report,voxel,hybrid,poisson)
    quality['dynamic4d']=dynamic4d_report
    quality['optional_models']={'depth':cfg.depth_model_path,'segmentation':cfg.segmentation_model_path,'semantic':cfg.semantic_model_path}
    quality['capture_pose_path']=cfg.capture_pose_path
    manifest={
        'version':'6.0-cpu-video-phone-4d-max','source_video':str(cfg.video_path),'mode':mode,'video_ingest':ingest,
        'camera_track':[{'C':c['C'].tolist(),'R':c['R'].tolist(),'source':c.get('source')} for c in raw['cameras']],
        'pose_report':raw['pose_report'],'depth_stats':raw['depth_stats'],'palette_rgb255':np.clip(palette*255,0,255).astype(int).tolist(),
        'voxel_size_m':float(voxel),'lod_counts':{k:int(len(v['points'])) for k,v in lods.items()},'chunks':chunks,'planes':planes,
        'character_normalization':norm_report,'surface_completion':completion,'hybrid_mesh':hybrid,'dynamic4d':dynamic4d_report,'capture_pose_path':cfg.capture_pose_path,
        'features':{
            'video_ingest':True,'automatic_keyframe_selection':True,'blur_exposure_duplicate_filter':True,'scene_cut_detection':True,
            'auto_space_character_mode':True,'equirectangular_360_video_route':True,'perspective_video_reconstruction':True,
            'essential_matrix_visual_odometry':True,'video_loop_closure':True,'pinhole_multiview_depth_fusion':True,
            'optional_neural_depth_cpu':True,'dynamic_object_masking':True,'person_segmentation_hog_grabcut':True,
            'optional_person_segmentation_onnx':True,'character_orbit_camera_model':True,'character_metric_height_normalization':True,
            'anisotropic_pixel_surfels':True,'surface_completion':True,'sparse_tsdf_cpu':mode=='space','manhattan_space_optimizer':mode=='space',
            'hybrid_hidden_mesh':True,'character_collision_capsule':mode=='character','space_collision_navgrid':mode=='space',
            'lod_generation':True,'spatial_chunking':True,'ewa_renderer':True,'weighted_oit':True,'autonomous_html':True,
            'phone_pose_sensor_fusion':bool(cfg.capture_pose_path),'auto_optional_model_activation':cfg.auto_optional_models,'semantic_transient_masking':True,
            'dynamic_4d_character_tracks':bool(mode=='character' and cfg.build_dynamic_4d_tracks)
        }
    }
    (cfg.output_dir/'video_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    (cfg.output_dir/'quality_report.json').write_text(json.dumps(quality,ensure_ascii=False,indent=2),encoding='utf-8')
    write_ewa_viewer(cfg.output_dir/'viewer_auto.html',lod0,{'version':f'6.0 VIDEO {mode.upper()}','quality':quality['pipeline_health_percent']},cfg.chunk_size_m)
    write_ewa_viewer(cfg.output_dir/'viewer_lod1.html',lod1,{'version':'6.0 VIDEO LOD1','quality':quality['pipeline_health_percent']},cfg.chunk_size_m)
    if not cfg.keep_extracted_frames:shutil.rmtree(work,ignore_errors=True)
    if progress:progress('complete',1.0)
    return {'ok':True,'mode':mode,'output_dir':str(cfg.output_dir),'quality_report':quality,'viewer':str(cfg.output_dir/'viewer_auto.html'),'manifest':str(cfg.output_dir/'video_manifest.json'),'lod_counts':manifest['lod_counts']}
