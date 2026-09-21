# AI3D GPU Worker

One persistent compute service for all heavy 3D engines. World_server/Vercel remains the control plane; image bytes go directly from the browser to this worker using a short-lived HMAC token, so Vercel is not forced to proxy 25MB+ uploads or GPU work.

## Engines

- TRELLIS.2: primary image-to-3D GLB/PBR generation, lazy-loaded once and kept in GPU memory.
- Depth Anything V2 Small: server-side depth prepass/preview. Only the upstream Apache-2.0 Small model is enabled by default.
- BuildingGeneratorThreeJS: the included Blender Geometry Nodes source is evaluated headlessly and exported to a standalone GLB.
- bene-proggen-maps: external GPL Blender add-on called headlessly for city/terrain/dungeon generation.
- ABot-Recon: RGB video -> streaming 3D reconstruction, colored PLY + camera poses. Runs in an isolated `abot-recon` environment and defaults to a bounded 200-frame SDPA/no-loop-closure profile suitable for shared/free GPU experiments.

## Production

TRELLIS.2 upstream currently requires Linux + NVIDIA CUDA and states at least 24GB GPU memory. Run `scripts/bootstrap-linux.sh` on the GPU host. Configure the same `AI3D_SHARED_SECRET` in the worker and World_server/Vercel, plus `AI3D_WORKER_URL=https://your-worker-host` on Vercel.

The worker queue survives restarts in SQLite and resets interrupted jobs to queued. GPU concurrency defaults to one job to prevent model-VRAM collisions. Generated files are automatically hashed and GLB headers are validated before a job becomes `completed`.

For ABot-Recon set `ABOT_RECON_HOME` and `ABOT_RECON_PYTHON`; ffmpeg must be available. The Linux bootstrap pins the tested upstream revision and creates the isolated environment automatically. See `docs/ABOT_RECON_INTEGRATION.md`.

**License boundary:** ABot-Recon source is Apache-2.0, while the official released model weights are CC BY-NC 4.0. The adapter is therefore enabled for non-commercial research/testing by default; commercial use of those weights requires separate authorization.
