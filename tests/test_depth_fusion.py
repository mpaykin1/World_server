import numpy as np
from video2game_voxel.depth_fusion import fuse_depth

def test_depth_fusion_adds_support():
    p=np.array([[0,0,0],[1,1,1],[2,0,1]],np.float32)
    c=np.array([[10,20,30],[40,50,60],[70,80,90]],np.uint8)
    r=fuse_depth(p,c,{"enabled":True,"external_depth_command":"","max_generated_points":20,"fill_radius_voxels":2})
    assert len(r.points)>=len(p)
    assert r.report["status"]=="ok"
