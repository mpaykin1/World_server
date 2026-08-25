# World Server AI3D integration

## Architecture

Browser → `/api/ai3d` on World_server/Vercel → short-lived signed session → direct upload to persistent AI3D GPU worker → queued server-side generation → validated GLB/PNG result.

Heavy model weights and the third-party repositories are deliberately not committed into World_server. The worker references them by environment path and can clone/install them automatically on a GPU host. This keeps Git small, avoids Vercel size/runtime limits, prevents loading TRELLIS for every request, and isolates GPL code from the World_server source tree.

## Required Vercel variables

- `AI3D_WORKER_URL=https://<gpu-worker-host>`
- `AI3D_SHARED_SECRET=<same long random secret as worker>`
- optional `AI3D_TOKEN_TTL_SECONDS=600`
- optional `AI3D_MAX_UPLOAD_MB=25`

## Worker requirements

For full image-to-3D: Linux, NVIDIA CUDA GPU, TRELLIS.2 environment. Upstream TRELLIS.2 documents 24GB+ VRAM. Blender 4.2+ is required for BuildingGeneratorThreeJS and bene-proggen-maps modes.

## Commercial-safety default

Depth Anything V2's upstream README says the Small model is Apache-2.0 while Base/Large/Giant use CC-BY-NC-4.0. This integration hard-wires the Small model by default instead of accidentally enabling the non-commercial checkpoints.
