from pathlib import Path
import json, shutil, struct, math
import numpy as np
from .voxelize import chunk_voxels

def write_voxelbin(path, indices, colors):
    path=Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    idx=np.asarray(indices,np.int32); col=np.asarray(colors,np.uint8)
    with path.open("wb") as f:
        f.write(struct.pack("<I", len(idx)))
        f.write(idx.astype("<i4", copy=False).tobytes())
        f.write(col.tobytes())

def export_game(out_dir, voxel_world, avatar, collision, navgrid, cfg, template_dir, pipeline_meta, animation_library=None, avatar_lods=None):
    out=Path(out_dir)
    if out.exists(): shutil.rmtree(out)
    shutil.copytree(template_dir, out)
    public=out/"public"/"assets"; public.mkdir(parents=True, exist_ok=True)

    scene_chunks = chunk_voxels(voxel_world.indices, voxel_world.colors, voxel_world.chunk_keys, voxel_world.labels)
    scene_manifest = {"chunks": [], "voxel_size": cfg["voxel"]["voxel_size_candidates"][0], "floor_y": voxel_world.floor_y,
                      "lod_size_far": cfg["voxel"]["lod_size_far"], "stream_radius_chunks": cfg["voxel"]["stream_radius_chunks"],
                      "max_visible_chunks": cfg["voxel"]["max_visible_chunks"]}
    for i, (key, (idx, col, labels)) in enumerate(scene_chunks.items()):
        fn=f"scene_chunk_{i:04d}.voxelbin"
        write_voxelbin(public/fn, idx, col)
        arr=np.asarray(idx, np.int32)
        mn=arr.min(axis=0).tolist() if len(arr) else [0,0,0]
        mx=arr.max(axis=0).tolist() if len(arr) else [0,0,0]
        center=((arr.mean(axis=0) if len(arr) else np.zeros(3))).tolist()
        scene_manifest["chunks"].append({"file": f"/assets/{fn}", "chunk": list(key), "count": int(len(idx)),
                                         "bounds_min": mn, "bounds_max": mx, "center": center,
                                         "labels": sorted(list(set(labels)))[:4]})
    (public/"scene_manifest.json").write_text(json.dumps(scene_manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    avatar_meta = {"parts": {}}
    for name, part in avatar.parts.items():
        fn=f"avatar_{name}.voxelbin"
        local_idx=np.floor(part["voxels"]/max(part["voxel_size"], 1e-6)).astype(np.int32)
        write_voxelbin(public/fn, local_idx, part["colors"])
        avatar_meta["parts"][name] = {
            "file": f"/assets/{fn}",
            "voxel_size": part["voxel_size"],
            "rest_position": part["rest_position"],
            "rest_rotation_z": part["rest_rotation_z"],
        }
    (public/"avatar.json").write_text(json.dumps(avatar_meta, ensure_ascii=False, indent=2), encoding="utf-8")
    (public/"source_motion.json").write_text(json.dumps(avatar.motion, ensure_ascii=False), encoding="utf-8")
    if animation_library is not None:
        (public/"animation_library.json").write_text(json.dumps(animation_library, ensure_ascii=False), encoding="utf-8")
    if avatar_lods is not None:
        lod_meta={}
        for name,item in avatar_lods.items():
            lod_meta[name]=[]
            for lod in item["lods"]:
                fn=f"avatar_{name}_lod{lod['level']}.voxelbin"
                local_idx=np.floor(lod["voxels"]/max(item["base"]["voxel_size"],1e-6)).astype(np.int32)
                write_voxelbin(public/fn, local_idx, lod["colors"])
                lod_meta[name].append({"level":lod["level"],"file":f"/assets/{fn}","distance":lod["distance"],"voxel_size":item["base"]["voxel_size"]})
        (public/"avatar_lods.json").write_text(json.dumps(lod_meta, ensure_ascii=False, indent=2), encoding="utf-8")
    (public/"collision.json").write_text(json.dumps(collision, ensure_ascii=False), encoding="utf-8")
    (public/"navgrid.json").write_text(json.dumps(navgrid, ensure_ascii=False), encoding="utf-8")

    manifest = {
        "scene": {"meta": "/assets/scene_manifest.json", "quality": voxel_world.quality},
        "avatar": {"meta": "/assets/avatar.json", "motion": "/assets/source_motion.json",
                   "animations": "/assets/animation_library.json" if animation_library is not None else None,
                   "lods": "/assets/avatar_lods.json" if avatar_lods is not None else None,
                   "quality": avatar.quality},
        "collision": {"file": "/assets/collision.json", "status": collision.get("status", "ok")},
        "navgrid": {"file": "/assets/navgrid.json", "status": navgrid.get("status", "ok")},
        "game": cfg["game"],
        "voxel": cfg["voxel"],
        "pipeline": pipeline_meta,
    }
    (public/"manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest
