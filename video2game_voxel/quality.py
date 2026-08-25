from .sfm_cpu import CpuSFM

def reconstruct_with_autopilot(frames, people, scene_cfg, progress=lambda *_: None):
    presets = scene_cfg.get("presets") or []
    attempts=[]
    best=None
    for i,preset in enumerate(presets, start=1):
        progress(f"[scene autopilot] preset {i}/{len(presets)}: {preset}")
        recon = CpuSFM(
            max_features=preset["max_features"],
            ratio_test=preset["ratio_test"],
            min_matches=preset["min_matches"],
            max_scene_points=scene_cfg["max_scene_points"],
            world_extent_m=scene_cfg["world_extent_m"],
        ).reconstruct(frames, people)
        item=dict(preset=preset, score=recon.score, quality=recon.quality)
        attempts.append(item)
        if best is None or recon.score > best.score:
            best = recon
    return best, attempts
