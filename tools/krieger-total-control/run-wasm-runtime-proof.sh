#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: $0 <werkkzeug3_kkrieger-root> <work-dir>" >&2
  exit 2
fi

WS_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
KK_ROOT="$(cd "$1" && pwd)"
mkdir -p "$2"
WORK="$(cd "$2" && pwd)"

command -v node >/dev/null
command -v em++ >/dev/null
command -v emcc >/dev/null

cat > "$WORK/recipe.json" <<'JSON'
{"id":"wasm-runtime-proof","objects":[{"id":"box","primitive":"cube","position":[0,0,-2],"scale":[2,2,2],"modifiers":[{"kind":"bevel","params":{"amount":0.1}}]}]}
JSON

node "$WS_ROOT/tools/krieger-total-control/semantic-kx-authoring.mjs" \
  "$WORK/recipe.json" "$KK_ROOT" "$KK_ROOT/data/kkrieger3383.kx" \
  "$WORK/authored.kx" "$WORK/authored-plan.json"

node "$WS_ROOT/tools/krieger-total-control/kx-runtime-root-attach.mjs" \
  "$WORK/authored.kx" "$WORK/runtime-attached.kx" > "$WORK/attach.json"

node "$WS_ROOT/tools/krieger-total-control/kx-graph-codec.mjs" \
  "$WORK/runtime-attached.kx" > "$WORK/codec.json"

cp "$KK_ROOT/data/kkrieger3383.kx" "$WORK/kkrieger3383.original.kx"
cp "$WORK/runtime-attached.kx" "$KK_ROOT/data/kkrieger3383.kx"

(
  cd "$KK_ROOT"
  bash wasm/build_headless.sh clean
)

set +e
timeout 240 node "$KK_ROOT/wasm/dist_headless/kk_headless.js" >"$WORK/headless.log" 2>&1
rc=$?
set -e
cat "$WORK/headless.log"

if [ "$rc" -ne 0 ]; then
  echo "headless runtime exited with $rc" >&2
  exit "$rc"
fi

grep -F "[kk] generation finished" "$WORK/headless.log" >/dev/null
grep -E "\[kk\] headless: done after [0-9]+ frames, root 2, [1-9][0-9]* level frames" "$WORK/headless.log" >/dev/null

if grep -E "AddressSanitizer|runtime error:|\[kk\] FATAL:|Aborted\(|abort\(" "$WORK/headless.log"; then
  echo "runtime sanitizer/fatal marker found" >&2
  exit 1
fi

node --input-type=module - "$WORK/runtime-attached.kx" "$WORK/attach.json" <<'NODE'
import fs from "node:fs";
import {parseKxGraph} from "./tools/krieger-total-control/kx-graph-codec.mjs";
const graph=parseKxGraph(fs.readFileSync(process.argv[2]));
const attach=JSON.parse(fs.readFileSync(process.argv[3],"utf8"));
if(graph.header.roots[2]!==attach.newRoot)throw new Error("root evidence drift");
if(!attach.boundary?.authoredGraphReachableFromExistingRoots)throw new Error("authored graph not reachable");
const root=graph.ops[attach.newRoot];
if(root.realId!==0x0d)throw new Error("runtime root is not Demo");
const viewport=graph.ops[attach.viewportIndex];
if(viewport.realId!==0xf0)throw new Error("runtime bridge has no Viewport");
const combined=graph.ops[attach.combinedSceneIndex];
if(combined.realId!==0xc1)throw new Error("runtime bridge has no Scene_Add");
NODE

cat > "$WORK/runtime-proof.json" <<'JSON'
{
  "pass": true,
  "upstreamCommit": "3bf0ff017372e640e966c2785a4d95a998cec242",
  "headlessBuild": true,
  "asanFatalMarkers": false,
  "generationFinished": true,
  "reachedGameRoot2": true,
  "authoredGraphReachable": true
}
JSON
cat "$WORK/runtime-proof.json"
