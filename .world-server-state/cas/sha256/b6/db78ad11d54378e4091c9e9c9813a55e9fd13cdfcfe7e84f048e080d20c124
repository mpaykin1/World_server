import numpy as np

def build_navgrid(voxel_world, voxel_size=0.22):
    wp = voxel_world.world_positions
    if len(wp) == 0:
        return {"origin":[0,0], "cell_size": voxel_size, "cells": [], "width": 0, "height": 0, "status":"empty"}
    floor_y = float(voxel_world.floor_y)
    floor_pts = wp[wp[:,1] <= floor_y + voxel_size * 1.5]
    if len(floor_pts) == 0:
        return {"origin":[0,0], "cell_size": voxel_size, "cells": [], "width": 0, "height": 0, "status":"empty"}
    gx = np.round(floor_pts[:,0] / voxel_size).astype(int)
    gz = np.round(floor_pts[:,2] / voxel_size).astype(int)
    minx,maxx=int(gx.min()),int(gx.max())
    minz,maxz=int(gz.min()),int(gz.max())
    w=maxx-minx+1; h=maxz-minz+1
    grid=np.zeros((h,w), dtype=np.uint8)
    for x,z in zip(gx,gz):
        grid[z-minz, x-minx] = 1
    cells=[int(v) for v in grid.flatten().tolist()]
    return {"origin":[minx,minz], "cell_size": float(voxel_size), "cells": cells, "width": int(w), "height": int(h), "status":"ok"}
