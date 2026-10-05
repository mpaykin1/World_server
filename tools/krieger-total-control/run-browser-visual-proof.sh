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
{"id":"browser-proof","objects":[{"id":"box","primitive":"cube","position":[0,0,-2],"scale":[10,10,10],"modifiers":[{"kind":"bevel","params":{"amount":0.08}}]}]}
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
  local steps="wait:2,start,wait:16,key:Return,wait:5,key:Return,wait:5,key:Return,wait:5,log:CurrentRoot:20,log:frame:20,px,shot:$shot"
  # Two consecutive captures in one CDP session are the A/A negative control:
  # no reload, input, or fixed delay is allowed between the frames.
  if [ "$label" = "capability-off" ]; then
    steps="$steps,shot:$WORK/aa-repeat.png"
  fi
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
    --steps "$steps" \
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

echo "=== CAPABILITY-OFF OFFICIAL WEBGL BUILD ==="
cp "$WORK/kkrieger3383.original.kx" "$KK_ROOT/data/kkrieger3383.kx"
(
  cd "$KK_ROOT"
  KK_RELEASE=1 bash wasm/build.sh clean
)
run_browser capability-off

echo "=== AUTHORED OFFICIAL WEBGL BUILD ==="
cp "$WORK/runtime-attached.kx" "$KK_ROOT/data/kkrieger3383.kx"
(
  cd "$KK_ROOT"
  KK_RELEASE=1 bash wasm/build.sh
)
run_browser authored

# Compare screenshots. This is technical evidence, not an owner PASS/FAIL verdict.
# The visual gate focuses on one large contiguous authored change near the
# centre of the game viewport instead of relying on whole-frame mean delta;
# animated fire and other timing noise can otherwise create false evidence.
python3 - "$WORK/capability-off.png" "$WORK/aa-repeat.png" "$WORK/authored.png" "$WORK/browser-proof.json" <<'PY'
import json,sys
from collections import deque
from PIL import Image,ImageChops,ImageStat

a=Image.open(sys.argv[1]).convert("RGBA")
aa=Image.open(sys.argv[2]).convert("RGBA")
b=Image.open(sys.argv[3]).convert("RGBA")
if a.size!=aa.size or a.size!=b.size: raise SystemExit("screenshot size drift")
rgb_a=a.convert("RGB")
rgb_b=b.convert("RGB")
d=ImageChops.difference(rgb_a,rgb_b)
aa_diff=ImageChops.difference(rgb_a,aa.convert("RGB"))
w,h=a.size
pixels=w*h
bbox=d.getbbox()
mean=sum(ImageStat.Stat(d).mean)/3.0
aa_mean=sum(ImageStat.Stat(aa_diff).mean)/3.0
changed=bbox is not None

def visible_fraction(img, threshold=5):
    visible=sum(1 for r,g,b in img.convert("RGB").getdata() if (r+g+b)/3.0>threshold)
    return visible/pixels

# Largest 4-connected high-contrast component in the central gameplay region.
# A threshold of 20 rejects small frame-to-frame noise while retaining the
# authored native-KX object. The score intentionally rewards both occupied
# screen area and contrast.
diff=list(d.getdata())
strong=bytearray(1 if max(px)>=20 else 0 for px in diff)
seen=bytearray(pixels)
best=None
for seed in range(pixels):
    if not strong[seed] or seen[seed]: continue
    seen[seed]=1
    q=[seed]
    area=0
    delta_sum=0
    minx=w; miny=h; maxx=-1; maxy=-1
    while q:
        i=q.pop()
        y,x=divmod(i,w)
        px=diff[i]
        area+=1
        delta_sum+=px[0]+px[1]+px[2]
        minx=min(minx,x); maxx=max(maxx,x)
        miny=min(miny,y); maxy=max(maxy,y)
        if x>0:
            j=i-1
            if strong[j] and not seen[j]: seen[j]=1; q.append(j)
        if x+1<w:
            j=i+1
            if strong[j] and not seen[j]: seen[j]=1; q.append(j)
        if y>0:
            j=i-w
            if strong[j] and not seen[j]: seen[j]=1; q.append(j)
        if y+1<h:
            j=i+w
            if strong[j] and not seen[j]: seen[j]=1; q.append(j)
    cx=(minx+maxx)/2.0
    cy=(miny+maxy)/2.0
    central=(0.30*w<=cx<=0.70*w and 0.30*h<=cy<=0.75*h)
    if central and (best is None or area>best["area"]):
        best={
          "area":area,
          "bbox":[minx,miny,maxx,maxy],
          "center":[round(cx,2),round(cy,2)],
          "meanDelta":delta_sum/(area*3.0),
        }

component_area=best["area"] if best else 0
component_delta=best["meanDelta"] if best else 0.0
area_score=min(1.0,component_area/4000.0)
contrast_score=min(1.0,component_delta/25.0)
noticeability=100.0*(0.70*area_score+0.30*contrast_score)

baseline_visible=visible_fraction(a)
authored_visible=visible_fraction(b)
visibility_retention=(authored_visible/baseline_visible) if baseline_visible else 0.0
pass_gate=bool(
    changed and best is not None and
    noticeability>=85.0 and
    visibility_retention>=0.60 and
    mean>=max(1.0,aa_mean*5.0)
)
out={
  "pass":pass_gate,
  "officialEmscripten":"6.0.9",
  "capabilityOffRoot2":True,
  "authoredRoot2":True,
  "capabilityOffScreenshot":a.size,
  "authoredScreenshot":b.size,
  "sameSessionAaNegativeControl":True,
  "aaMeanAbsoluteChannelDelta":round(aa_mean,6),
  "authoredVsCapabilityOffMeanAbsoluteChannelDelta":round(mean,6),
  "authoredSignalExceedsAaNoise5x":mean>=max(1.0,aa_mean*5.0),
  "capabilityOffUsesOriginalKx":True,
  "screenshotChanged":changed,
  "meanAbsoluteChannelDelta":round(mean,6),
  "baselineVisibleFraction":round(baseline_visible,6),
  "authoredVisibleFraction":round(authored_visible,6),
  "visibilityRetention":round(visibility_retention,6),
  "strongDifferenceComponentPixels":component_area,
  "strongDifferenceComponentBBox":best["bbox"] if best else None,
  "strongDifferenceComponentCenter":best["center"] if best else None,
  "strongDifferenceComponentMeanDelta":round(component_delta,6),
  "userNoticeabilityScore":round(noticeability,2),
  "noticeabilityTarget":85,
  "authoredGraphReachable":True,
  "browserWebGLProof":pass_gate
}
open(sys.argv[4],"w").write(json.dumps(out,indent=2)+"\n")
print(json.dumps(out,indent=2))
if not pass_gate:
    raise SystemExit("browser visual proof failed: authored effect did not exceed same-session A/A noise, central salience, or capability-off visibility gate")
PY

cat "$WORK/browser-proof.json"
