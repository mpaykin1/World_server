#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -lt 2 ]; then echo "usage: $0 <werkkzeug3_kkrieger-root> <work-dir>" >&2; exit 2; fi
WS_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
KK_ROOT="$(cd "$1" && pwd)"
mkdir -p "$2"
WORK="$(cd "$2" && pwd)"
CHROME_BIN="${CHROME_BIN:-$(command -v chromium || command -v google-chrome || command -v google-chrome-stable || true)}"
test -x "$CHROME_BIN"

# Pin both sides of the causal boundary. No gameplay source mutation is used.
python3 - "$KK_ROOT/kkriegergame.cpp" "$KK_ROOT/wasm/cdp.js" <<'PY'
import sys
game=open(sys.argv[1],"rb").read()
anchors=[
  b"sSystem->GetInput(0,id);\n  if(time<1000)\n  {\n    f = MouseTurnSpeed*(Switches[KGS_MOUSESPEED]+2)/7;\n    PlayerDir  += (id.Analog[0] - LastMouseX)*f;",
  b"PlayerDir  += (id.Analog[0] - LastMouseX)*f;",
  b"PlayerLook += (id.Analog[1] - LastMouseY)*f;",
  b'fprintf(stderr,"[kk] where pos=(%.3f %.3f %.3f) dir=%.4f look=%.4f\\n",PlayerPos.x,PlayerPos.y,PlayerPos.z,PlayerDir,PlayerLook);',
]
missing=[a for a in anchors if game.count(a)!=1]
if missing: raise SystemExit("pinned camera source drift: "+repr(missing))
p=sys.argv[2]
cdp=open(p,encoding="utf-8").read()
for needle in ["cmd === 'mmove'","Input.dispatchMouseEvent","cmd === 'eval'"]:
    if cdp.count(needle)<1: raise SystemExit("pinned CDP camera input drift: "+needle)
old="const chrome = spawn('/usr/bin/chromium', ["
new="const chrome = spawn(process.env.CHROME_BIN || '/usr/bin/chromium', ["
if old not in cdp: raise SystemExit("upstream cdp launcher drift")
open(p,"w",encoding="utf-8").write(cdp.replace(old,new))
PY

(cd "$KK_ROOT"; KK_RELEASE=1 bash wasm/build.sh clean)

run_phase() {
  local label="$1"
  local action="${2:-}"
  local log="$WORK/${label}.log"
  local shot="$WORK/${label}.png"
  local steps="wait:2,start,wait:16,key:Return,wait:5,key:Return,wait:5,key:Return,wait:5,focus"
  if [ -n "$action" ]; then steps="$steps,$action,wait:2"; fi
  steps="$steps,eval:window.__kkWhere=1,wait:1,log:where:80,shot:$shot"
  python3 -m http.server 8770 --bind 127.0.0.1 --directory "$KK_ROOT/wasm/dist_release" >"$WORK/${label}-server.log" 2>&1 &
  local server_pid=$!
  trap "kill $server_pid 2>/dev/null || true" RETURN
  for _ in $(seq 1 50); do
    if curl -fsS "http://127.0.0.1:8770/kkrieger.html?data=3383" >/dev/null; then break; fi
    sleep .2
  done
  if ! CHROME_BIN="$CHROME_BIN" node "$KK_ROOT/wasm/cdp.js"     --url "http://127.0.0.1:8770/kkrieger.html?data=3383&res=1024x768"     --window 1024,768 --steps "$steps" >"$log" 2>&1; then
    grep -F "chromium did not start" "$log" >/dev/null || return 1
    sleep 2
    CHROME_BIN="$CHROME_BIN" node "$KK_ROOT/wasm/cdp.js"       --url "http://127.0.0.1:8770/kkrieger.html?data=3383&res=1024x768"       --window 1024,768 --steps "$steps" >>"$log" 2>&1
  fi
  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
  trap - RETURN
  test -s "$shot"
  grep -F "[kk] where " "$log" >/dev/null
}

run_phase baseline
run_phase irrelevant-key "key:q"
run_phase moved "mmove:850 420 8"
run_phase restored

python3 "$WS_ROOT/tools/krieger-total-control/verify-camera-browser-proof.py"   "$WORK/baseline.log" "$WORK/irrelevant-key.log" "$WORK/moved.log" "$WORK/restored.log" "$WORK/camera-proof.json"
