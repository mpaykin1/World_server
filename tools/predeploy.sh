#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
python tools/quality_pipeline.py
for f in src/*.js tools/*.mjs api/*.js; do node --check "$f"; done
if [ "${RUN_BROWSER_GATES:-0}" = "1" ]; then
  node tools/playtest.mjs
  node tools/fuzz_playtest.mjs
  node tools/visual_regression.mjs
fi
printf '%s\n' 'PREDEPLOY: PASS — static/regression/unit gates passed; browser gates run when RUN_BROWSER_GATES=1 (CI always runs them).'
