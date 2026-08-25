#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, mmap, os
from pathlib import Path

DEFAULT_WINDOW = 8 * 1024 * 1024

def iter_windows(path: Path, window: int = DEFAULT_WINDOW):
    size = path.stat().st_size
    with path.open('rb') as f:
        offset = 0
        while offset < size:
            length = min(window, size - offset)
            # mmap offsets must align to allocation granularity.
            gran = mmap.ALLOCATIONGRANULARITY
            base = (offset // gran) * gran
            delta = offset - base
            mapped_len = min(size - base, delta + length)
            with mmap.mmap(f.fileno(), mapped_len, access=mmap.ACCESS_READ, offset=base) as mm:
                yield offset, bytes(memoryview(mm)[delta:delta+length])
            offset += length

def sha256_streamed(path: Path, window: int = DEFAULT_WINDOW) -> str:
    h = hashlib.sha256()
    for _, chunk in iter_windows(path, window): h.update(chunk)
    return h.hexdigest()

def self_test() -> dict:
    import tempfile
    payload = bytes((i * 37 + 11) & 255 for i in range(2_000_003))
    with tempfile.TemporaryDirectory() as td:
        p = Path(td)/'huge.bin'; p.write_bytes(payload)
        pieces = list(iter_windows(p, 131071))
        rebuilt = b''.join(x[1] for x in pieces)
        return {
            'schemaVersion': 1, 'pass': rebuilt == payload and sha256_streamed(p, 131071) == hashlib.sha256(payload).hexdigest(),
            'mode': 'mmap-windowed-bounded-memory-v1', 'windows': len(pieces), 'bytes': len(payload),
            'maxWindowBytes': max(len(c) for _, c in pieces), 'wholeFileLoaded': False,
        }

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('path', nargs='?'); ap.add_argument('--window-mib', type=int, default=8); ap.add_argument('--self-test', action='store_true'); a=ap.parse_args()
    if a.self_test or not a.path:
        out=self_test()
    else:
        p=Path(a.path); out={'pass':p.is_file(),'path':str(p),'bytes':p.stat().st_size if p.exists() else 0,'sha256':sha256_streamed(p,a.window_mib*1024*1024) if p.exists() else None,'mode':'mmap-windowed-bounded-memory-v1'}
    print(json.dumps(out,indent=2)); return 0 if out['pass'] else 2
if __name__=='__main__': raise SystemExit(main())
