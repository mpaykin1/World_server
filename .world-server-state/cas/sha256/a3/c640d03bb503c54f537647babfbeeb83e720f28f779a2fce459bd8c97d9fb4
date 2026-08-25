# AI3D GPU Worker — deployable on any Linux NVIDIA host without changing World_server
# Control plane (World_server/Vercel) stays separate; this image only runs the heavy worker.
FROM nvidia/cuda:12.1.0-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Base deps + Blender 4.2 (auto-found by plugins) + Node for discovery smoke
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3.11-venv python3-pip \
    git curl wget ca-certificates \
    blender \
    nodejs npm \
    libgl1 libglib2.0-0 libsm6 libxext6 libxrender1 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy worker code first for layer cache
COPY requirements.txt ./
RUN pip3 install --upgrade pip && pip3 install -r requirements.txt

# Copy rest of worker
COPY . .

# Create runtime dirs
RUN mkdir -p runtime/jobs runtime/models

# External engines are NOT baked into the image (keeps it small).
# On first start, bootstrap-linux.sh can clone pinned commits into /opt/ai3d/external
# or you can mount them via volumes / env vars.
ENV AI3D_RUNTIME_DIR=/app/runtime \
    AI3D_MODEL_DIR=/app/runtime/models \
    TRELLIS2_HOME=/opt/ai3d/external/TRELLIS.2 \
    DEPTH_ANYTHING_HOME=/opt/ai3d/external/Depth-Anything-V2 \
    BUILDING_GENERATOR_HOME=/opt/ai3d/external/BuildingGeneratorThreeJS \
    PROCGEN_MAPS_HOME=/opt/ai3d/external/bene-proggen-maps \
    INSTANTMESH_HOME=/opt/ai3d/external/InstantMesh \
    BLENDER_BIN=blender

EXPOSE 8787

# Healthcheck hits the FastAPI /health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD curl -f http://localhost:8787/health || exit 1

CMD ["python3", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8787", "--workers", "1"]
