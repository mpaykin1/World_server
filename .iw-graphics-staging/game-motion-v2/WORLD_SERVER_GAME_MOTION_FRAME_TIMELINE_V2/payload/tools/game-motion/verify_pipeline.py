#!/usr/bin/env python3
from __future__ import annotations
import tempfile, subprocess
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np
import imageio_ffmpeg

def main():
    ff=imageio_ffmpeg.get_ffmpeg_exe()
    r=subprocess.run([ff,"-version"],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
    if r.returncode: raise SystemExit("ffmpeg unavailable")
    with tempfile.TemporaryDirectory() as td:
        root=Path(td); frames=root/"frames"; frames.mkdir()
        for i in range(6):
            im=Image.new("RGBA",(64,64),(20,20,30,255));d=ImageDraw.Draw(im);d.rectangle((4+i*6,20,20+i*6,36),fill=(220,180,80,255));im.save(frames/f"frame_{i:05d}.png")
        arr=np.asarray(Image.open(frames/"frame_00000.png"))
        if arr.shape!=(64,64,4): raise SystemExit("Pillow/NumPy verification failed")
        imgs=[Image.open(p).convert("RGBA") for p in sorted(frames.glob("*.png"))]
        out=root/"test.png";imgs[0].save(out,save_all=True,append_images=imgs[1:],duration=50,loop=0)
        im=Image.open(out)
        if getattr(im,"n_frames",1)<2: raise SystemExit("APNG verification failed")
    print(f"[verify_pipeline] PASS ffmpeg={ff}")
if __name__=="__main__": main()
