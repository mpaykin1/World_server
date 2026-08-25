#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, tempfile
from pathlib import Path
try:
    import brotli
except Exception:
    brotli=None
try:
    import zstandard as zstd
except Exception:
    zstd=None

def encode(raw: bytes, prefer='brotli'):
    if prefer=='zstd' and zstd:
        enc=zstd.ZstdCompressor(level=7).compress(raw); codec='zstd'
    elif brotli:
        enc=brotli.compress(raw,quality=6); codec='brotli'
    else:
        import gzip; enc=gzip.compress(raw,compresslevel=6); codec='gzip-fallback'
    return codec,enc

def decode(codec: str, enc: bytes):
    if codec=='zstd': return zstd.ZstdDecompressor().decompress(enc)
    if codec=='brotli': return brotli.decompress(enc)
    import gzip; return gzip.decompress(enc)

def self_test():
    raw=(b'world-quality-v10-cache\0'*10000)+bytes(range(256))*64
    codec,enc=encode(raw); dec=decode(codec,enc)
    return {'schemaVersion':1,'pass':dec==raw,'mode':'lossless-derived-cache-transport-v1','codec':codec,'sourceSha256':hashlib.sha256(raw).hexdigest(),'decodedSha256':hashlib.sha256(dec).hexdigest(),'sourceBytes':len(raw),'encodedBytes':len(enc),'sourceAssetModified':False}

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--self-test',action='store_true'); a=ap.parse_args(); out=self_test(); print(json.dumps(out,indent=2)); return 0 if out['pass'] else 2
if __name__=='__main__': raise SystemExit(main())
