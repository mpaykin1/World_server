import numpy as np
from video2game_voxel.avatar_lod import generate_lods

def test_avatar_lod():
    parts={"torso":{"voxels":np.zeros((12,3),np.float32),"colors":np.zeros((12,3),np.uint8),"voxel_size":.1}}
    lods,rep=generate_lods(parts,[8,18,32])
    assert len(lods["torso"]["lods"])==3
    assert rep["levels"]==3
