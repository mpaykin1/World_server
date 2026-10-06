#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -lt 2 ]; then echo "usage: $0 <werkkzeug3_kkrieger-root> <work-dir>" >&2; exit 2; fi

WS_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
KK_ROOT="$(cd "$1" && pwd)"
mkdir -p "$2"
WORK="$(cd "$2" && pwd)"
CHROME_BIN="${CHROME_BIN:-$(command -v chromium || command -v google-chrome || command -v google-chrome-stable || true)}"
test -x "$CHROME_BIN"

python3 - "$KK_ROOT/wasm/cdp.js" <<'PY'
import sys
p=sys.argv[1]
s=open(p,encoding="utf-8").read()
old="const chrome = spawn('/usr/bin/chromium', ["
new="const chrome = spawn(process.env.CHROME_BIN || '/usr/bin/chromium', ["
if old not in s: raise SystemExit("upstream cdp launcher drift")
open(p,"w",encoding="utf-8").write(s.replace(old,new))
PY

cp "$KK_ROOT/data/kkrieger3383.kx" "$WORK/original.kx"
cat > "$WORK/recipe.json" <<'JSON'
{"id":"material-proof","objects":[{"id":"box","primitive":"cube","params":{"tessellate":[1,1,1]},"position":[0,0,-2],"scale":[10,10,10],"modifiers":[{"kind":"bevel","params":{"amount":0.08}}]}]}
JSON
node "$WS_ROOT/tools/krieger-total-control/semantic-kx-authoring.mjs"   "$WORK/recipe.json" "$KK_ROOT" "$WORK/original.kx" "$WORK/authored.kx" "$WORK/authored-plan.json"
node "$WS_ROOT/tools/krieger-total-control/kx-visual-materialize.mjs"   "$WORK/authored.kx" "$WORK/materialized.kx" > "$WORK/materialize.json"
node "$WS_ROOT/tools/krieger-total-control/kx-runtime-root-attach.mjs"   "$WORK/materialized.kx" "$WORK/baseline.kx" > "$WORK/attach.json"
node "$WS_ROOT/tools/krieger-total-control/kx-material-mutate.mjs"   "$WORK/baseline.kx" "$WORK/negative.kx" unreachable "$WORK/negative-mutation.json"
node "$WS_ROOT/tools/krieger-total-control/kx-material-mutate.mjs"   "$WORK/baseline.kx" "$WORK/mutated.kx" reachable "$WORK/reachable-mutation.json"

run_browser() {
  local label="$1"
  local shot="$WORK/${label}.png"
  local log="$WORK/${label}.log"
  local steps="wait:2,start,wait:16,key:Return,wait:5,key:Return,wait:5,key:Return,wait:5,log:CurrentRoot:20,px,shot:$shot"
  if [ "$label" = "baseline" ]; then steps="$steps,shot:$WORK/aa-repeat.png"; fi
  python3 -m http.server 8769 --bind 127.0.0.1 --directory "$KK_ROOT/wasm/dist_release" >"$WORK/${label}-server.log" 2>&1 &
  local server_pid=$!
  trap "kill $server_pid 2>/dev/null || true" RETURN
  for _ in $(seq 1 50); do
    if curl -fsS "http://127.0.0.1:8769/kkrieger.html?data=3383" >/dev/null; then break; fi
    sleep .2
  done
  CHROME_BIN="$CHROME_BIN" node "$KK_ROOT/wasm/cdp.js"     --url "http://127.0.0.1:8769/kkrieger.html?data=3383&res=1024x768"     --window 1024,768 --steps "$steps" >"$log" 2>&1
  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
  trap - RETURN
  test -s "$shot"
  grep -F "CurrentRoot=2" "$log" >/dev/null
  grep -F "[cdp] pixels:" "$log" >/dev/null
}

build_and_run() {
  local label="$1"
  local kx="$2"
  cp "$kx" "$KK_ROOT/data/kkrieger3383.kx"
  (cd "$KK_ROOT"; KK_RELEASE=1 bash wasm/build.sh ${3:-})
  run_browser "$label"
}

build_and_run baseline "$WORK/baseline.kx" clean
build_and_run negative "$WORK/negative.kx"
build_and_run mutated "$WORK/mutated.kx"
build_and_run restored "$WORK/baseline.kx"

python3 "$WS_ROOT/tools/krieger-total-control/verify-material-browser-proof.py"   "$WORK/baseline.png" "$WORK/aa-repeat.png" "$WORK/negative.png" "$WORK/mutated.png" "$WORK/restored.png"   "$WORK/reachable-mutation.json" "$WORK/negative-mutation.json" "$WORK/material-proof.json"
