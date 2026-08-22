# AI3D Local Hardware — 2026-08-21

> Машинно-читаемый: `AI3D_LOCAL_HARDWARE.json`

## Windows
- **OS**: Microsoft Windows 10 Home Single Language 10.0.19045 (64-bit)
- **CPU**: Intel(R) Core(TM) i7-3612QM @ 2.10GHz — 4 ядра / 8 потоков, Ivy Bridge, 2.1 GHz (turbo 3.1)
- **RAM**: 16 GB total (17028370432), free ~4.1 GB, TotalVisible 16 GB
- **Disk C:**: 476 GB total, 203 GB free (42%), NTFS, pagefile `C:\pagefile.sys` peak 8188 MB
- **GPU 0**: NVIDIA GeForce GT 740M — **Kepler, 2 GB VRAM**, Driver 25.21.14.2531 (2019, очень старый), **nvidia-smi NOT FOUND**, CUDA runtime NOT AVAILABLE
- **GPU 1**: Intel HD Graphics 4000 (integrated, 2 GB shared)
- **CUDA Toolkit**: `nvcc` NOT FOUND, **cuDNN** not installed, **PyTorch CUDA** `torch not installed / cuda_available false`, Compute Capability **3.0** (Kepler) — ниже требуемых 7.0+ для TRELLIS.2 / flash-attn
- **WSL2**: не установлен (wsl --list показывает help, дистрибутивов 0), GPU passthrough **false**
- **Docker Desktop**: not installed, GPU support **false**
- **Python**: 3.11.9 (default) + 3.14.6, pip 24.0, **Conda/Mamba NOT FOUND**
- **Git**: 2.54.0.windows.1, **Node**: v24.15.0, **npm**: 11.12.1
- **Blender**: **FOUND** `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe` (auto-found via ProgramFilesGlob, headless OK)
- **Godot**: NOT FOUND (not in PATH)
- **Build Tools**: VS `C:\Program Files\Microsoft Visual Studio\18` detected, `cl` NOT IN PATH, `cmake`/`ninja` not found, CUDA compiler absent
- **DirectML**: not available (GPU too old)

## Вывод по TRELLIS.2
- **Native Windows**: **IMPOSSIBLE** — TRELLIS.2 требует Linux + CUDA 12.1 + 24GB VRAM, Kepler 2GB не поддерживается, driver 2019 без nvidia-smi, flash-attn/nvdiffrast требуют Ampere+.
- **WSL2**: **IMPOSSIBLE** — WSL2 не установлен, даже если установить — GT 740M не поддерживает WSL GPU passthrough (требуется WDDM 2.9+ / Driver 2022+ / Turing+).
- **Docker+WSL2 GPU**: **IMPOSSIBLE** — Docker не установлен + GPU не поддерживает.
- **CPU-only / offload / low-VRAM**: **IMPOSSIBLE** для TRELLIS — модель 4B + o-voxel требует CUDA, CPU inference не реализован upstream.
- **Решение**: `TRELLIS_UNAVAILABLE` — не тратить время на установку, переход к CPU pipeline.

## Что реально возможно без платного GPU
- **Depth Anything V2 Small** (CPU, Apache-2.0) — да, via `C:\...\Depth-Anything-V2`
- **Blender 5.1 CPU** — да, headless `blender.exe --background --python`
- **BuildingGeneratorThreeJS** — да, через Blender Geometry Nodes
- **bene-proggen-maps** — да, через Blender
- **InstantMesh** — код есть (`майн/InstantMesh`), но веса/ CUDA отсутствуют, placeholder только — настоящий inference требует CUDA 12.1 + 8GB+ и веса TencentARC → **PLACEHOLDER ONLY**
- **Voxel/Godot** — да, `voxelsrv`/`LittleCubes` + Godot glTF stub

**Итог**: Этот компьютер **не может** запустить TRELLIS/InstantMesh GPU inference. Единственный блокер — внешний Linux NVIDIA 24GB сервер. Весь CPU/Blender pipeline должен быть доведён до объёмной геометрии.
