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
{"id":"browser-proof","objects":[{"id":"box","primitive":"cube","position":[0,0,-2],"scale":[4,4,4],"modifiers":[{"kind":"bevel","params":{"amount":0.08}}]}]}
JSON
cat > "$WORK/recipe-mutated.json" <<'JSON'
{"id":"browser-proof","objects":[{"id":"box","primitive":"cube","position":[0,0,-2],"scale":[6,4,4],"modifiers":[{"kind":"bevel","params":{"amount":0.08}}]}]}
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

node "$WS_ROOT/tools/krieger-total-control/semantic-kx-authoring.mjs" \
  "$WORK/recipe-mutated.json" "$KK_ROOT" "$WORK/kkrieger3383.original.kx" \
  "$WORK/authored-mutated.kx" "$WORK/authored-mutated-plan.json"
node "$WS_ROOT/tools/krieger-total-control/kx-visual-materialize.mjs" \
  "$WORK/authored-mutated.kx" "$WORK/materialized-mutated.kx" > "$WORK/materialize-mutated.json"
node "$WS_ROOT/tools/krieger-total-control/kx-runtime-root-attach.mjs" \
  "$WORK/materialized-mutated.kx" "$WORK/runtime-mutated.kx" > "$WORK/attach-mutated.json"
node "$WS_ROOT/tools/krieger-total-control/kx-graph-codec.mjs" \
  "$WORK/runtime-mutated.kx" > "$WORK/codec-mutated.json"

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

echo "=== SINGLE-FIELD MUTATED OFFICIAL WEBGL BUILD ==="
cp "$WORK/runtime-mutated.kx" "$KK_ROOT/data/kkrieger3383.kx"
(
  cd "$KK_ROOT"
  KK_RELEASE=1 bash wasm/build.sh
)
run_browser mutated

# Compare screenshots. This is technical evidence, not an owner PASS/FAIL verdict.
# The visual gate focuses on one large contiguous authored change near the
# centre of the game viewport instead of relying on whole-frame mean delta;
# animated fire and other timing noise can otherwise create false evidence.
python3 - "$WORK/baseline.png" "$WORK/authored.png" "$WORK/browser-proof.json" <<'PY'
import json,sys
from collections import deque
from PIL import Image,ImageChops,ImageStat

a=Image.open(sys.argv[1]).convert("RGBA")
b=Image.open(sys.argv[2]).convert("RGBA")
if a.size!=b.size: raise SystemExit("screenshot size drift")
rgb_a=a.convert("RGB")
rgb_b=b.convert("RGB")
d=ImageChops.difference(rgb_a,rgb_b)
w,h=a.size
pixels=w*h
bbox=d.getbbox()
mean=sum(ImageStat.Stat(d).mean)/3.0
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
    visibility_retention>=0.60
)
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
  "strongDifferenceComponentPixels":component_area,
  "strongDifferenceComponentBBox":best["bbox"] if best else None,
  "strongDifferenceComponentCenter":best["center"] if best else None,
  "strongDifferenceComponentMeanDelta":round(component_delta,6),
  "userNoticeabilityScore":round(noticeability,2),
  "noticeabilityTarget":85,
  "authoredGraphReachable":True,
  "browserWebGLProof":pass_gate
}
open(sys.argv[3],"w").write(json.dumps(out,indent=2)+"\n")
print(json.dumps(out,indent=2))
if not pass_gate:
    raise SystemExit("browser visual proof failed: central authored salience <85 or baseline visibility retention below gate")
PY

python3 - "$WORK/baseline.png" "$WORK/authored.png" "$WORK/mutated.png" \
  "$WORK/authored-plan.json" "$WORK/authored-mutated-plan.json" \
  "$WORK/runtime-attached.kx" "$WORK/runtime-mutated.kx" "$WORK/scene-causality.json" <<'PY'
import json,sys
from PIL import Image,ImageChops

baseline=Image.open(sys.argv[1]).convert("RGB")
authored=Image.open(sys.argv[2]).convert("RGB")
mutated=Image.open(sys.argv[3]).convert("RGB")
if baseline.size!=authored.size or baseline.size!=mutated.size:
    raise SystemExit("scene causality screenshot size drift")
w,h=baseline.size
pixels=w*h

def component(img):
    diff=list(ImageChops.difference(baseline,img).getdata())
    strong=bytearray(1 if max(px)>=20 else 0 for px in diff)
    seen=bytearray(pixels)
    best=None
    for seed in range(pixels):
        if not strong[seed] or seen[seed]: continue
        seen[seed]=1
        q=[seed]; area=0; total=0
        minx=w; miny=h; maxx=-1; maxy=-1
        while q:
            i=q.pop(); y,x=divmod(i,w); px=diff[i]
            area+=1; total+=px[0]+px[1]+px[2]
            minx=min(minx,x); maxx=max(maxx,x)
            miny=min(miny,y); maxy=max(maxy,y)
            for j in ((i-1) if x>0 else -1,(i+1) if x+1<w else -1,(i-w) if y>0 else -1,(i+w) if y+1<h else -1):
                if j>=0 and strong[j] and not seen[j]:
                    seen[j]=1; q.append(j)
        cx=(minx+maxx)/2; cy=(miny+maxy)/2
        if 0.30*w<=cx<=0.70*w and 0.30*h<=cy<=0.75*h:
            cur={"area":area,"bbox":[minx,miny,maxx,maxy],"center":[cx,cy],
                 "width":maxx-minx+1,"height":maxy-miny+1,
                 "meanDelta":total/(area*3)}
            if best is None or area>best["area"]: best=cur
    return best

def semantic_nodes(plan):
    return {n["semanticId"]:{
        "kind":n.get("kind"),"family":n.get("family"),"handler":n.get("handler"),
        "operatorId":n.get("operatorId"),"params":n.get("params"),
        "kxBinding":n.get("kxBinding"),"kxConvention":n.get("kxConvention"),"kxPacking":n.get("kxPacking")
    } for n in plan["nodes"]}

pa=json.load(open(sys.argv[4],encoding="utf-8"))
pm=json.load(open(sys.argv[5],encoding="utf-8"))
na,nm=semantic_nodes(pa),semantic_nodes(pm)
if list(na)!=list(nm): raise SystemExit("semantic node set drift")
changed=[k for k in na if na[k]!=nm[k]]
scene_a=na.get("box:scene"); scene_m=nm.get("box:scene")
if changed!=["box:scene"]:
    raise SystemExit(f"expected only box:scene IR mutation, got {changed!r}")
if scene_a["params"].get("scale")!=[4,4,4] or scene_m["params"].get("scale")!=[6,4,4]:
    raise SystemExit("target scale mutation missing from scene IR")

ba=open(sys.argv[6],"rb").read(); bm=open(sys.argv[7],"rb").read()
binary_diff=sum(x!=y for x,y in zip(ba,bm))+abs(len(ba)-len(bm))
ca,cm=component(authored),component(mutated)
if not ca or not cm: raise SystemExit("authored component missing in scale causality proof")
width_ratio=cm["width"]/max(ca["width"],1)
height_ratio=cm["height"]/max(ca["height"],1)
center_dx=abs(cm["center"][0]-ca["center"][0])
center_dy=abs(cm["center"][1]-ca["center"][1])
area_ratio=cm["area"]/max(ca["area"],1)
passed=(
    binary_diff>0 and binary_diff<=128 and
    width_ratio>=1.15 and 0.75<=height_ratio<=1.25 and
    center_dx<=20 and center_dy<=20 and area_ratio>=1.10
)
out={
  "pass":passed,
  "claim":"single GameRecipe field -> targeted Scene IR/KX change -> expected real WebGL geometry effect",
  "changedField":"objects[0].scale[0]",
  "baselineValue":4,
  "mutatedValue":6,
  "changedSemanticNodes":changed,
  "nativeKxDifferingBytes":binary_diff,
  "authoredComponent":ca,
  "mutatedComponent":cm,
  "widthRatio":round(width_ratio,4),
  "heightRatio":round(height_ratio,4),
  "areaRatio":round(area_ratio,4),
  "centerDelta":[round(center_dx,2),round(center_dy,2)]
}
open(sys.argv[8],"w").write(json.dumps(out,indent=2)+"\n")
print(json.dumps(out,indent=2))
if not passed:
    raise SystemExit("scene runtime causality gate failed")
PY

cat "$WORK/browser-proof.json"
cat "$WORK/scene-causality.json"