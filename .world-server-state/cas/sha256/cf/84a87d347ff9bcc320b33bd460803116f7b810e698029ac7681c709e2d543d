from pathlib import Path
import yaml

DEFAULTS = {
    "video": {"sample_fps": 6.0, "max_frames": 280, "resize_max": 960},
    "person": {"prefer_mediapipe": True, "mask_dilate_px": 10, "temporal_alpha": 0.70, "external_segmentation_command": ""},
    "scene": {
        "autopilot": True, "backend": "cpu_sfm",
        "presets": [
            {"max_features": 2400, "ratio_test": 0.74, "min_matches": 50},
            {"max_features": 3600, "ratio_test": 0.72, "min_matches": 60},
            {"max_features": 4800, "ratio_test": 0.70, "min_matches": 72},
        ],
        "max_scene_points": 280000, "world_extent_m": 34.0, "external_gpu_command": "",
    },
    "depth": {
        "enabled": True, "mode": "cpu_sparse_fusion", "external_depth_command": "",
        "fill_radius_voxels": 2, "max_generated_points": 70000,
    },
    "voxel": {
        "voxel_size_candidates": [0.16, 0.20, 0.24, 0.30],
        "max_voxels": 100000, "color_mode": "palette16", "chunk_size": 16,
        "lod_size_far": 0.48, "floor_band_percentile": 10,
        "max_vertical_fill_gap": 3, "enable_hidden_voxel_cull": True,
        "enable_floor_hole_fill": True, "floor_fill_neighbors_min": 3,
        "enable_interior_completion": True, "interior_fill_max_gap": 2,
        "enable_procedural_cleanup": True,
        "stream_radius_chunks": 5, "max_visible_chunks": 150,
    },
    "avatar": {
        "pixel_stride": 4, "max_points_per_bone": 20000, "depth_layers": 3,
        "voxel_size": 0.07, "root_motion_gain": 2.2, "temporal_angle_alpha": 0.60,
        "external_smplx_command": "", "enable_motion_retarget": True,
        "enable_animation_synthesis": True, "lod_distances": [8.0, 18.0, 32.0],
    },
    "game": {
        "walk_speed": 3.4, "run_speed": 5.8, "jump_speed": 6.0,
        "gravity": 16.0, "player_height": 1.75, "foot_ik": True, "ground_lock": True,
    },
    "performance": {
        "target_runtime_fps": 60, "mobile_target_fps": 30,
        "max_scene_voxels_desktop": 100000, "max_scene_voxels_mobile": 50000,
        "max_avatar_voxels": 28000, "chunk_budget_desktop": 180,
        "chunk_budget_mobile": 100, "enable_auto_tune": True,
        "enable_frustum_culling": True, "enable_runtime_profiler": True,
    },
    "validation": {
        "require_manifest": True, "require_scene_manifest": True,
        "require_avatar_meta": True, "require_collision": True,
        "require_navgrid": True, "require_pipeline_report": True,
        "require_quality_gate": True,
    },
    "regression": {
        "enabled": True, "require_green_gate": True,
        "min_desktop_readiness": 75, "min_mobile_readiness": 65,
    },
}

def _merge(a, b):
    out = dict(a)
    for k, v in (b or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out

def load_config(path=None):
    cfg = DEFAULTS
    if path and Path(path).exists():
        cfg = _merge(DEFAULTS, yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {})
    return cfg
