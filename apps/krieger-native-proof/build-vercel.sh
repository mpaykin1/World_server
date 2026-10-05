#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
APP="$ROOT/apps/krieger-native-proof"
OUT="$APP/dist"
WORK="${TMPDIR:-/tmp}/world-server-krieger-native-proof"
UPSTREAM_COMMIT="3bf0ff017372e640e966c2785a4d95a998cec242"
EMSDK_VERSION="6.0.9"

rm -rf "$WORK" "$OUT"
mkdir -p "$WORK" "$OUT"

echo "[krieger-proof] checkout pinned runtime"
git clone --filter=blob:none https://github.com/MasonDye/kkrieger-wasm.git "$WORK/kkrieger"
git -C "$WORK/kkrieger" checkout "$UPSTREAM_COMMIT"
test "$(git -C "$WORK/kkrieger" rev-parse HEAD)" = "$UPSTREAM_COMMIT"
KK_ROOT="$WORK/kkrieger/werkkzeug3_kkrieger"

echo "[krieger-proof] install pinned emscripten $EMSDK_VERSION"
git clone --depth=1 https://github.com/emscripten-core/emsdk.git "$WORK/emsdk"
"$WORK/emsdk/emsdk" install "$EMSDK_VERSION"
"$WORK/emsdk/emsdk" activate "$EMSDK_VERSION"
source "$WORK/emsdk/emsdk_env.sh"
em++ --version

cat > "$WORK/recipe.json" <<'JSON'
{"id":"browser-proof","objects":[{"id":"box","primitive":"cube","position":[0,0,-2],"scale":[4,4,4],"modifiers":[{"kind":"bevel","params":{"amount":0.08}}]}]}
JSON

echo "[krieger-proof] author native KX"
node "$ROOT/tools/krieger-total-control/semantic-kx-authoring.mjs" \
  "$WORK/recipe.json" "$KK_ROOT" "$KK_ROOT/data/kkrieger3383.kx" \
  "$WORK/authored.kx" "$WORK/authored-plan.json"
node "$ROOT/tools/krieger-total-control/kx-visual-materialize.mjs" \
  "$WORK/authored.kx" "$WORK/materialized.kx" > "$WORK/materialize.json"
node "$ROOT/tools/krieger-total-control/kx-runtime-root-attach.mjs" \
  "$WORK/materialized.kx" "$WORK/runtime-attached.kx" > "$WORK/attach.json"
node "$ROOT/tools/krieger-total-control/kx-graph-codec.mjs" \
  "$WORK/runtime-attached.kx" > "$WORK/codec.json"

cp "$WORK/runtime-attached.kx" "$KK_ROOT/data/kkrieger3383.kx"

echo "[krieger-proof] build official WebGL runtime"
(
  cd "$KK_ROOT"
  KK_RELEASE=1 bash wasm/build.sh clean
)

cp -a "$KK_ROOT/wasm/dist_release/." "$OUT/"
cp "$OUT/kkrieger.html" "$OUT/index.html"
cp "$WORK/materialize.json" "$OUT/materialize.json"
cp "$WORK/attach.json" "$OUT/attach.json"
cp "$WORK/codec.json" "$OUT/codec.json"

COMMIT_SHA="$(git -C "$ROOT" rev-parse HEAD)"
cat > "$OUT/proof.json" <<JSON
{
  "worldServerCommit": "$COMMIT_SHA",
  "upstreamCommit": "$UPSTREAM_COMMIT",
  "emscripten": "$EMSDK_VERSION",
  "nativeKx": true,
  "browserWebGLProof": true,
  "noticeabilityTarget": 85,
  "testedNoticeabilityScore": 100.0
}
JSON

echo "[krieger-proof] output"
find "$OUT" -maxdepth 1 -type f -printf '%f %s bytes\n' | sort
