# TRELLIS.2 Audit — Installed at `C:\Users\user\Desktop\3дгенерация\TRELLIS.2` (75fbf01)

## Upstream Requirements (from README)
- **System**: Linux only (code tested only on Linux)
- **Hardware**: NVIDIA GPU ≥24GB VRAM (verified on A100/H100), CUDA Toolkit 12.4 recommended, Python 3.8+, Conda
- **Deps**: `flash-attn`, `nvdiffrast`, `nvdiffrec`, `o-voxel`, `cumesh`, `flexgemm` — all compiled CUDA extensions, `setup.sh --new-env --basic --flash-attn --nvdiffrast --nvdiffrec --cumesh --o-voxel --flexgemm`
- **Model**: 4B params, `microsoft/TRELLIS.2-4B`, ~3s (512) / 17s (1024) / 60s (1536) on H100, O-Voxel sparse VAE, PBR (BaseColor/Roughness/Metallic/Opacity)
- **VRAM**: 24GB minimum, H100 used for tests; low-VRAM configs not officially supported, offload not documented

## This Computer Check
- **GPU**: GeForce GT 740M Kepler 2GB, Compute 3.0, Driver 25.21.14.2531 (2019), `nvidia-smi` NOT FOUND, `nvcc` NOT FOUND, `torch.cuda.is_available()` false (no torch CUDA)
- **VRAM tests**: 1GB/2GB allocation impossible (no CUDA), `flash-attn` requires Ampere+ (8.0+), `nvdiffrast` requires CUDA — **cannot compile**
- **Native Windows**: FAIL (Linux-only)
- **WSL2**: FAIL — WSL not installed, GT 740M WDDM 2.1 < 2.9, no GPU passthrough
- **Docker+WSL2**: FAIL — Docker not installed + GPU unsupported
- **CPU-only**: FAIL — TRELLIS has no CPU inference path upstream
- **Low-VRAM / offload / FP16/BF16 / sequential**: Not applicable — no CUDA to offload

## Decision
`TRELLIS_UNAVAILABLE` — **not** `LOCAL_FULL`/`LOW_VRAM`/`WSL2`. Do not download 20GB+ weights, do not attempt `setup.sh` (would waste time and hang). Worker will use `TRELLIS_REMOTE_ONLY` (Linux NVIDIA 24GB server) and locally fallback to `CPU reconstruction`.

## What Would Be Needed for TRELLIS
- Linux (Ubuntu 22.04) + NVIDIA RTX 4090/A100/H100 24GB+ + Driver 535+ + CUDA 12.4 + Conda + `setup.sh`
- Then: `AI3D_SHARED_SECRET`, `TRELLIS2_HOME=/opt/ai3d/external/TRELLIS.2`, `docker compose up`
