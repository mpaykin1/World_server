#!/usr/bin/env python3
"""
Build «Остров сумерек»:
  1. art      packs/*/art/*.py → build/assets.json            (art/build.py)
  2. bundle   engine/00..05 + every pack's *.js + engine/10..99 → one ES module
  3. page     template/page.html + bundle → dist/index.html (artifact body) and dist/test.html
  4. check    node --check on the module

usage: python3 tools/build.py [--no-art]
"""
import glob
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
DIST = os.path.join(ROOT, "dist")
SPLIT = "05_registry.js"          # packs are inserted right after this engine module


def packs():
    out = []
    for pj in glob.glob(os.path.join(ROOT, "packs", "*", "pack.json")):
        meta = json.load(open(pj, encoding="utf-8"))
        meta["dir"] = os.path.dirname(pj)
        out.append(meta)
    out.sort(key=lambda m: (m.get("order", 50), m["id"]))
    return out


def bundle():
    eng = sorted(glob.glob(os.path.join(ROOT, "engine", "*.js")))
    names = [os.path.basename(f) for f in eng]
    if SPLIT not in names:
        raise SystemExit("engine/05_registry.js missing")
    k = names.index(SPLIT) + 1
    parts = [open(f, encoding="utf-8").read() for f in eng[:k]]
    for p in packs():
        meta = {key: p[key] for key in ("id", "name", "desc", "order") if key in p}
        parts.append(f"\n/* ===== pack: {p['id']} ===== */\npackBegin({json.dumps(meta, ensure_ascii=False)});\n")
        for f in sorted(glob.glob(os.path.join(p["dir"], "*.js"))):
            # each pack file gets its own block scope: local helpers never clash across packs
            parts.append(f"/* --- {os.path.relpath(f, ROOT)} --- */\n{{\n" + open(f, encoding="utf-8").read() + "\n}\n")
        parts.append("packEnd();\n")
    parts += [open(f, encoding="utf-8").read() for f in eng[k:]]
    return "\n".join(parts)


def main():
    if "--no-art" not in sys.argv:
        from art import build as art_build
        _, counts = art_build.main()
        print("art:", counts)
    assets = json.load(open(os.path.join(ROOT, "build", "assets.json")))
    js = bundle().replace("__ASSETS_JSON__", json.dumps(assets, separators=(",", ":")))
    tpl = open(os.path.join(ROOT, "template", "page.html"), encoding="utf-8").read()
    if tpl.count("/*__GAME__*/") != 1:
        raise SystemExit("template marker missing")
    page = tpl.replace("/*__GAME__*/", js)
    os.makedirs(DIST, exist_ok=True)
    with open(os.path.join(DIST, "index.html"), "w", encoding="utf-8") as fh:
        fh.write(page)
    skeleton = (
        '<!doctype html><html lang="ru"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
        "<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}"
        "body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>"
        "</head><body>"
    )
    with open(os.path.join(DIST, "test.html"), "w", encoding="utf-8") as fh:
        fh.write(skeleton + page + "</body></html>")
    check = os.path.join(DIST, "_check.mjs")
    with open(check, "w", encoding="utf-8") as fh:
        fh.write(js)
    r = subprocess.run(["node", "--check", check], capture_output=True, text=True)
    os.remove(check)
    if r.returncode != 0:
        print(r.stderr)
        sys.exit(1)
    print("ok", os.path.getsize(os.path.join(DIST, "index.html")), "bytes,", len(packs()), "pack(s)")


if __name__ == "__main__":
    main()
