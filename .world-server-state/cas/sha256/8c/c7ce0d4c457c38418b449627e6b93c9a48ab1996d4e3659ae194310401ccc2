#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -f .env ]]; then set -a; source .env; set +a; fi
exec python -m uvicorn server:app --host 0.0.0.0 --port "${AI3D_PORT:-8787}" --workers 1
