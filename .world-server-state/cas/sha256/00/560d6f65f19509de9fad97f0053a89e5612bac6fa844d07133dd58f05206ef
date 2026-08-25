import argparse
from pathlib import Path
from .config import load_config
from .pipeline import run_pipeline

def main():
    ap=argparse.ArgumentParser(description="Video -> playable voxel game V4")
    ap.add_argument("video")
    ap.add_argument("--out", default="build/game")
    ap.add_argument("--config", default=None)
    a=ap.parse_args()
    cfg_path = a.config or ("config.yaml" if Path("config.yaml").exists() else None)
    run_pipeline(a.video, a.out, load_config(cfg_path))

if __name__=="__main__":
    main()
