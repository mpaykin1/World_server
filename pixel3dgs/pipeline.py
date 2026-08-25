from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path
import json
import math
import shutil
import numpy as np
import cv2

from . import pipeline_base as b
from .capture import load_exact_camera_metadata, write_capture_template, capture_quality_gate
from .pose_graph import optimize_yaw_pose_graph
from .features_cpu import ensemble_correspondences
from .depth_cpu import NeuralDepthCPU, blend_relative_depth
from .surface_completion import manhattan_optimize, tangent_gap_completion, surfel_fusion_relax, sparse_tsdf_completion, optional_poisson_mesh
from .colmap_cpu import colmap_available, run_colmap_cpu
from .viewer_ewa import write_ewa_viewer


@dataclass
class BuildConfig:
    input_dir: Path
    output_dir: Path
    camera_spacing_m: float = 1.8
    sample_width: int = 180
    sample_height: int = 90
    palette_size: int = 24
    voxel_size: float | None = None
    chunk_size_m: float = 12.0
    hole_fill_ratio: float = 0.08
    tangent_fill_ratio: float = 0.045
    camera_height_m: float = 1.65
    near_distance_m: float = 5.5
    far_distance_m: float = 48.0
    min_confidence: float = 0.18
    use_colmap_if_available: bool = True
    use_pose_graph: bool = True
    use_manhattan_optimizer: bool = True
    use_surfel_fusion: bool = True
    use_poisson_if_available: bool = True
    strict_capture_gate: bool = False
    depth_model_path: str | None = None
    neural_depth_strength: float = 0.34


def _feature_pair_v3(a: np.ndarray, c: np.ndarray) -> dict:
    ga=cv2.cvtColor(np.clip(a*255,0,255).astype(np.uint8),cv2.COLOR_RGB2GRAY)
    gb=cv2.cvtColor(np.clip(c*255,0,255).astype(np.uint8),cv2.COLOR_RGB2GRAY)
    scale=min(1.0,900.0/ga.shape[1])
    if scale<1:
        ga=cv2.resize(ga,None,fx=scale,fy=scale,interpolation=cv2.INTER_AREA)
        gb=cv2.resize(gb,None,fx=scale,fy=scale,interpolation=cv2.INTER_AREA)
    # Dense circular correlation is a robust 360 yaw cue for stylized panoramas.
    dw=min(320,ga.shape[1]); dh=max(72,int(ga.shape[0]*dw/ga.shape[1]))
    da=cv2.resize(ga,(dw,dh),interpolation=cv2.INTER_AREA).astype(np.float32)
    db=cv2.resize(gb,(dw,dh),interpolation=cv2.INTER_AREA).astype(np.float32)
    da=(da-da.mean())/(da.std()+1e-6); db=(db-db.mean())/(db.std()+1e-6)
    best_corr=-1.;best_shift=0
    for shift in range(-dw//3,dw//3+1,max(1,dw//120)):
        corr=float(np.mean(da*np.roll(db,shift,axis=1)))
        if corr>best_corr:best_corr,best_shift=corr,shift
    dense_overlap=float(np.clip((best_corr-0.02)/0.54,0,1))
    dense_yaw=float(np.clip(-best_shift/dw*2*math.pi,-0.38,0.38))

    pts,det_counts=ensemble_correspondences(ga,gb)
    if len(pts)<6:
        return {'matches':len(pts),'overlap':dense_overlap*0.78,'yaw_delta':dense_yaw,'median_px_error':999.0,'detectors':det_counts,'dense_corr':best_corr}
    pts=np.asarray(pts,np.float32);w=ga.shape[1]
    dx=(pts[:,2]-pts[:,0]+w/2)%w-w/2;dy=pts[:,3]-pts[:,1]
    mdx=float(np.median(dx));mdy=float(np.median(dy));madx=float(np.median(np.abs(dx-mdx))+1e-6);mady=float(np.median(np.abs(dy-mdy))+1e-6)
    inlier=(np.abs(dx-mdx)<max(4.0,3.0*madx))&(np.abs(dy-mdy)<max(4.0,3.2*mady))
    inliers=int(np.sum(inlier))
    if inliers<4:
        return {'matches':inliers,'overlap':dense_overlap*0.78,'yaw_delta':dense_yaw,'median_px_error':999.0,'detectors':det_counts,'dense_corr':best_corr}
    sparse_yaw=float(np.clip(np.median(dx[inlier])/w*2*math.pi,-0.38,0.38))
    sparse_overlap=float(np.clip(inliers/85.0,0,1))
    # Dense cue dominates rotation, sparse geometry dominates confidence.
    yaw=float(0.68*sparse_yaw+0.32*dense_yaw)
    overlap=float(np.clip(max(sparse_overlap,dense_overlap*0.75),0,1))
    err=float(np.median(np.sqrt((dx[inlier]-np.median(dx[inlier]))**2+(dy[inlier]-np.median(dy[inlier]))**2)))
    return {'matches':inliers,'overlap':overlap,'yaw_delta':yaw,'median_px_error':err,'detectors':det_counts,'dense_corr':best_corr}


def _initial_camera_solution(images: list[np.ndarray], spacing: float, height: float):
    reports=[];yaws=[0.0]
    for i in range(len(images)-1):
        r=_feature_pair_v3(images[i],images[i+1]);reports.append(r);yaws.append(yaws[-1]-0.58*r['yaw_delta'])
    mid=(len(images)-1)/2;cams=[]
    for i,yaw in enumerate(yaws):
        cams.append((0.16*math.sin((i-mid)*0.45),height,(i-mid)*spacing,yaw))
    return np.asarray(cams,np.float32),reports


def _raw_cloud_v3(images, cams, pair_reports, palette, cfg: BuildConfig, neural: NeuralDepthCPU):
    all_p=[];all_c=[];all_n=[];all_conf=[];all_sem=[];all_view=[];depth_stats=[];neural_stats=[]
    for i,arr in enumerate(images):
        prior,sem=b._prior_depth(arr,cfg)
        rel=neural.predict_relative(arr) if neural.available else None
        prior,nstat=blend_relative_depth(prior,rel,cfg.neural_depth_strength)
        rays=b._ray_grid(arr.shape[0],arr.shape[1],float(cams[i,3]))
        depth,conf=b._refine_depth_multiview(i,images,cams,prior,rays,pair_reports)
        floor=sem==1;depth[floor]=b._prior_depth(arr,cfg)[0][floor];conf[floor]=np.maximum(conf[floor],0.74)
        pmap=cams[i,:3][None,None,:]+rays*depth[...,None];normals=b._normals_from_points(pmap,rays)
        lum=.2126*arr[...,0]+.7152*arr[...,1]+.0722*arr[...,2]
        keep=np.ones(lum.shape,bool);sky_dark=(sem==2)&(lum<.025);checker=(np.indices(lum.shape).sum(axis=0)+i)%3!=0
        keep[sky_dark&checker]=False;keep&=conf>=cfg.min_confidence
        all_p.append(pmap[keep]);all_c.append(arr[keep]);all_n.append(normals[keep]);all_conf.append(conf[keep]);all_sem.append(sem[keep]);all_view.append(np.full(int(np.sum(keep)),i,np.int16))
        depth_stats.append({'median':float(np.median(depth)),'confidence_mean':float(np.mean(conf))});neural_stats.append(nstat)
    return {
        'points':np.concatenate(all_p).astype(np.float32),'colors':b._quantize(np.concatenate(all_c).astype(np.float32),palette),
        'normals':np.concatenate(all_n).astype(np.float32),'confidence':np.concatenate(all_conf).astype(np.float32),
        'semantic':np.concatenate(all_sem).astype(np.uint8),'views':np.concatenate(all_view).astype(np.int16),
        'depth_stats':depth_stats,'neural_depth':neural_stats,
    }


def _covariance6(scene: dict) -> np.ndarray:
    n=scene['normals'].astype(np.float32);su=scene['scale_u'].astype(np.float32);sv=scene['scale_v'].astype(np.float32)
    ref=np.zeros_like(n);ref[:,1]=1;vertical=np.abs(n[:,1])>.92;ref[vertical]=np.array([1,0,0],np.float32)
    t=np.cross(ref,n);t/=np.maximum(np.linalg.norm(t,axis=1,keepdims=True),1e-7);bb=np.cross(n,t);bb/=np.maximum(np.linalg.norm(bb,axis=1,keepdims=True),1e-7)
    sn=np.minimum(su,sv)*.18
    cov=np.einsum('ni,nj,n->nij',t,t,su*su)+np.einsum('ni,nj,n->nij',bb,bb,sv*sv)+np.einsum('ni,nj,n->nij',n,n,sn*sn)
    return np.stack([cov[:,0,0],cov[:,0,1],cov[:,0,2],cov[:,1,1],cov[:,1,2],cov[:,2,2]],axis=1).astype(np.float32)


def _quality_v3(files,pairs,raw,scene,voxel,gate,pose_graph,exact_meta,colmap_info,manhattan,surfel,tsdf,filled,filled2,poisson,chunks,neural):
    overlaps=[r.get('overlap',0) for r in pairs] or [0];matches=[r.get('matches',0) for r in pairs] or [0]
    conf=float(np.mean(scene['confidence']));support=float(np.mean(scene['view_support']));multi=float(np.mean(np.clip((scene['view_support']-1)/2,0,1)))
    geometry=float(np.mean(overlaps));feature=float(np.clip(np.mean(matches)/40,0,1));gate_score=gate['score_percent']/100
    # Consistency score, not photorealism. Exact/Colmap poses earn only a modest verified bonus.
    pose_bonus=.06 if exact_meta.get('used') else (.04 if colmap_info.get('ok') else (.025 if pose_graph.get('used') else 0))
    health=100*(.24*geometry+.22*conf+.16*multi+.12*feature+.12*gate_score+.08*min(1,len(chunks)/20)+pose_bonus)
    health=float(np.clip(health,0,100))
    return {
        'pipeline_health_percent':round(health,1),'capture_quality_percent':gate['score_percent'],'input_panorama_count':len(files),
        'feature_matches_mean':round(float(np.mean(matches)),1),'neighbor_overlap_mean':round(float(np.mean(overlaps)),3),
        'multiview_confidence_mean':round(conf,3),'multi_camera_support_mean':round(support,3),'raw_points':len(raw['points']),'final_splats':len(scene['points']),
        'voxel_size_m':round(float(voxel),4),'single_gap_filled':int(filled),'tangent_surface_filled':int(filled2),
        'camera_metadata':exact_meta,'pose_graph':pose_graph,'colmap':colmap_info,'neural_depth_available':neural.available,
        'manhattan':manhattan,'surfel_fusion':surfel,'sparse_tsdf':tsdf,'poisson':poisson,'capture_gate':gate,
        'notes':['Health is reconstruction consistency, not photorealism.','AI-generated panoramas remain the dominant accuracy limit when geometry changes between views.']
    }


def build_scene(cfg: BuildConfig) -> dict:
    cfg.input_dir=Path(cfg.input_dir);cfg.output_dir=Path(cfg.output_dir);cfg.output_dir.mkdir(parents=True,exist_ok=True)
    files=b._images(cfg.input_dir);images=b._load_resized(files,cfg.sample_width,cfg.sample_height);palette=b._global_palette(images,cfg.palette_size)
    write_capture_template(cfg.output_dir/'capture_template.json',files,cfg.camera_spacing_m,cfg.camera_height_m)
    cams,pairs=_initial_camera_solution(images,cfg.camera_spacing_m,cfg.camera_height_m)
    exact,exact_meta=load_exact_camera_metadata(cfg.input_dir,files,cfg.camera_height_m)
    gate=capture_quality_gate(images,pairs,cfg.strict_capture_gate)
    (cfg.output_dir/'capture_quality.json').write_text(json.dumps(gate,ensure_ascii=False,indent=2),encoding='utf-8')
    if not gate['accepted']:
        raise RuntimeError('Capture quality gate rejected input: '+','.join(gate['issues']))

    pose_report={'used':False}
    if exact is not None:
        cams=exact
    elif cfg.use_pose_graph:
        cams,pose_report=optimize_yaw_pose_graph(images,_feature_pair_v3,cams,max_pair_gap=3)

    colmap_info={'available':colmap_available(),'ran':False}
    if cfg.use_colmap_if_available and colmap_available() and exact is None:
        try:
            colmap_info=run_colmap_cpu(cfg.input_dir,cfg.output_dir/'colmap_cpu',cfg.camera_spacing_m,cfg.camera_height_m)
            sol=colmap_info.get('panorama_pose_solution')
            if colmap_info.get('ok') and sol and len(sol.get('poses',[]))==len(files):
                cams=np.asarray(sol['poses'],np.float32)
        except Exception as exc:
            colmap_info={'available':True,'ran':True,'ok':False,'reason':repr(exc)}

    model_path=Path(cfg.depth_model_path) if cfg.depth_model_path else None
    if model_path is None:
        model_dir=Path(__file__).resolve().parents[1]/'models'
        candidates=list(model_dir.glob('*.onnx')) if model_dir.exists() else []
        model_path=candidates[0] if candidates else None
    neural=NeuralDepthCPU(model_path)
    raw=_raw_cloud_v3(images,cams,pairs,palette,cfg,neural)
    voxel=b._auto_voxel(raw['points'],cfg)
    scene=b._merge_voxels(raw['points'],raw['colors'],raw['normals'],raw['confidence'],raw['semantic'],raw['views'],voxel,True)
    scene,filled=b._fill_single_voxel_holes(scene,voxel,cfg.hole_fill_ratio)
    surfel={'iterations':0,'point_updates':0}
    if cfg.use_surfel_fusion: scene,surfel=surfel_fusion_relax(scene,voxel,2)
    manhattan={'normal_snaps':0,'point_plane_snaps':0,'planes':[]}
    if cfg.use_manhattan_optimizer: scene,manhattan=manhattan_optimize(scene,voxel)
    scene,filled2=tangent_gap_completion(scene,voxel,cfg.tangent_fill_ratio)
    scene,tsdf=sparse_tsdf_completion(raw,cams,scene,voxel,0.03)
    planes=b._plane_report(scene,voxel)

    poisson={'available':False,'ran':False}
    if cfg.use_poisson_if_available:
        poisson=optional_poisson_mesh(scene,cfg.output_dir/'poisson_proxy.ply',depth=8)

    lod0=scene;lod1=b._lod(scene,voxel,1.75);lod2=b._lod(scene,voxel,2.85);lods={'lod0':lod0,'lod1':lod1,'lod2':lod2}
    for name,s in lods.items():
        b._write_ply(cfg.output_dir/f'scene_{name}.ply',s)
        np.savez_compressed(cfg.output_dir/f'covariance_{name}.npz',covariance6=_covariance6(s))
    chunks={name:b._chunks(s,cfg.output_dir,name,cfg.chunk_size_m) for name,s in lods.items()}
    b._collision_and_nav(lod0,cfg.output_dir,planes,voxel)

    quality=_quality_v3(files,pairs,raw,lod0,voxel,gate,pose_report,exact_meta,colmap_info,manhattan,surfel,tsdf,filled,filled2,poisson,chunks['lod0'],neural)
    manifest={
        'version':'3.0-cpu-max','input_files':[p.name for p in files],'cameras':cams.tolist(),'camera_pair_reports':pairs,'palette_rgb255':np.clip(palette*255,0,255).astype(int).tolist(),
        'voxel_size_m':float(voxel),'lod_counts':{k:len(v['points']) for k,v in lods.items()},'chunks':chunks,'planes':planes,
        'features':{
            'capture_quality_gate':True,'exact_camera_metadata':True,'perspective_cube_faces_for_colmap':True,'cpu_colmap_bundle_adjustment':True,
            'global_pose_graph_loop_closure':True,'sift_akaze_orb_ensemble':True,'optional_superpoint_onnx_hook':True,'optional_neural_depth_onnx_cpu':True,
            'multiview_depth_fusion':True,'confidence_occlusion_filter':True,'surfel_fusion_relaxation':True,'manhattan_world_optimizer':True,
            'plane_constrained_completion':True,'sparse_tsdf_cpu_fusion':True,'optional_poisson_cpu':True,'anisotropic_surfels':True,'per_splat_ewa_covariance':True,
            'automatic_palette':True,'automatic_pixel_grid':True,'lod_generation':True,'hierarchical_spatial_chunks':True,'collision_proxy':True,'navgrid':True,
            'ewa_screen_space_renderer':True,'weighted_blended_oit':True,'hierarchical_chunk_culling':True,'webgpu_experimental_renderer':False
        },
        'optional_backends':{'neural_depth_model':str(model_path) if model_path else None,'colmap_available':colmap_available(),'poisson_available':poisson.get('available',False)},
    }
    (cfg.output_dir/'scene_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    (cfg.output_dir/'quality_report.json').write_text(json.dumps(quality,ensure_ascii=False,indent=2),encoding='utf-8')
    write_ewa_viewer(cfg.output_dir/'viewer_auto.html',lod0,{'version':'3.0 CPU MAX','quality':quality['pipeline_health_percent']},cfg.chunk_size_m)
    write_ewa_viewer(cfg.output_dir/'viewer_lod1.html',lod1,{'version':'3.0 CPU MAX LOD1','quality':quality['pipeline_health_percent']},cfg.chunk_size_m)
    write_ewa_viewer(cfg.output_dir/'viewer_lod2.html',lod2,{'version':'3.0 CPU MAX LOD2','quality':quality['pipeline_health_percent']},cfg.chunk_size_m)
    return {'ok':True,'output_dir':str(cfg.output_dir),'quality_report':quality,'lod_counts':manifest['lod_counts'],'viewer':str(cfg.output_dir/'viewer_auto.html'),'manifest':str(cfg.output_dir/'scene_manifest.json'),'collision':str(cfg.output_dir/'collision_proxy.glb')}
