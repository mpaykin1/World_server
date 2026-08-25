import copy

def choose_runtime_profile(video_frames, cfg):
    out = copy.deepcopy(cfg)
    perf = out.get("performance", {})
    if not perf.get("enable_auto_tune", True):
        return out, {"profile": "manual", "changes": {}}

    changes = {}
    frame_count = len(video_frames.frames)
    max_side = max(video_frames.width, video_frames.height)

    if frame_count > 180:
        out["video"]["sample_fps"] = min(out["video"]["sample_fps"], 5.0)
        changes["sample_fps"] = out["video"]["sample_fps"]
    if max_side > 960:
        out["video"]["resize_max"] = 960
        changes["resize_max"] = 960
    if frame_count > 220:
        out["voxel"]["max_visible_chunks"] = min(out["voxel"]["max_visible_chunks"], perf.get("chunk_budget_mobile", 90))
        changes["max_visible_chunks"] = out["voxel"]["max_visible_chunks"]
    if frame_count < 80:
        out["scene"]["max_scene_points"] = min(out["scene"]["max_scene_points"], 180000)
        changes["max_scene_points"] = out["scene"]["max_scene_points"]

    profile = "balanced"
    if frame_count > 220:
        profile = "throughput"
    elif frame_count < 80:
        profile = "quality"

    return out, {"profile": profile, "changes": changes, "frame_count": frame_count, "source_resolution": [video_frames.width, video_frames.height]}
