#!/usr/bin/env bash
set -euo pipefail
: "${VERCEL_TOKEN:?VERCEL_TOKEN required}"
: "${QUALITY_GOOD_DEPLOYMENT:?QUALITY_GOOD_DEPLOYMENT required}"
: "${QUALITY_BAD_DEPLOYMENT:?QUALITY_BAD_DEPLOYMENT required}"
TEST="${QUALITY_BISECT_TEST_SCRIPT:-scripts/vercel-bisect-test.sh}"
vercel bisect \
  --good "${QUALITY_GOOD_DEPLOYMENT}" \
  --bad "${QUALITY_BAD_DEPLOYMENT}" \
  --run "${TEST}" \
  --token="${VERCEL_TOKEN}"
