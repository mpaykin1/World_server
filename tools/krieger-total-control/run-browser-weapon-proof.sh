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

# Fail closed if the exact pinned native weapon path drifts.
python3 - "$KK_ROOT/kkriegergame.cpp" <<'PY'
import sys
p=sys.argv[1]
s=open(p,"rb").read()
anchors=[
  b"case sKEY_CTRLR:\n  case sKEY_MOUSEL:\n    Player.FireKey = 1;\n    return sTRUE;",
  b"if(!infinite)\n        Player.Ammo[Player.CurrentWeapon/2]--;",
  b"FireShot(kenv,Player.CurrentWeapon,0,0);",
  b"static sS8 weaponswap[8] = {-1,0,1,2,4,6,-1,-1};",
]
missing=[a for a in anchors if s.count(a)!=1]
if missing: raise SystemExit("pinned weapon source drift: "+repr(missing))

# Proof-only telemetry. It observes existing state; it does not alter weapon logic.
old=b"void KKriegerGame::FireShot(KEnvironment *kenv,sInt weapon,KKriegerMonster *monster,const sVector *monsterfiredir)\n{"
new=(b"#if defined(__EMSCRIPTEN__)\nstatic sInt kkWeaponProofShots = 0;\n#endif\n\n"
     b"void KKriegerGame::FireShot(KEnvironment *kenv,sInt weapon,KKriegerMonster *monster,const sVector *monsterfiredir)\n{")
if s.count(old)!=1: raise SystemExit("FireShot telemetry anchor drift")
s=s.replace(old,new)

old=b"  info = &ShotInfoTable[weapon];\n  if(info->Mode==0) return;"
new=(b"  info = &ShotInfoTable[weapon];\n  if(info->Mode==0) return;\n"
     b"#if defined(__EMSCRIPTEN__)\n"
     b"  kkWeaponProofShots++;\n"
     b"  fprintf(stderr,\"[kk-weapon] shot=%d weapon=%d ammo=%d\\n\",kkWeaponProofShots,weapon,Player.Ammo[weapon/2]);\n"
     b"#endif")
if s.count(old)!=1: raise SystemExit("FireShot body telemetry anchor drift")
s=s.replace(old,new)

old=(b"      fprintf(stderr,\"[kk] player pos=(%.2f %.2f %.2f) cam=(%.2f %.2f %.2f) ground=%d cell=%p life=%d\\n\",\n"
     b"              PlayerPos.x,PlayerPos.y,PlayerPos.z,CamPos.x,CamPos.y,CamPos.z,\n"
     b"              (sInt)OnGround,(void *)PlayerCell,Player.Life); }")
new=old.replace(
     b"Player.Life); }",
     b"Player.Life);\n"
     b"      fprintf(stderr,\"[kk-weapon] state current=%d next=%d ammo0=%d fire=%d shots=%d\\n\","
     b"Player.CurrentWeapon,Player.NextWeapon,Player.Ammo[0],Player.FireKey,kkWeaponProofShots); }"
)
if s.count(old)!=1: raise SystemExit("player-state telemetry anchor drift")
s=s.replace(old,new)
open(p,"wb").write(s)
PY

# Use the runner browser without changing gameplay.
python3 - "$KK_ROOT/wasm/cdp.js" <<'PY'
import sys
p=sys.argv[1]
s=open(p,encoding="utf-8").read()
old="const chrome = spawn('/usr/bin/chromium', ["
new="const chrome = spawn(process.env.CHROME_BIN || '/usr/bin/chromium', ["
if old not in s: raise SystemExit("upstream cdp launcher drift")
open(p,"w",encoding="utf-8").write(s.replace(old,new))
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
  # Each phase starts from a fresh WASM instance. Select weapon 1 explicitly
  # with key 2, then let the native weapon animation settle before probing.
  local steps="wait:2,start,wait:16,key:Return,wait:5,key:Return,wait:5,key:Return,wait:5,focus,key:2,wait:3"
  if [ -n "$action" ]; then steps="$steps,$action,wait:2"; fi
  steps="$steps,key:F10,wait:1,log:kk-weapon:120,shot:$shot"
  python3 -m http.server 8768 --bind 127.0.0.1 --directory "$KK_ROOT/wasm/dist_release" >"$WORK/${label}-server.log" 2>&1 &
  local server_pid=$!
  trap "kill $server_pid 2>/dev/null || true" RETURN
  for _ in $(seq 1 50); do
    if curl -fsS "http://127.0.0.1:8768/kkrieger.html?data=3383" >/dev/null; then break; fi
    sleep .2
  done
  if ! CHROME_BIN="$CHROME_BIN" node "$KK_ROOT/wasm/cdp.js" \
    --url "http://127.0.0.1:8768/kkrieger.html?data=3383&res=1024x768" \
    --window 1024,768 --steps "$steps" >"$log" 2>&1; then
    grep -F "chromium did not start" "$log" >/dev/null || return 1
    sleep 2
    CHROME_BIN="$CHROME_BIN" node "$KK_ROOT/wasm/cdp.js" \
      --url "http://127.0.0.1:8768/kkrieger.html?data=3383&res=1024x768" \
      --window 1024,768 --steps "$steps" >>"$log" 2>&1
  fi
  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
  trap - RETURN
  test -s "$shot"
  grep -F "[kk-weapon] state " "$log" >/dev/null
}

run_phase baseline
run_phase irrelevant-key "key:q"
# Keep the mouse down across a frame so SDL cannot consume press+release
# before the game tick observes Player.FireKey.
run_phase fired "mdown:512 384,wait:0.2,mup:512 384"
run_phase restored

python3 "$WS_ROOT/tools/krieger-total-control/verify-weapon-browser-proof.py" \
  "$WORK/baseline.log" "$WORK/irrelevant-key.log" "$WORK/fired.log" "$WORK/restored.log" \
  "$WORK/weapon-proof.json"
