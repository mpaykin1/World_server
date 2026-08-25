import numpy as np
from video2game_voxel.voxel_postprocess import complete_small_interior_gaps, cleanup_voxel_architecture

def test_gap_completion():
    idx=np.array([[0,0,0],[2,0,0]],np.int32)
    c=np.array([[10,10,10],[20,20,20]],np.uint8)
    oi,oc,r=complete_small_interior_gaps(idx,c,max_gap=2)
    assert len(oi)>=3 and r["added"]>=1

def test_cleanup_keeps_connected():
    idx=np.array([[0,0,0],[1,0,0],[9,9,9]],np.int32)
    c=np.array([[1,1,1],[2,2,2],[3,3,3]],np.uint8)
    oi,oc,r=cleanup_voxel_architecture(idx,c)
    assert len(oi)==2
