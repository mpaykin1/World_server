from video2game_voxel.perf_report import estimate_runtime_budget

def test_perf_budget():
    res = estimate_runtime_budget({"voxels": 1000, "chunks": 10}, {"avatar_voxels": 500}, {
        "max_scene_voxels_desktop": 90000,
        "max_scene_voxels_mobile": 45000,
        "max_avatar_voxels": 24000,
        "chunk_budget_desktop": 160,
        "chunk_budget_mobile": 90,
    })
    assert res["desktop_readiness"] > 0 and res["mobile_readiness"] > 0
