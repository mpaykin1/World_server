#!/usr/bin/env bash
set -euo pipefail
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y ffmpeg
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y ffmpeg
fi
python -m pip install -r requirements.txt
python - <<'PY'
from ai3d.plugins.pixel_panorama_360 import PixelPanorama360Engine
p=PixelPanorama360Engine()
print(p.status())
if not p.available(): raise SystemExit(1)
PY
