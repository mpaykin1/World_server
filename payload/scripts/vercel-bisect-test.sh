#!/usr/bin/env bash
set -euo pipefail
URL="${VERCEL_BISECT_URL:-${1:-}}"
if [ -z "${URL}" ]; then
  echo "No deployment URL supplied" >&2
  exit 125
fi
QUALITY_BASE_URL="${URL}" node scripts/post-deploy-smoke.js
