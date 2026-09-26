# ABot-Recon video reconstruction integration

World_server reuses the existing AI3D FastAPI/SQLite worker and adds one bounded
`video_to_3d` mode. There is no second queue, control plane, or GPU autoscaler.

## Data path

`browser -> /api/ai3d session -> existing AI3D worker -> ABot-Recon -> colored PLY + poses + metadata`

The browser uploads RGB video directly to the worker with the existing short-lived
HMAC bearer token. The worker extracts a bounded frame sequence with ffmpeg,
executes the official ABot-Recon `demo.py` in an isolated Python environment,
exports `world_points.pt + colors.pt` to a binary colored PLY, copies camera-pose
evidence, and deletes disposable frames/raw tensors.

Defaults are intentionally suitable for shared/free GPU experiments:
- 3 inference frames per second;
- 200 frames maximum per job (upstream hard ceiling remains 22,000);
- SDPA attention;
- loop closure disabled unless explicitly requested;
- at most 2,000,000 points in the downloadable PLY.

These are cost/resource defaults, not quality claims. Longer/higher-density runs
can be requested through job parameters when a worker has enough GPU budget.

## Worker environment

The Linux bootstrap pins upstream ABot-Recon commit
`7a10be152d0478265270f46c637f9de963e7a60e` and installs it into a separate
`abot-recon` conda environment. The main AI3D worker calls that environment
through `ABOT_RECON_PYTHON`; this prevents ABot-Recon's pinned PyTorch/CUDA
requirements from changing the existing TRELLIS runtime.

Required variables:
- `ABOT_RECON_HOME`
- `ABOT_RECON_PYTHON`
- optional `FFMPEG_BIN`
- `AI3D_MAX_VIDEO_UPLOAD_MB` (default 100 MB)

A real GPU run is fail-closed: no CUDA/runtime means the job fails instead of
returning a fake reconstruction.

## Evidence boundary

ABot-Recon reconstructs geometry observed by the supplied RGB viewpoints. It
does not recover hidden rooms/surfaces, game scripts, physics, semantic gameplay
or authoritative collision data. Those remain later World_server stages.

## Licensing

The upstream **source code** is Apache-2.0. The official published **model
weights** are CC BY-NC 4.0 and are intended for non-commercial research and
education; commercial use requires separate written authorization from the
relevant rights holders. World_server therefore exposes the adapter but must not
silently treat the official weights as commercial-safe.

Upstream: `amap-cvlab/ABot-Recon`, pinned revision above.


## Free Hugging Face ZeroGPU path

World_server also contains a self-owned ZeroGPU worker at
`deploy/huggingface/abot-recon-zero-gpu/`. It exposes a public Gradio API but
requires a long shared secret on every reconstruction call, so anonymous callers
cannot consume the worker quota.

Deployment is automated by `scripts/deploy-abot-zerogpu.py`. It creates a
public Gradio Space on the `zero-a10g` flavor, uploads the worker, and stores
`ABOT_WORKER_SECRET` as a Space secret. The AI3D worker then needs only:

- `ABOT_RECON_ZEROGPU_URL`
- `ABOT_RECON_ZEROGPU_SECRET`

When both are configured, the ABot adapter prefers ZeroGPU and falls back to a
local Linux/CUDA runtime only when explicitly requested with `forceLocalGpu`.
The remote job is still evidence-gated: it must return a valid non-empty
`reconstruction.ply` archive or the job fails.

The deploy command requires one owner credential, `HF_TOKEN` with write access.
No Hugging Face token or worker secret is stored in Git.
