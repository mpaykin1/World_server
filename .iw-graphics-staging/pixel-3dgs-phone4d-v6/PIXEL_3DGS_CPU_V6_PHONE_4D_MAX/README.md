# Pixel 3DGS CPU V6 — Phone + 4D MAX

CPU-only Pixel-3DGS pipeline for panoramas, normal video, 360 video, spaces and characters.

## V6 major additions
- Phone capture PWA at `/capture-app/`.
- Synchronized video + orientation + IMU + optional GPS upload.
- Native metric pose ingest path for future ARKit/ARCore exports.
- Visual-odometry + phone-sensor pose fusion.
- Automatic optional ONNX model activation from `models/optional/` or environment variables.
- Pair matcher adapter for LightGlue/LoFTR-style ONNX wrappers.
- Dense-flow adapter for RAFT-style ONNX wrappers.
- Optional semantic/transient segmentation mask.
- CPU temporal deformation tracks for moving characters (`dynamic4d_tracks.npz`).
- Stronger full regression/deployment gate for Desktop AI.

## Run
```bash
pip install -r requirements.txt
python tools/regression_runner.py
uvicorn pixel3dgs.api:app --host 0.0.0.0 --port 8010
```

Phone capture:
`http://SERVER:8010/capture-app/`

Model status:
```bash
python models_cli.py status
```

## Optional CPU quality models
Install `requirements-optional-cpu.txt`, then place compatible ONNX files in `models/optional/`.
They are detected and activated automatically; the base pipeline does not depend on them.

## Honest limitation
V6 does not pretend to be CUDA-trained 3DGS or learned 4DGS. Without a GPU it uses multi-view CPU reconstruction, anisotropic pixel surfels, geometry completion, optional CPU neural priors, and temporal deformation tracks.
