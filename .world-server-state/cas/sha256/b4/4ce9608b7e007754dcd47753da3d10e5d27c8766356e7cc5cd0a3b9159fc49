@echo off
setlocal
if not exist input.mp4 (
  echo ERROR: Put video next to this file and name it input.mp4
  pause
  exit /b 2
)
if not exist .venv py -3 -m venv .venv
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -e .
python -m compileall video2game_voxel
pytest -q
video2game-voxel input.mp4 --out build\game --config config.yaml
if errorlevel 1 exit /b 3
python REGRESSION_CHECK.py build\game
if errorlevel 1 exit /b 4
cd build\game
call npm install
call npm run build
call npm run dev
