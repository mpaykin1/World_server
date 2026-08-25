import numpy as np
from video2game_voxel.math3d import nearest_segment_2d, percentile_scale

def test_nearest_segment():
    d,t,s=nearest_segment_2d((.5,1),(0,0),(1,0))
    assert abs(d-1)<1e-6 and abs(t-.5)<1e-6

def test_scale():
    p=np.array([[-1,-1,-1],[1,1,1],[0,0,0]],np.float32)
    q,s=percentile_scale(p,30)
    assert q.shape==p.shape and s>0
