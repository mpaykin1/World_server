#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, math
from pathlib import Path
from PIL import Image

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("input_dir"); ap.add_argument("output_png"); ap.add_argument("output_json")
    ap.add_argument("--columns",type=int,default=0)
    args=ap.parse_args()
    files=sorted(Path(args.input_dir).glob("*.png"))
    if not files: raise SystemExit("No PNG frames")
    ims=[Image.open(f).convert("RGBA") for f in files]
    w=max(i.width for i in ims); h=max(i.height for i in ims)
    cols=args.columns or math.ceil(math.sqrt(len(ims))); rows=math.ceil(len(ims)/cols)
    sheet=Image.new("RGBA",(cols*w,rows*h),(0,0,0,0)); atlas={"frames":[],"frameWidth":w,"frameHeight":h,"columns":cols,"rows":rows}
    for idx,(f,im) in enumerate(zip(files,ims)):
        x=(idx%cols)*w;y=(idx//cols)*h;sheet.alpha_composite(im,(x,y))
        atlas["frames"].append({"index":idx,"file":f.name,"x":x,"y":y,"w":im.width,"h":im.height})
    Path(args.output_png).parent.mkdir(parents=True,exist_ok=True); sheet.save(args.output_png,optimize=True)
    Path(args.output_json).write_text(json.dumps(atlas,ensure_ascii=False,indent=2),encoding="utf-8")
    print(f"[pack_spritesheet] PASS frames={len(ims)} size={sheet.width}x{sheet.height}")
if __name__=="__main__": main()
