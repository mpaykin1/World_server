import numpy as np, struct
from video2game_voxel.exporter import write_voxelbin

def test_voxelbin(tmp_path):
    idx=np.array([[1,2,3],[4,5,6]],np.int32)
    c=np.array([[10,20,30],[40,50,60]],np.uint8)
    f=tmp_path/"a.voxelbin"; write_voxelbin(f, idx, c); b=f.read_bytes()
    assert struct.unpack("<I", b[:4])[0] == 2
    assert len(b) == 4 + 2*3*4 + 2*3
