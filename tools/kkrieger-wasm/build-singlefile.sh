#!/usr/bin/env bash
set -euo pipefail

UPSTREAM_ROOT="${1:-}"
if [[ -z "$UPSTREAM_ROOT" || ! -d "$UPSTREAM_ROOT/werkkzeug3_kkrieger/wasm" ]]; then
  echo "usage: $0 <kkrieger-wasm checkout>"
  exit 2
fi

EXPECTED_SHA="${KKRIEGER_UPSTREAM_SHA:-3bf0ff017372e640e966c2785a4d95a998cec242}"
EXPECTED_BUILD_SH_SHA256="f3b1c4ea87e45b814fd44889ad71252d61717033953d6c40b3fc13ded3278659"
EXPECTED_OUTPUT_SHA256="e4a327da9c3a1312501cba89f1bdc15798af3f50fda61d9c089002dcd0529782"

ACTUAL_SHA="$(git -C "$UPSTREAM_ROOT" rev-parse HEAD)"
if [[ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]]; then
  echo "unexpected upstream SHA: $ACTUAL_SHA (expected $EXPECTED_SHA)"
  exit 3
fi

if [[ -n "$(git -C "$UPSTREAM_ROOT" status --porcelain --untracked-files=all)" ]]; then
  echo "upstream checkout is not clean; refusing to execute modified source"
  exit 4
fi

ROOT="$UPSTREAM_ROOT/werkkzeug3_kkrieger"
BUILD_SH="$ROOT/wasm/build.sh"
ACTUAL_BUILD_SH_SHA256="$(sha256sum "$BUILD_SH" | awk '{print $1}')"
if [[ "$ACTUAL_BUILD_SH_SHA256" != "$EXPECTED_BUILD_SH_SHA256" ]]; then
  echo "upstream build.sh integrity mismatch: $ACTUAL_BUILD_SH_SHA256"
  exit 5
fi

# Do not accept an externally supplied work path. This keeps all generated
# paths under the checked-out workspace and removes shell/eval ambiguity.
WORK_ROOT="$PWD/work/kkrieger-singlefile"
DIST="$WORK_ROOT/dist"
PATCHED="$ROOT/wasm/build.singlefile.generated.sh"

rm -rf "$WORK_ROOT"
mkdir -p "$WORK_ROOT"

cp "$BUILD_SH" "$PATCHED"

python3 - "$PATCHED" <<'PY'
from pathlib import Path
import sys

p = Path(sys.argv[1])
s = p.read_text(encoding="utf-8")

needle = '  -sENVIRONMENT=web\n'
if s.count(needle) != 1:
    raise SystemExit(
        f"expected exactly one Emscripten web environment flag, found {s.count(needle)}"
    )
s = s.replace(needle, needle + '  -sSINGLE_FILE=1\n', 1)

replacements = (
    ('--preload-file "$ROOT/data/kkrieger3383.kx@/kkrieger.kx"',
     '--embed-file "$ROOT/data/kkrieger3383.kx@/kkrieger.kx"'),
    ('--preload-file "$ROOT/data/kkrieger_beta_conv.kx@/kkrieger_beta.kx"',
     '--embed-file "$ROOT/data/kkrieger_beta_conv.kx@/kkrieger_beta.kx"'),
)
for old, new in replacements:
    count = s.count(old)
    if count != 1:
        raise SystemExit(f"expected exactly one preload flag {old!r}, found {count}")
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
  exit 6
fi

# Carry the upstream BSD and MojoShader zlib notices inside the one distributed file.
python3 - "$HTML" "$ROOT/LICENSE.txt" "$ROOT/wasm/mojoshader/LICENSE.txt" "$EXPECTED_SHA" <<'PY'
from pathlib import Path
import html
import sys

html_path = Path(sys.argv[1])
bsd_path = Path(sys.argv[2])
mojo_path = Path(sys.argv[3])
sha = sys.argv[4]

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

ACTUAL_OUTPUT_SHA256="$(sha256sum "$WORK_ROOT/kkrieger_standalone.html" | awk '{print $1}')"
if [[ "$ACTUAL_OUTPUT_SHA256" != "$EXPECTED_OUTPUT_SHA256" ]]; then
  echo "non-reproducible output: $ACTUAL_OUTPUT_SHA256 (expected $EXPECTED_OUTPUT_SHA256)"
  exit 7
fi

echo "single-file build: $WORK_ROOT/kkrieger_standalone.html"
echo "$ACTUAL_OUTPUT_SHA256  $WORK_ROOT/kkrieger_standalone.html"
du -h "$WORK_ROOT/kkrieger_standalone.html"
