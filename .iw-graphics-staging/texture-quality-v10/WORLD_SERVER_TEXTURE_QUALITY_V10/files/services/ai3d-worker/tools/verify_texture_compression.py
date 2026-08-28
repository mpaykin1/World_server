from __future__ import annotations
import argparse, json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ai3d.texture_runtime_v4 import verify_compressed_container
p=argparse.ArgumentParser(); p.add_argument('file'); p.add_argument('--kind', required=True, choices=['ktx2','dds','astc']); a=p.parse_args()
result=verify_compressed_container(Path(a.file), a.kind)
print(json.dumps(result, indent=2))
raise SystemExit(0 if result['signatureVerified'] else 2)
