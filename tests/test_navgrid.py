import numpy as np
from types import SimpleNamespace
from video2game_voxel.navgrid import build_navgrid

def test_navgrid():
    wp=np.array([[0,0,0],[1,0,0],[0,0,1]],np.float32)
    vg=SimpleNamespace(world_positions=wp, floor_y=0.0)
    nav=build_navgrid(vg, voxel_size=1.0)
    assert nav["width"] >= 1 and nav["height"] >= 1
