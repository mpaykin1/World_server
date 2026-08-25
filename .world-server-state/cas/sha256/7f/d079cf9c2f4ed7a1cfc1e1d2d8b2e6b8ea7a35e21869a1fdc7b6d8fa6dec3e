def estimate_runtime_budget(voxel_report, avatar_report, perf_cfg):
    scene_voxels = int(voxel_report.get("voxels", 0))
    chunks = int(voxel_report.get("chunks", 0))
    avatar_voxels = int(avatar_report.get("avatar_voxels", 0))
    desktop_cap = int(perf_cfg.get("max_scene_voxels_desktop", 90000))
    mobile_cap = int(perf_cfg.get("max_scene_voxels_mobile", 45000))
    avatar_cap = int(perf_cfg.get("max_avatar_voxels", 24000))
    desktop_chunk_cap = int(perf_cfg.get("chunk_budget_desktop", 160))
    mobile_chunk_cap = int(perf_cfg.get("chunk_budget_mobile", 90))

    desktop_score = 100
    mobile_score = 100

    if scene_voxels > desktop_cap:
        desktop_score -= min(50, int((scene_voxels - desktop_cap) / max(desktop_cap, 1) * 100))
    if chunks > desktop_chunk_cap:
        desktop_score -= min(25, int((chunks - desktop_chunk_cap) / max(desktop_chunk_cap, 1) * 100))
    if avatar_voxels > avatar_cap:
        desktop_score -= min(20, int((avatar_voxels - avatar_cap) / max(avatar_cap, 1) * 100))

    if scene_voxels > mobile_cap:
        mobile_score -= min(60, int((scene_voxels - mobile_cap) / max(mobile_cap, 1) * 100))
    if chunks > mobile_chunk_cap:
        mobile_score -= min(25, int((chunks - mobile_chunk_cap) / max(mobile_chunk_cap, 1) * 100))
    if avatar_voxels > avatar_cap:
        mobile_score -= min(25, int((avatar_voxels - avatar_cap) / max(avatar_cap, 1) * 100))

    desktop_score = max(1, desktop_score)
    mobile_score = max(1, mobile_score)

    return {
        "desktop_readiness": desktop_score,
        "mobile_readiness": mobile_score,
        "estimated_desktop_fps_band": "55-60" if desktop_score >= 85 else "40-55" if desktop_score >= 65 else "25-40",
        "estimated_mobile_fps_band": "28-35" if mobile_score >= 85 else "20-28" if mobile_score >= 65 else "12-20",
        "scene_voxels": scene_voxels,
        "chunks": chunks,
        "avatar_voxels": avatar_voxels,
    }
