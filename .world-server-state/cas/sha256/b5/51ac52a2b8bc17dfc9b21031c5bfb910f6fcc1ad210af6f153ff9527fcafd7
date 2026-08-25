import numpy as np

def build_collision_proxy(voxel_world, voxel_size=0.22):
    wp = voxel_world.world_positions
    if len(wp) == 0:
        return {"floor_y": 0.0, "obstacles": [], "walk_cells": 0, "status": "empty"}
    floor_y = float(voxel_world.floor_y)
    near_floor = wp[:,1] <= floor_y + voxel_size * 1.5
    floor_pts = wp[near_floor]
    obstacles = []
    columns = {}
    for p in wp:
        k = (round(float(p[0]) / voxel_size), round(float(p[2]) / voxel_size))
        columns.setdefault(k, []).append(float(p[1]))
    for (gx,gz), ys in columns.items():
        mn = min(ys); mx = max(ys)
        if mx - mn >= voxel_size * 1.8:
            obstacles.append({"x": gx * voxel_size, "z": gz * voxel_size, "y_min": mn, "y_max": mx})
    return {"floor_y": floor_y, "obstacles": obstacles[:3000], "walk_cells": int(len(floor_pts)), "status": "ok"}
