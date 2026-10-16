#!/usr/bin/env python3
"""
The whole source tree as one JSON file and back — so the project travels inside the published game
(artifact file 'source.json') even where git is not at hand.

usage: python3 tools/bundle.py pack   [OUT.json]        (default: dist/source.json)
       python3 tools/bundle.py unpack IN.json DIR       recreate the tree in DIR (DIR must be empty or new)
       python3 tools/bundle.py list   IN.json

Packed: engine/, packs/, art/, tools/, template/, docs/, README.md, package.json — sources only
(no node_modules, build/, dist/, caches). Text files only; every file keeps its relative path.
"""
import hashlib
import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INCLUDE = ["engine", "packs", "art", "tools", "template", "docs", "README.md", "package.json"]
SKIP_DIRS = {"node_modules", "build", "dist", "__pycache__", ".git"}
TEXT_EXT = {".js", ".py", ".json", ".md", ".html", ".css", ".txt", ".mjs", ".cjs"}


def walk():
    for top in INCLUDE:
        p = os.path.join(ROOT, top)
        if os.path.isfile(p):
            yield top
            continue
        for d, dirs, files in os.walk(p):
            dirs[:] = sorted(x for x in dirs if x not in SKIP_DIRS)
            for f in sorted(files):
                if os.path.splitext(f)[1] in TEXT_EXT:
                    yield os.path.relpath(os.path.join(d, f), ROOT).replace(os.sep, "/")


def pack(out):
    files = {rel: open(os.path.join(ROOT, rel), encoding="utf-8").read() for rel in walk()}
    blob = json.dumps(files, ensure_ascii=False, sort_keys=True)
    doc = {"name": "ostrov-sumerek", "format": 1, "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
           "sha256": hashlib.sha256(blob.encode()).hexdigest(), "files": files}
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    json.dump(doc, open(out, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"packed {len(files)} files, {os.path.getsize(out) // 1024} KB → {os.path.relpath(out, ROOT)}")


def unpack(src, dest):
    doc = json.load(open(src, encoding="utf-8"))
    if os.path.isdir(dest) and os.listdir(dest):
        sys.exit(f"{dest} is not empty")
    for rel, text in doc["files"].items():
        if rel.startswith("/") or ".." in rel.split("/"):
            sys.exit(f"refusing path {rel}")
        p = os.path.join(dest, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, "w", encoding="utf-8").write(text)
    print(f"unpacked {len(doc['files'])} files into {dest}  (then: npm i three@0.160.0 && python3 tools/build.py)")


def main():
    a = sys.argv[1:]
    if not a or a[0] not in ("pack", "unpack", "list"):
        print(__doc__); sys.exit(1)
    if a[0] == "pack":
        pack(a[1] if len(a) > 1 else os.path.join(ROOT, "dist", "source.json"))
    elif a[0] == "unpack":
        unpack(a[1], a[2])
    else:
        doc = json.load(open(a[1], encoding="utf-8"))
        for rel, text in doc["files"].items():
            print(f"{len(text):>8}  {rel}")


if __name__ == "__main__":
    main()
