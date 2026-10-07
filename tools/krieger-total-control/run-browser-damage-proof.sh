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
CHROME_BIN="${CHROME_BIN:-$(command -v chromium || command -v google-chrome || command -v google-chrome-stable || true)}"
test -x "$CHROME_BIN"

# Pin the exact native call-flow and fail closed on upstream drift.
python3 - "$KK_ROOT/kkriegergame.cpp" <<'PY'
import sys
s=open(sys.argv[1],"rb").read()
anchors=[
  b"void KKriegerPlayer::Hit(sInt hits)\n{\n  if(hits>Armor)\n    Life -= (hits-Armor)+(Armor/4);\n  else\n    Life -= hits/4;\n  if(Life<0)\n    Life = 0;\n  if(hits>4)\n    Sound(10);\n}",
  b"case 'k':\n  case 'K':\n    Player.Hit(10);\n    break;",
]
missing=[anchor for anchor in anchors if s.count(anchor)!=1]
if missing: raise SystemExit("pinned player-damage source drift: "+repr(missing))
PY

# Use the runner browser without changing the upstream runtime contract.
python3 - "$KK_ROOT/wasm/cdp.js" <<'PY'
import sys
p=sys.argv[1]
s=open(p,encoding="utf-8").read()
old="const chrome = spawn('/usr/bin/chromium', ["
new="const chrome = spawn(process.env.CHROME_BIN || '/usr/bin/chromium', ["
if old not in s: raise SystemExit("upstream cdp launcher drift")
open(p,"w",encoding="utf-8").write(s.replace(old,new))
PY

# The pinned WASM platform reserves SDLK_k for its renderer debug overlay and
# breaks before the event reaches KeyBuffer. Remove only that proof-host
# interception so the game's existing case 'k' can exercise OnKey -> Hit.
python3 - "$KK_ROOT/wasm/_start_wasm.cpp" <<'PY'
import sys
p=sys.argv[1]
s=open(p,"rb").read()
old=(b"        if(e.key.keysym.sym == SDLK_k && e.type == SDL_KEYDOWN)"
     b"                                // debug: alpha test off\n"
     b"        { kkAlphaTestOff = !kkAlphaTestOff; fprintf(stderr,\"[kk] alpha test off: %d\\n\",kkAlphaTestOff); break; }\n")
if s.count(old)!=1: raise SystemExit("pinned SDLK_k platform interception drift")
open(p,"wb").write(s.replace(old,b""))
PY

(
  cd "$KK_ROOT"
  KK_RELEASE=1 bash wasm/build.sh clean
)

run_phase() {
  local label="$1"
  local action="${2:-}"
  local shot="$WORK/${label}.png"
  local log="$WORK/${label}.log"
  local steps="wait:2,start,wait:16,key:Return,wait:5,key:Return,wait:5,key:Return,wait:5"
  if [ -n "$action" ]; then steps="$steps,focus,$action,wait:2,log:key down:24"; fi
  # F10 enables the pinned runtime's one-frame kkExecTrace, whose camera trace
  # contains the authoritative Player.Life value read by the verifier.
  steps="$steps,key:F10,wait:1,log:player:240,shot:$shot"
  python3 -m http.server 8767 --bind 127.0.0.1 --directory "$KK_ROOT/wasm/dist_release" >"$WORK/${label}-server.log" 2>&1 &
  local server_pid=$!
  trap "kill $server_pid 2>/dev/null || true" RETURN
  for _ in $(seq 1 50); do
    if curl -fsS "http://127.0.0.1:8767/kkrieger.html?data=3383" >/dev/null; then break; fi
    sleep .2
  done
  if ! CHROME_BIN="$CHROME_BIN" node "$KK_ROOT/wasm/cdp.js" \
    --url "http://127.0.0.1:8767/kkrieger.html?data=3383&res=1024x768" \
    --window 1024,768 --steps "$steps" >"$log" 2>&1; then
    # A hosted runner can transiently fail before exposing the DevTools
    # endpoint. Retry that startup sentinel once with a fresh CDP profile;
    # every other failure, and a second startup failure, remains fail-closed.
    grep -F "chromium did not start" "$log" >/dev/null || return 1
    sleep 2
    CHROME_BIN="$CHROME_BIN" node "$KK_ROOT/wasm/cdp.js" \
      --url "http://127.0.0.1:8767/kkrieger.html?data=3383&res=1024x768" \
      --window 1024,768 --steps "$steps" >>"$log" 2>&1
  fi
  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
  trap - RETURN
  test -s "$shot"
  grep -F "[kk] player " "$log" >/dev/null
}

run_phase baseline
run_phase irrelevant-key "key:q"
run_phase damaged "key:k"
run_phase restored

python3 "$WS_ROOT/tools/krieger-total-control/verify-damage-browser-proof.py" \
  "$WORK/baseline.log" "$WORK/irrelevant-key.log" "$WORK/damaged.log" "$WORK/restored.log" \
  "$WORK/damage-proof.json"
