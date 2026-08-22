#!/usr/bin/env bash
set -euo pipefail
WORKER="$(cd "$(dirname "$0")/.." && pwd)"
EXTERNAL="${AI3D_EXTERNAL_ROOT:-/opt/ai3d/external}"
mkdir -p "$EXTERNAL" "$WORKER/runtime/models"

clone_pinned() {
  local name="$1" url="$2" commit="$3" recursive="${4:-0}"
  if [[ ! -d "$EXTERNAL/$name/.git" ]]; then
    git init "$EXTERNAL/$name"
    git -C "$EXTERNAL/$name" remote add origin "$url"
    git -C "$EXTERNAL/$name" fetch --depth 1 origin "$commit"
    git -C "$EXTERNAL/$name" checkout --detach FETCH_HEAD
    if [[ "$recursive" == "1" ]]; then git -C "$EXTERNAL/$name" submodule update --init --recursive; fi
  fi
}
clone_pinned "Depth-Anything-V2" "https://github.com/DepthAnything/Depth-Anything-V2.git" "a561b849ebae10a6f5ef49e26c83cbbcd36c71bf"
clone_pinned "BuildingGeneratorThreeJS" "https://github.com/achrefelouafi/BuildingGeneratorThreeJS.git" "74cb71b0db1efa894a9763fba3ae67ca8ea54547"
clone_pinned "bene-proggen-maps" "https://github.com/Beneking102/bene-proggen-maps.git" "ed622c5ce10f33092c7b651628d7c0d2015dcd61"
clone_pinned "TRELLIS.2" "https://github.com/microsoft/TRELLIS.2.git" "75fbf0183001ed9876c8dbb35de6b68552ee08bd" "1"

if command -v conda >/dev/null 2>&1; then
  if ! conda env list | awk '{print $1}' | grep -qx trellis2; then
    echo "Installing TRELLIS.2 conda environment; this is the long GPU dependency step."
    (cd "$EXTERNAL/TRELLIS.2" && bash -lc 'source ./setup.sh --new-env --basic --flash-attn --nvdiffrast --nvdiffrec --cumesh --o-voxel --flexgemm')
  fi
  conda run -n trellis2 python -m pip install -r "$WORKER/requirements.txt"
  conda run -n trellis2 python -m pip install -r "$EXTERNAL/Depth-Anything-V2/requirements.txt"
else
  echo "ERROR: conda is required for the automated TRELLIS.2 environment setup." >&2
  exit 2
fi

SECRET="${AI3D_SHARED_SECRET:-$(python - <<'PY'
import secrets
print(secrets.token_urlsafe(32))
PY
)}"
BLENDER="${BLENDER_BIN:-$(command -v blender || true)}"
cat > "$WORKER/.env" <<ENV
AI3D_SHARED_SECRET=$SECRET
AI3D_ALLOWED_ORIGINS=${AI3D_ALLOWED_ORIGINS:-*}
AI3D_MAX_UPLOAD_MB=${AI3D_MAX_UPLOAD_MB:-25}
AI3D_MAX_WORKERS=${AI3D_MAX_WORKERS:-1}
AI3D_RUNTIME_DIR=$WORKER/runtime
AI3D_MODEL_DIR=$WORKER/runtime/models
TRELLIS2_HOME=$EXTERNAL/TRELLIS.2
DEPTH_ANYTHING_HOME=$EXTERNAL/Depth-Anything-V2
BUILDING_GENERATOR_HOME=$EXTERNAL/BuildingGeneratorThreeJS
PROCGEN_MAPS_HOME=$EXTERNAL/bene-proggen-maps
BLENDER_BIN=${BLENDER:-blender}
ENV

echo "AI3D Linux worker bootstrap complete."
echo "Start with: cd '$WORKER' && set -a && source .env && set +a && conda run -n trellis2 python -m uvicorn server:app --host 0.0.0.0 --port 8787 --workers 1"
if [[ -z "$BLENDER" ]]; then echo "WARNING: Blender 4.2+ was not detected; building/map modes remain unavailable until BLENDER_BIN is configured."; fi
