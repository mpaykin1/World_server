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

# Pinned upstream headless GL stub predates a later glBlitFramebuffer call.
# Patch only the no-op headless compatibility surface; browser/WebGL builds are untouched.
if ! grep -q "glBlitFramebuffer" "$KK_ROOT/wasm/gl_stub.cpp"; then
  cat >> "$KK_ROOT/wasm/gl_stub.cpp" <<'CPP'
extern "C" void glBlitFramebuffer(
  GLint, GLint, GLint, GLint,
  GLint, GLint, GLint, GLint,
  GLbitfield, GLenum) {}
CPP
fi

# Emscripten 6 resolves GLES entry points that are absent from the pinned
# no-op stub to JS WebGL imports. In a Node headless run there is deliberately
# no GLctx, so those imports crash before game logic can be compared. Keep the
# compatibility shim local to the CI checkout and add only functions missing
# from the pinned headless stub.
if ! grep -q "void glPixelStorei" "$KK_ROOT/wasm/gl_stub.cpp"; then
  cat >> "$KK_ROOT/wasm/gl_stub.cpp" <<'CPP'
extern "C" void glPixelStorei(GLenum, GLint) {}
CPP
fi

# Browser-only debug EM_JS helpers in the pinned port are also called by the
# Node/headless build. Make only those diagnostics fail-closed when window is absent.
python3 - "$KK_ROOT/wasm/_start_wasm.cpp" <<'PY'
import sys
p=sys.argv[1]
s=open(p,encoding="utf-8").read()
repls={
"return (window.__kkDumpOps && window.__kkDumpOps.indexOf(id) >= 0) ? 1 : 0;":
"return (typeof window !== 'undefined' && window.__kkDumpOps && window.__kkDumpOps.indexOf(id) >= 0) ? 1 : 0;",
"return (window.__kkDumpSetups && window.__kkDumpSetups.indexOf(id) >= 0) ? 1 : 0;":
"return (typeof window !== 'undefined' && window.__kkDumpSetups && window.__kkDumpSetups.indexOf(id) >= 0) ? 1 : 0;",
"EM_JS(int, kkJsFlag, (const char *name), { return window[UTF8ToString(name)] ? 1 : 0; });":
"EM_JS(int, kkJsFlag, (const char *name), { if (typeof window === 'undefined') return 0; return window[UTF8ToString(name)] ? 1 : 0; });",
"EM_JS(int, kkJsInt, (const char *name), { var v = window[UTF8ToString(name)]; return (typeof v === 'number') ? v : -1; });":
"EM_JS(int, kkJsInt, (const char *name), { if (typeof window === 'undefined') return -1; var v = window[UTF8ToString(name)]; return (typeof v === 'number') ? v : -1; });",
"  var k = UTF8ToString(name), v = window[k];\n  if (!Array.isArray(v)) return 0;":
"  if (typeof window === 'undefined') return 0;\n  var k = UTF8ToString(name), v = window[k];\n  if (!Array.isArray(v)) return 0;",
"EM_JS(int, kkTracePickupWanted, (), { return window.__kkTracePickup ? 1 : 0; });":
"EM_JS(int, kkTracePickupWanted, (), { return (typeof window !== 'undefined' && window.__kkTracePickup) ? 1 : 0; });",
"EM_JS(int, kkTakeFlag, (const char *name), { var k = UTF8ToString(name); var v = window[k] ? 1 : 0; window[k] = 0; return v; });":
"EM_JS(int, kkTakeFlag, (const char *name), { if (typeof window === 'undefined') return 0; var k = UTF8ToString(name); var v = window[k] ? 1 : 0; window[k] = 0; return v; });",
"  if (!window.__kkDumpSamples) return;":
"  if (typeof window === 'undefined' || !window.__kkDumpSamples) return;",
}
for old,new in repls.items():
    if old not in s:
        raise SystemExit("headless debug-hook source drift: "+old[:80])
    s=s.replace(old,new)
open(p,"w",encoding="utf-8").write(s)
PY

run_headless() {
  local log="$1"
  set +e
  (
    cd "$KK_ROOT/wasm/dist_headless"
    timeout 240 node ./kk_headless.js
  ) >"$log" 2>&1
  local rc=$?
  set -e
  cat "$log"
  if [ "$rc" -ne 0 ]; then
    echo "headless runtime exited with $rc" >&2
    return "$rc"
  fi
  grep -F "[kk] generation finished" "$log" >/dev/null
  grep -E "\\[kk\\] headless: done after [0-9]+ frames, root 2, [1-9][0-9]* level frames" "$log" >/dev/null
}

echo "=== BASELINE: original pinned kkrieger3383.kx ==="
(
  cd "$KK_ROOT"
  bash wasm/build_headless.sh clean
)
run_headless "$WORK/baseline-headless.log"

echo "=== AUTHORED: native graph attached to root 2 ==="
cp "$WORK/runtime-attached.kx" "$KK_ROOT/data/kkrieger3383.kx"
(
  cd "$KK_ROOT"
  # Objects are unchanged; the incremental build relinks the preloaded KX package.
  bash wasm/build_headless.sh
)
run_headless "$WORK/headless.log"

# The pinned port has a known legacy varargs ASan finding in both baseline and
# authored runs. Treat it as upstream baseline debt, not as authored evidence.
# Any new sanitizer signature or additional sanitizer event is a regression.
python3 - "$WORK/baseline-headless.log" "$WORK/headless.log" <<'PY'
import re,sys
def profile(path):
    text=open(path,encoding="utf-8",errors="replace").read()
    summaries=re.findall(r"SUMMARY: AddressSanitizer:\s*(.+)",text)
    return summaries
base=profile(sys.argv[1])
auth=profile(sys.argv[2])
print("baseline ASan:",base)
print("authored ASan:",auth)
if auth != base:
    raise SystemExit("authored sanitizer profile differs from pinned baseline")
PY

for marker in "runtime error:" "[kk] FATAL:" "Aborted(" "abort("; do
  base_count=$(grep -F -c "$marker" "$WORK/baseline-headless.log" || true)
  auth_count=$(grep -F -c "$marker" "$WORK/headless.log" || true)
  if [ "$auth_count" -gt "$base_count" ]; then
    echo "authored runtime added fatal marker: $marker ($auth_count > $base_count)" >&2
    exit 1
  fi
done

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
  "sanitizerProfileMatchesBaseline": true,
  "generationFinished": true,
  "baselineReachedGameRoot2": true,
  "authoredReachedGameRoot2": true,
  "authoredGraphReachable": true
}
JSON
cat "$WORK/runtime-proof.json"
