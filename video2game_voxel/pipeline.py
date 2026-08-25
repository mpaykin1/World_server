from pathlib import Path
import json
from .video import extract_frames
from .pose import PersonTracker
from .quality import reconstruct_with_autopilot
from .depth_fusion import fuse_depth
from .voxelize import choose_best_voxelization
from .collision import build_collision_proxy
from .navgrid import build_navgrid
from .avatar import AvatarBuilder
from .motion import retarget_motion, synthesize_animation_library
from .avatar_lod import generate_lods
from .exporter import export_game
from .auto_tune import choose_runtime_profile
from .perf_report import estimate_runtime_budget
from .validate import validate_build
from .quality_gate import build_issue_report, write_quality_gate
from .regression import evaluate_regression, write_regression_report
from .backends.external_adapters import detect_optional_backends

def readiness(scene_report, depth_report, voxel_report, avatar_report, collision_report, navgrid_report, perf_report, regression):
    vals = []
    vals.append(84 if scene_report.get("status")=="ok" else 50)
    vals.append(78 if depth_report.get("status") in ("ok","adapter_ready") else 55)
    vals.append(min(100, 58 + min(28, int(voxel_report.get("voxels",0)/1800))))
    vals.append(85 if avatar_report.get("status")=="ok" else 55)
    vals.append(82 if collision_report.get("status")=="ok" else 48)
    vals.append(82 if navgrid_report.get("status")=="ok" else 45)
    vals.append(int(round((perf_report.get("desktop_readiness",1)+perf_report.get("mobile_readiness",1))/2)))
    vals.append(92 if regression.get("status")=="pass" else 60)
    return {
        "scene_reconstruction": vals[0],
        "depth_fusion": vals[1],
        "voxel_world": vals[2],
        "avatar_and_motion": vals[3],
        "physics_collision": vals[4],
        "navigation": vals[5],
        "performance": vals[6],
        "regression_safety": vals[7],
        "overall_patch_readiness": int(round(sum(vals)/len(vals)))
    }

def run_pipeline(video_path, out_dir, cfg, progress=print):
    video_path=Path(video_path)
    if not video_path.exists():
        raise FileNotFoundError(video_path)

    progress("[1/9] keyframes")
    vf=extract_frames(video_path, **cfg["video"])
    tuned_cfg, tune_report = choose_runtime_profile(vf, cfg)

    progress("[2/9] person + temporal segmentation/pose")
    tracker_cfg = dict(tuned_cfg["person"])
    tracker_cfg.pop("external_segmentation_command", None)
    person=PersonTracker(**tracker_cfg).process(vf.frames)

    progress("[3/9] scene reconstruction autopilot")
    scene, scene_attempts = reconstruct_with_autopilot(vf.frames, person, tuned_cfg["scene"], progress=progress)

    progress("[4/9] depth fusion / completion")
    depth=fuse_depth(scene.points, scene.colors, tuned_cfg["depth"], work_dir=out_dir)

    progress("[5/9] voxel autopilot + interior cleanup")
    voxel_world, voxel_attempts = choose_best_voxelization(depth.points, depth.colors, tuned_cfg["voxel"])
    collision = build_collision_proxy(voxel_world, voxel_size=voxel_world.quality.get("voxel_size",0.22))
    navgrid = build_navgrid(voxel_world, voxel_size=voxel_world.quality.get("voxel_size",0.22))

    progress("[6/9] avatar + retarget + animation synthesis")
    avatar_cfg=dict(tuned_cfg["avatar"])
    external_smplx=avatar_cfg.pop("external_smplx_command", "")
    enable_retarget=avatar_cfg.pop("enable_motion_retarget", True)
    enable_synth=avatar_cfg.pop("enable_animation_synthesis", True)
    lod_distances=avatar_cfg.pop("lod_distances", [8.0,18.0,32.0])
    avatar=AvatarBuilder(**avatar_cfg).build(vf.frames, person, vf.timestamps)
    if enable_retarget:
        avatar.motion=retarget_motion(avatar.motion)
    animations=synthesize_animation_library(avatar.motion) if enable_synth else None
    avatar_lods, avatar_lod_report = generate_lods(avatar.parts, lod_distances)

    progress("[7/9] export runtime")
    optional=detect_optional_backends(tuned_cfg)
    optional_json={k:v.__dict__ for k,v in optional.items()}
    pipeline_meta={
        "version":"0.5.0","mode":"cpu_first_voxel_v5",
        "scene_attempts":scene_attempts,"voxel_attempts":voxel_attempts,
        "auto_tune":tune_report,"optional_backends":optional_json
    }
    export_game(out_dir, voxel_world, avatar, collision, navgrid, tuned_cfg,
                Path(__file__).parent/"web_template", pipeline_meta,
                animation_library=animations, avatar_lods=avatar_lods)

    progress("[8/9] performance + validation")
    perf=estimate_runtime_budget(voxel_world.quality, avatar.quality, tuned_cfg["performance"])
    report={
        "video_frames":len(vf.frames),
        "auto_tune":tune_report,
        "optional_backends":optional_json,
        "scene":scene.quality,
        "scene_score":scene.score,
        "depth":depth.report,
        "scene_attempts":scene_attempts,
        "voxel_world":voxel_world.quality,
        "voxel_attempts":voxel_attempts,
        "avatar":avatar.quality,
        "avatar_lod":avatar_lod_report,
        "animation_library":{"status":"ok" if animations else "disabled"},
        "collision":{"walk_cells":collision.get("walk_cells",0),"obstacles":len(collision.get("obstacles",[])),"status":collision.get("status","ok")},
        "navgrid":{"width":navgrid.get("width",0),"height":navgrid.get("height",0),"status":navgrid.get("status","ok")},
        "performance":perf,
        "out_dir":str(Path(out_dir).resolve())
    }
    Path(out_dir,"PIPELINE_REPORT.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    validation=validate_build(out_dir,tuned_cfg["validation"])
    gate=build_issue_report(report,validation,perf)
    write_quality_gate(out_dir,gate)
    Path(out_dir,"VALIDATION_REPORT.json").write_text(json.dumps(validation,ensure_ascii=False,indent=2),encoding="utf-8")

    progress("[9/9] regression gate")
    regression=evaluate_regression(report,validation,gate,tuned_cfg["regression"])
    write_regression_report(out_dir,regression)
    report["readiness"]=readiness(scene.quality,depth.report,voxel_world.quality,avatar.quality,collision,navgrid,perf,regression)
    Path(out_dir,"PIPELINE_REPORT.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    progress(json.dumps(report["readiness"],ensure_ascii=False,indent=2))
    return {"pipeline":report,"validation":validation,"quality_gate":gate,"regression":regression}
