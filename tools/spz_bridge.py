#!/usr/bin/env python3
from __future__ import annotations
import os, subprocess, tempfile
from pathlib import Path
import numpy as np
from quality_common import sample_ply_xyz
from spz_native_decoder import decode_positions as decode_native_positions


def decode_positions(path:Path, external_command:str|None=None, max_points:int=700_000)->tuple[np.ndarray,dict]:
    errors=[]
    # V4 default: built-in exact gaussian-center decoder for legacy v1-v3 and v4 containers.
    # This makes collision generation independent of an optional renderer binding.
    try:
        return decode_native_positions(path,max_points=max_points)
    except Exception as exc:
        errors.append(f'world-native:{exc}')
    # Secondary path: official/current Python binding. Useful if a future SPZ revision changes packing.
    try:
        import spz  # type: ignore
        cloud=spz.load_spz(str(path))
        pos=np.asarray(cloud.positions,dtype=np.float32).reshape(-1,3)
        source=len(pos)
        if len(pos)>max_points:
            idx=np.linspace(0,len(pos)-1,max_points,dtype=np.int64);pos=pos[idx]
        return pos,{'decoder':'python-spz','native':True,'sourcePoints':int(source),'sampledPoints':int(len(pos)),'sourceAssetModified':False}
    except Exception as exc: errors.append(f'python-spz:{exc}')
    # Last-resort adapter for future/third-party SPZ dialects.
    cmd=external_command or os.environ.get('SPZ_DECODER_COMMAND')
    if cmd:
        with tempfile.TemporaryDirectory(prefix='world-spz-') as td:
            out=Path(td)/'decoded.ply';subprocess.run(cmd.format(input=str(path),output=str(out)),shell=True,check=True)
            if not out.exists():raise RuntimeError('SPZ decoder command did not create output PLY')
            pts=sample_ply_xyz(out,max_points=max_points)
            return pts,{'decoder':'external-command','native':False,'sampledPoints':int(len(pts)),'sourceAssetModified':False}
    raise RuntimeError('No SPZ decoder path succeeded. Attempts: '+' | '.join(errors))
