from __future__ import annotations
from pathlib import Path
from uuid import uuid4
import json
import shutil
import traceback

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .pipeline import BuildConfig, build_scene
from .video_pipeline import VideoBuildConfig, build_video
from .model_manager import scan_models, auto_install_from_manifest

app = FastAPI(title='Pixel 3DGS CPU V6 Phone + 4D MAX')
BASE = Path(__file__).resolve().parents[1]
JOBS = BASE / 'output' / 'jobs'; JOBS.mkdir(parents=True, exist_ok=True)
UPLOADS = BASE / 'input' / 'videos'; UPLOADS.mkdir(parents=True, exist_ok=True)
POSE_UPLOADS = BASE / 'input' / 'poses'; POSE_UPLOADS.mkdir(parents=True, exist_ok=True)
PHONE_CAPTURE = BASE / 'phone_capture'; PHONE_CAPTURE.mkdir(parents=True, exist_ok=True)
app.mount('/capture-app', StaticFiles(directory=str(PHONE_CAPTURE), html=True), name='capture-app')


class BuildRequest(BaseModel):
    input_dir: str
    output_dir: str | None = None
    camera_spacing_m: float = 1.8
    sample_width: int = 180
    sample_height: int = 90
    palette_size: int = 24
    voxel_size: float | None = None
    chunk_size_m: float = 12.0
    hole_fill_ratio: float = 0.08
    use_colmap_if_available: bool = True


class VideoBuildRequest(BaseModel):
    video_path: str
    output_dir: str | None = None
    mode: str = 'auto'
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
    capture_pose_path: str | None = None
    auto_optional_models: bool = True
    semantic_model_path: str | None = None
    build_dynamic_4d_tracks: bool = True


def _status_path(job_id: str) -> Path:
    return JOBS / f'{job_id}.json'


def _write_status(job_id: str, data: dict):
    tmp = _status_path(job_id).with_suffix('.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(_status_path(job_id))


def _resolve(p: str) -> Path:
    x=Path(p);return x if x.is_absolute() else BASE/x


def _run_scene_job(job_id: str, req: BuildRequest):
    try:
        _write_status(job_id, {'job_id':job_id,'kind':'panorama','state':'running','progress':0.05})
        inp=_resolve(req.input_dir);out=_resolve(req.output_dir) if req.output_dir else BASE/'output'/f'build_{job_id}'
        result=build_scene(BuildConfig(input_dir=inp,output_dir=out,camera_spacing_m=req.camera_spacing_m,sample_width=req.sample_width,sample_height=req.sample_height,palette_size=req.palette_size,voxel_size=req.voxel_size,chunk_size_m=req.chunk_size_m,hole_fill_ratio=req.hole_fill_ratio,use_colmap_if_available=req.use_colmap_if_available))
        _write_status(job_id, {'job_id':job_id,'kind':'panorama','state':'complete','progress':1.0,'result':result})
    except Exception as e:
        _write_status(job_id, {'job_id':job_id,'kind':'panorama','state':'failed','error':repr(e),'traceback':traceback.format_exc()[-8000:]})


def _video_config(req: VideoBuildRequest, out: Path) -> VideoBuildConfig:
    return VideoBuildConfig(video_path=_resolve(req.video_path),output_dir=out,mode=req.mode,max_frames=req.max_frames,min_frames=req.min_frames,target_fps=req.target_fps,sample_width=req.sample_width,sample_height=req.sample_height,palette_size=req.palette_size,voxel_size=req.voxel_size,chunk_size_m=req.chunk_size_m,fov_deg=req.fov_deg,camera_height_m=req.camera_height_m,space_step_m=req.space_step_m,character_height_m=req.character_height_m,character_camera_radius_m=req.character_camera_radius_m,character_orbit_degrees=req.character_orbit_degrees,segmentation_model_path=req.segmentation_model_path,depth_model_path=req.depth_model_path,use_dynamic_masking=req.use_dynamic_masking,use_surface_completion=req.use_surface_completion,use_poisson_if_available=req.use_poisson_if_available,capture_pose_path=req.capture_pose_path,auto_optional_models=req.auto_optional_models,semantic_model_path=req.semantic_model_path,build_dynamic_4d_tracks=req.build_dynamic_4d_tracks)


def _run_video_job(job_id: str, req: VideoBuildRequest):
    try:
        out=_resolve(req.output_dir) if req.output_dir else BASE/'output'/f'video_{job_id}'
        def progress(stage: str, value: float):
            _write_status(job_id, {'job_id':job_id,'kind':'video','state':'running','stage':stage,'progress':round(float(value),3)})
        progress('starting',0.01)
        result=build_video(_video_config(req,out),progress=progress)
        _write_status(job_id, {'job_id':job_id,'kind':'video','state':'complete','progress':1.0,'result':result})
    except Exception as e:
        _write_status(job_id, {'job_id':job_id,'kind':'video','state':'failed','error':repr(e),'traceback':traceback.format_exc()[-12000:]})


@app.get('/health')
def health():
    return {'ok':True,'system':'pixel3dgs-cpu-v6-phone-4d-max','models':scan_models()}


@app.get('/capabilities')
def capabilities():
    return {
        'panorama_360_to_pixel3dgs':True,
        'video_space_to_pixel3dgs':True,
        'video_character_to_pixel3dgs':True,
        'video_auto_mode':True,
        'video_keyframe_quality_selection':True,
        'scene_cut_detection':True,
        'visual_odometry_cpu':True,
        'loop_closure_cpu':True,
        'dynamic_object_masking':True,
        'character_segmentation_cpu':True,
        'character_metric_normalization':True,
        'optional_onnx_depth_and_segmentation':True,
        'colmap_cpu_optional':True,
        'multiview_depth_fusion':True,
        'anisotropic_ewa_surfels':True,
        'hybrid_proxy_mesh':True,
        'lod_chunking_collision_nav':True,
        'autonomous_webgl2_viewer':True,
        'background_jobs_with_progress':True,
        'streaming_video_upload':True,
        'phone_capture_pwa':True,
        'phone_orientation_imu_ingest':True,
        'phone_gps_drift_anchor':True,
        'native_pose_ingest':True,
        'dynamic_4d_character_tracks_cpu':True,
        'auto_optional_model_activation':True,
        'semantic_transient_masking':True,
    }


@app.get('/models/status')
def model_status():
    return scan_models()


@app.post('/models/auto-install')
def model_auto_install():
    return auto_install_from_manifest()


@app.post('/capture/upload')
async def upload_capture_bundle(
    background_tasks: BackgroundTasks,
    video: UploadFile=File(...),
    pose: UploadFile | None=File(None),
    mode: str=Form('auto'),
    character_height_m: float=Form(1.75),
    fov_deg: float=Form(70.0),
):
    ext=Path(video.filename or 'capture.mp4').suffix.lower()
    if ext not in {'.mp4','.mov','.m4v','.avi','.webm','.mkv'}:
        raise HTTPException(400,'unsupported video extension')
    if mode not in ('auto','space','character'):
        raise HTTPException(400,'mode must be auto, space, or character')
    job_id=uuid4().hex
    video_dst=UPLOADS/f'{job_id}{ext}'
    with video_dst.open('wb') as out:
        while True:
            chunk=await video.read(1024*1024)
            if not chunk: break
            out.write(chunk)
    pose_path=None
    if pose is not None:
        pose_dst=POSE_UPLOADS/f'{job_id}.json'
        with pose_dst.open('wb') as out:
            while True:
                chunk=await pose.read(1024*1024)
                if not chunk: break
                out.write(chunk)
        pose_path=str(pose_dst)
    req=VideoBuildRequest(video_path=str(video_dst),mode=mode,character_height_m=character_height_m,fov_deg=fov_deg,capture_pose_path=pose_path)
    _write_status(job_id,{'job_id':job_id,'kind':'capture_bundle','state':'queued','progress':0,'uploaded_video':str(video_dst),'uploaded_pose':pose_path})
    background_tasks.add_task(_run_video_job,job_id,req)
    return {'job_id':job_id,'state':'queued','status_url':f'/jobs/{job_id}','pose_fusion':bool(pose_path)}


@app.post('/jobs')
def create_scene_job(req: BuildRequest, background_tasks: BackgroundTasks):
    job_id=uuid4().hex;_write_status(job_id,{'job_id':job_id,'kind':'panorama','state':'queued','progress':0})
    background_tasks.add_task(_run_scene_job,job_id,req)
    return {'job_id':job_id,'state':'queued','status_url':f'/jobs/{job_id}'}


@app.post('/video/jobs')
def create_video_job(req: VideoBuildRequest, background_tasks: BackgroundTasks):
    if req.mode not in ('auto','space','character'):raise HTTPException(400,'mode must be auto, space, or character')
    job_id=uuid4().hex;_write_status(job_id,{'job_id':job_id,'kind':'video','state':'queued','progress':0})
    background_tasks.add_task(_run_video_job,job_id,req)
    return {'job_id':job_id,'state':'queued','status_url':f'/jobs/{job_id}'}


@app.post('/video/upload')
async def upload_video(background_tasks: BackgroundTasks, file: UploadFile=File(...), mode: str=Form('auto'), character_height_m: float=Form(1.75), fov_deg: float=Form(70.0)):
    ext=Path(file.filename or 'capture.mp4').suffix.lower()
    if ext not in {'.mp4','.mov','.m4v','.avi','.webm','.mkv'}:raise HTTPException(400,'unsupported video extension')
    job_id=uuid4().hex;dst=UPLOADS/f'{job_id}{ext}'
    with dst.open('wb') as out:
        while True:
            chunk=await file.read(1024*1024)
            if not chunk:break
            out.write(chunk)
    req=VideoBuildRequest(video_path=str(dst),mode=mode,character_height_m=character_height_m,fov_deg=fov_deg)
    _write_status(job_id,{'job_id':job_id,'kind':'video','state':'queued','progress':0,'uploaded_file':str(dst)})
    background_tasks.add_task(_run_video_job,job_id,req)
    return {'job_id':job_id,'state':'queued','status_url':f'/jobs/{job_id}'}


@app.get('/jobs/{job_id}')
def job_status(job_id: str):
    p=_status_path(job_id)
    if not p.exists():raise HTTPException(404,'job not found')
    return json.loads(p.read_text(encoding='utf-8'))


@app.post('/build')
def build_sync(req: BuildRequest):
    inp=_resolve(req.input_dir);out=_resolve(req.output_dir) if req.output_dir else BASE/'output'/'manual_build'
    return build_scene(BuildConfig(input_dir=inp,output_dir=out,camera_spacing_m=req.camera_spacing_m,sample_width=req.sample_width,sample_height=req.sample_height,palette_size=req.palette_size,voxel_size=req.voxel_size,chunk_size_m=req.chunk_size_m,hole_fill_ratio=req.hole_fill_ratio,use_colmap_if_available=req.use_colmap_if_available))


@app.post('/video/build')
def build_video_sync(req: VideoBuildRequest):
    out=_resolve(req.output_dir) if req.output_dir else BASE/'output'/'manual_video_build'
    return build_video(_video_config(req,out))
