#!/usr/bin/env bash
set -euo pipefail
VIDEO="${1:-input.mp4}"
if [ ! -d .venv ]; then python3 -m venv .venv; fi
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -e .
python -m compileall video2game_voxel
pytest -q
video2game-voxel "$VIDEO" --out build/game --config config.yaml
python REGRESSION_CHECK.py build/game
cd build/game
npm install
npm run build
npm run dev
