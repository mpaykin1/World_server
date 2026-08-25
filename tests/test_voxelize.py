import numpy as np
from video2game_voxel.voxelize import voxelize_points, choose_best_voxelization

def test_voxelize():
    pts=np.array([[0.01,0.01,0.01],[0.08,0.02,0.04],[1.0,0,0]],np.float32)
    cols=np.array([[10,20,30],[30,40,50],[100,100,100]],np.uint8)
    vg=voxelize_points(pts, cols, voxel_size=0.1, max_voxels=20, chunk_size=4)
    assert vg.quality["voxels"] >= 2

def test_choose_best():
    pts=np.array([[0.01,0.01,0.01],[0.08,0.02,0.04],[1.0,0,0],[1.1,0,0]],np.float32)
    cols=np.array([[10,20,30],[30,40,50],[100,100,100],[120,120,120]],np.uint8)
    vg, attempts = choose_best_voxelization(pts, cols, {
        "voxel_size_candidates":[0.1,0.2],
        "max_voxels":50,
        "color_mode":"palette16",
        "chunk_size":4,
        "floor_band_percentile":10,
        "max_vertical_fill_gap":2,
        "enable_hidden_voxel_cull":True,
        "enable_floor_hole_fill":True,
        "floor_fill_neighbors_min":2
    })
    assert len(attempts)==2
