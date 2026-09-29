#!/usr/bin/env bash
set -euo pipefail

UPSTREAM_ROOT="${1:-}"
if [[ -z "$UPSTREAM_ROOT" || ! -d "$UPSTREAM_ROOT/werkkzeug3_kkrieger/wasm" ]]; then
  echo "usage: $0 <kkrieger-wasm checkout>"
  exit 2
fi

EXPECTED_SHA="${KKRIEGER_UPSTREAM_SHA:-3bf0ff017372e640e966c2785a4d95a998cec242}"
ACTUAL_SHA="$(git -C "$UPSTREAM_ROOT" rev-parse HEAD)"
if [[ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]]; then
  echo "unexpected upstream SHA: $ACTUAL_SHA (expected $EXPECTED_SHA)"
  exit 3
fi

ROOT="$UPSTREAM_ROOT/werkkzeug3_kkrieger"
WORK_ROOT="${KK_SINGLEFILE_WORK:-$PWD/work/kkrieger-singlefile}"
DIST="$WORK_ROOT/dist"
PATCHED="$ROOT/wasm/build.singlefile.generated.sh"

rm -rf "$WORK_ROOT"
mkdir -p "$WORK_ROOT"

cp "$ROOT/wasm/build.sh" "$PATCHED"

python3 - "$PATCHED" <<'PY'
from pathlib import Path
import sys

p = Path(sys.argv[1])
s = p.read_text(encoding="utf-8")

needle_a = '  -sENVIRONMENT=web\n'
if needle_a not in s:
    raise SystemExit("cannot find Emscripten web environment flag")
s = s.replace(needle_a, needle_a + '  -sSINGLE_FILE=1\n', 1)

for old, new in (
    ('--preload-file "$ROOT/data/kkrieger3383.kx@/kkrieger.kx"',
     '--embed-file "$ROOT/data/kkrieger3383.kx@/kkrieger.kx"'),
    ('--preload-file "$ROOT/data/kkrieger_beta_conv.kx@/kkrieger_beta.kx"',
     '--embed-file "$ROOT/data/kkrieger_beta_conv.kx@/kkrieger_beta.kx"'),
):
    if old not in s:
        raise SystemExit(f"cannot find expected preload flag: {old}")
    s = s.replace(old, new, 1)

p.write_text(s, encoding="utf-8")
PY

chmod +x "$PATCHED"

KK_RELEASE=1 \
KK_OBJDIR="$WORK_ROOT/obj" \
KK_OUTDIR="$DIST" \
bash "$PATCHED" clean

HTML="$DIST/kkrieger.html"
test -s "$HTML"

# SINGLE_FILE + embed-file must leave no runtime sidecars.
mapfile -t sidecars < <(find "$DIST" -maxdepth 1 -type f ! -name 'kkrieger.html' -printf '%f\n')
if (( ${#sidecars[@]} != 0 )); then
  printf 'unexpected sidecars: %s\n' "${sidecars[*]}"
  exit 4
fi

# Carry the upstream BSD and MojoShader zlib notices inside the one distributed file.
python3 - "$HTML" "$ROOT/LICENSE.txt" "$ROOT/wasm/mojoshader/LICENSE.txt" "$EXPECTED_SHA" <<'PY'
from pathlib import Path
import html
import sys

html_path, bsd_path, mojo_path, sha = map(Path, sys.argv[1:4]) + [sys.argv[4]] if False else (Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4])
doc = html_path.read_text(encoding="utf-8")
bsd = bsd_path.read_text(encoding="utf-8")
mojo = mojo_path.read_text(encoding="utf-8")

notice = f"""
<template id="third-party-license-notices">
Kkrieger browser build provenance:
https://github.com/MasonDye/kkrieger-wasm
Pinned source commit: {sha}

farbrausch / .theprodukkt license:
{html.escape(bsd)}

MojoShader license:
{html.escape(mojo)}
</template>
"""

if "</body>" not in doc:
    raise SystemExit("generated HTML has no </body>")
doc = doc.replace("</body>", notice + "\n</body>", 1)
html_path.write_text(doc, encoding="utf-8")
PY

cp "$HTML" "$WORK_ROOT/kkrieger_standalone.html"

echo "single-file build: $WORK_ROOT/kkrieger_standalone.html"
sha256sum "$WORK_ROOT/kkrieger_standalone.html"
du -h "$WORK_ROOT/kkrieger_standalone.html"
