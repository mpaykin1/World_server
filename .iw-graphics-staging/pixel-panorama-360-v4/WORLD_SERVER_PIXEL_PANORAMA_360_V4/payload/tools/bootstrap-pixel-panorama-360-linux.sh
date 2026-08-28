#!/usr/bin/env bash
set -euo pipefail
echo '== Pixel Panorama 360 V4 bootstrap =='
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y ffmpeg imagemagick python3 python3-pip
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y ffmpeg ImageMagick python3 python3-pip
else
  echo 'Install ffmpeg, ImageMagick and Python 3 manually for this distro.' >&2
  exit 1
fi
python3 -m pip install --user --upgrade pillow numpy requests || true
if ! command -v oxipng >/dev/null 2>&1 && command -v cargo >/dev/null 2>&1; then cargo install oxipng --locked; fi
echo 'Run npm install from World_server root to install sharp/libvips.'
node scripts/pixel-panorama-360-tools-verify.cjs
