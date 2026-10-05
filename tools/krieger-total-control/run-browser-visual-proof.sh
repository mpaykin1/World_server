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
test -n "$CHROME_BIN"
test -x "$CHROME_BIN"
echo "browser=$CHROME_BIN"

# Make the upstream CDP helper use the browser installed on the runner.
python3 - "$KK_ROOT/wasm/cdp.js" <<'PY'
import sys
p=sys.argv[1]
s=open(p,encoding="utf-8").read()
old="const chrome = spawn('/usr/bin/chromium', ["
new="const chrome = spawn(process.env.CHROME_BIN || '/usr/bin/chromium', ["
if old not in s: raise SystemExit("upstream cdp launcher drift")
open(p,"w",encoding="utf-8").write(s.replace(old,new))
PY

cp "$KK_ROOT/data/kkrieger3383.kx" "$WORK/kkrieger3383.original.kx"

cat > "$WORK/recipe.json" <<'JSON'
{"id":"browser-proof","objects":[{"id":"box","primitive":"cube","position":[0,0,-2],"scale":[2,2,2],"modifiers":[{"kind":"bevel","params":{"amount":0.08}}]}]}
JSON

node "$WS_ROOT/tools/krieger-total-control/semantic-kx-authoring.mjs" \
  "$WORK/recipe.json" "$KK_ROOT" "$KK_ROOT/data/kkrieger3383.kx" \
  "$WORK/authored.kx" "$WORK/authored-plan.json"
node "$WS_ROOT/tools/krieger-total-control/kx-visual-materialize.mjs" \
  "$WORK/authored.kx" "$WORK/materialized.kx" > "$WORK/materialize.json"
node "$WS_ROOT/tools/krieger-total-control/kx-runtime-root-attach.mjs" \
  "$WORK/materialized.kx" "$WORK/runtime-attached.kx" > "$WORK/attach.json"
node "$WS_ROOT/tools/krieger-total-control/kx-graph-codec.mjs" \
  "$WORK/runtime-attached.kx" > "$WORK/codec.json"

run_browser() {
  local label="$1"
  local shot="$WORK/${label}.png"
  local log="$WORK/${label}.log"
  local dist="$KK_ROOT/wasm/dist_release"
  python3 -m http.server 8766 --bind 127.0.0.1 --directory "$dist" >"$WORK/${label}-server.log" 2>&1 &
  local server_pid=$!
  trap "kill $server_pid 2>/dev/null || true" RETURN
  for _ in $(seq 1 50); do
    if curl -fsS "http://127.0.0.1:8766/kkrieger.html?data=3383" >/dev/null; then break; fi
    sleep .2
  done
  CHROME_BIN="$CHROME_BIN" node "$KK_ROOT/wasm/cdp.js" \
    --url "http://127.0.0.1:8766/kkrieger.html?data=3383&res=1024x768" \
    --window 1024,768 \
    --steps "wait:2,start,wait:16,key:Return,wait:5,key:Return,wait:5,key:Return,wait:5,log:CurrentRoot:20,log:frame:20,px,shot:$shot" \
    >"$log" 2>&1
  cat "$log"
  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
  trap - RETURN
  test -s "$shot"
  grep -F "CurrentRoot=2" "$log" >/dev/null
  grep -F "[cdp] pixels:" "$log" >/dev/null
  python3 - "$log" <<'PY'
import re,sys
text=open(sys.argv[1],encoding="utf-8",errors="replace").read()
m=re.search(r"\[cdp\] page exceptions:\n(.*?)(?=\n\[cdp\]|\Z)",text,re.S)
if m:
    chunks=[x.strip() for x in m.group(1).split("\n---\n") if x.strip()]
    bad=[x for x in chunks if not x.startswith("WrongDocumentError: The root document of this element is not valid for pointer lock.")]
    if bad:
        raise SystemExit("unexpected browser exception(s): "+repr(bad))
PY
}

echo "=== BASELINE OFFICIAL WEBGL BUILD ==="
cp "$WORK/kkrieger3383.original.kx" "$KK_ROOT/data/kkrieger3383.kx"
(
  cd "$KK_ROOT"
  KK_RELEASE=1 bash wasm/build.sh clean
)
run_browser baseline

echo "=== AUTHORED OFFICIAL WEBGL BUILD ==="
cp "$WORK/runtime-attached.kx" "$KK_ROOT/data/kkrieger3383.kx"
(
  cd "$KK_ROOT"
  KK_RELEASE=1 bash wasm/build.sh
)
run_browser authored

# Compare screenshots. This is evidence, not an owner-visible-success verdict.
python3 - "$WORK/baseline.png" "$WORK/authored.png" "$WORK/browser-proof.json" <<'PY'
import json,sys
from PIL import Image,ImageChops,ImageStat
a=Image.open(sys.argv[1]).convert("RGBA")
b=Image.open(sys.argv[2]).convert("RGBA")
if a.size!=b.size: raise SystemExit("screenshot size drift")
# PIL RGBA getbbox can be alpha-sensitive; compare RGB explicitly.
d=ImageChops.difference(a.convert("RGB"),b.convert("RGB"))
pixels=a.size[0]*a.size[1]
bbox=d.getbbox()
mean=sum(ImageStat.Stat(d).mean)/3.0
changed=bbox is not None

def visible_fraction(img, threshold=5):
    rgb=img.convert("RGB")
    visible=sum(1 for r,g,b in rgb.getdata() if (r+g+b)/3.0>threshold)
    return visible/pixels

baseline_visible=visible_fraction(a)
authored_visible=visible_fraction(b)
visibility_retention=(authored_visible/baseline_visible) if baseline_visible else 0.0
pass_gate=bool(changed and mean>=0.5 and visibility_retention>=0.60)
out={
  "pass":pass_gate,
  "officialEmscripten":"6.0.9",
  "baselineRoot2":True,
  "authoredRoot2":True,
  "baselineScreenshot":a.size,
  "authoredScreenshot":b.size,
  "screenshotChanged":changed,
  "meanAbsoluteChannelDelta":round(mean,6),
  "baselineVisibleFraction":round(baseline_visible,6),
  "authoredVisibleFraction":round(authored_visible,6),
  "visibilityRetention":round(visibility_retention,6),
  "authoredGraphReachable":True,
  "browserWebGLProof":pass_gate
}
open(sys.argv[3],"w").write(json.dumps(out,indent=2)+"\n")
print(json.dumps(out,indent=2))
if not pass_gate:
    raise SystemExit("browser visual proof failed: RGB delta or baseline visibility retention below gate")
PY

cat "$WORK/browser-proof.json"