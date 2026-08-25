#!/usr/bin/env python3
from __future__ import annotations

"""Minimal dependency SPZ position decoder for collision/semantic pipelines.

Supports:
- SPZ v1-v3 legacy gzip container (reads the position stream only)
- SPZ v4 NGSP+ZSTD container (reads stream 0 = positions)

It deliberately does not rewrite the visual SPZ and does not attempt to render splats.
The factory only needs exact decoded centers for non-destructive collision/semantic analysis.
"""

from dataclasses import dataclass
from pathlib import Path
import gzip
import io
import shutil
import struct
import subprocess
import tempfile
from typing import BinaryIO
import numpy as np

MAGIC = 0x5053474E  # bytes 'NGSP'

@dataclass(frozen=True)
class SpzHeader:
    version: int
    num_points: int
    sh_degree: int
    fractional_bits: int
    flags: int
    num_streams: int = 0
    toc_offset: int = 0
    container: str = 'legacy-gzip'


def _decode_s24_triplets(raw: bytes, fractional_bits: int) -> np.ndarray:
    if len(raw) % 9:
        raise ValueError(f'SPZ position stream has invalid byte length {len(raw)} (must be N*9)')
    u = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 9)
    vals = np.empty((len(u), 3), dtype=np.int32)
    for c in range(3):
        j = c * 3
        v = (u[:, j].astype(np.int32) |
             (u[:, j+1].astype(np.int32) << 8) |
             (u[:, j+2].astype(np.int32) << 16))
        v = np.where((v & 0x800000) != 0, v - 0x1000000, v)
        vals[:, c] = v
    return vals.astype(np.float32) / float(1 << int(fractional_bits))


def _parse_legacy_header(stream: BinaryIO) -> SpzHeader:
    h = stream.read(16)
    if len(h) != 16:
        raise ValueError('Truncated legacy SPZ header')
    magic, version, num_points = struct.unpack_from('<III', h, 0)
    if magic != MAGIC:
        raise ValueError(f'Bad SPZ magic 0x{magic:08x}')
    if version not in (1, 2, 3):
        raise ValueError(f'Unsupported legacy SPZ version {version}')
    sh_degree, fractional_bits, flags, _reserved = struct.unpack_from('<BBBB', h, 12)
    if not (0 <= sh_degree <= 4):
        raise ValueError(f'Invalid SPZ shDegree {sh_degree}')
    if not (0 <= fractional_bits <= 23):
        raise ValueError(f'Invalid SPZ fractionalBits {fractional_bits}')
    return SpzHeader(version, num_points, sh_degree, fractional_bits, flags)


def _zstd_decompress(raw: bytes, expected_size: int) -> bytes:
    # Prefer optional Python binding when present; otherwise use the ubiquitous zstd CLI.
    try:
        import zstandard as zstd  # type: ignore
        out = zstd.ZstdDecompressor().decompress(raw, max_output_size=max(expected_size, 1))
    except Exception:
        exe = shutil.which('zstd')
        if not exe:
            raise RuntimeError('SPZ v4 requires zstandard Python package or the `zstd` executable')
        proc = subprocess.run([exe, '-d', '-q', '-c'], input=raw, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, check=False)
        if proc.returncode:
            raise RuntimeError('zstd decompression failed: ' + proc.stderr.decode('utf-8', 'replace')[-800:])
        out = proc.stdout
    if expected_size and len(out) != expected_size:
        raise ValueError(f'SPZ v4 stream length mismatch: decoded={len(out)} expected={expected_size}')
    return out


def _read_v4(path: Path) -> tuple[np.ndarray, SpzHeader]:
    with path.open('rb') as f:
        fixed = f.read(32)
        if len(fixed) != 32:
            raise ValueError('Truncated SPZ v4 header')
        magic, version, num_points = struct.unpack_from('<III', fixed, 0)
        if magic != MAGIC or version != 4:
            raise ValueError('Not an SPZ v4 file')
        sh_degree, fractional_bits, flags, num_streams = struct.unpack_from('<BBBB', fixed, 12)
        toc_offset = struct.unpack_from('<I', fixed, 16)[0]
        if num_streams < 1 or num_streams > 32:
            raise ValueError(f'Invalid SPZ v4 stream count {num_streams}')
        if toc_offset < 32:
            raise ValueError(f'Invalid SPZ v4 TOC offset {toc_offset}')
        h = SpzHeader(version, num_points, sh_degree, fractional_bits, flags,
                      num_streams=num_streams, toc_offset=toc_offset, container='v4-zstd')
        f.seek(toc_offset)
        toc = []
        for _ in range(num_streams):
            entry = f.read(16)
            if len(entry) != 16:
                raise ValueError('Truncated SPZ v4 TOC')
            toc.append(struct.unpack('<QQ', entry))
        data_offset = toc_offset + 16 * num_streams
        pos_comp, pos_raw = toc[0]
        if pos_raw != num_points * 9:
            raise ValueError(f'SPZ v4 position stream mismatch: {pos_raw} != {num_points*9}')
        f.seek(data_offset)
        compressed = f.read(pos_comp)
        if len(compressed) != pos_comp:
            raise ValueError('Truncated SPZ v4 position stream')
    raw = _zstd_decompress(compressed, pos_raw)
    return _decode_s24_triplets(raw, fractional_bits), h


def decode_all_positions(path: Path) -> tuple[np.ndarray, SpzHeader]:
    path = Path(path)
    with path.open('rb') as f:
        prefix = f.read(4)
    if prefix[:2] == b'\x1f\x8b':
        with gzip.open(path, 'rb') as g:
            h = _parse_legacy_header(g)
            raw = g.read(h.num_points * 9)
        if len(raw) != h.num_points * 9:
            raise ValueError(f'Truncated legacy SPZ positions: {len(raw)} != {h.num_points*9}')
        return _decode_s24_triplets(raw, h.fractional_bits), h
    if prefix == b'NGSP':
        return _read_v4(path)
    raise ValueError('Unknown SPZ container: expected gzip or NGSP v4')


def decode_positions(path: Path, max_points: int = 700_000) -> tuple[np.ndarray, dict]:
    pts, h = decode_all_positions(path)
    source_points = int(len(pts))
    if source_points > max_points:
        # Deterministic stratified stride: reproducible collider generation and regression tests.
        idx = np.linspace(0, source_points - 1, max_points, dtype=np.int64)
        pts = pts[idx]
    meta = {
        'decoder': 'world-factory-native-spz-position-v1',
        'native': True,
        'container': h.container,
        'version': h.version,
        'sourcePoints': source_points,
        'sampledPoints': int(len(pts)),
        'fractionalBits': h.fractional_bits,
        'shDegree': h.sh_degree,
        'antialiased': bool(h.flags & 0x1),
        'sourceAssetModified': False,
        'purpose': 'collision-semantic-position-centers',
    }
    return pts, meta


def main() -> None:
    import argparse, json
    ap = argparse.ArgumentParser(description='Decode exact SPZ gaussian centers without modifying the source asset.')
    ap.add_argument('spz', type=Path)
    ap.add_argument('--max-points', type=int, default=700_000)
    ap.add_argument('--npy', type=Path, default=None)
    args = ap.parse_args()
    pts, meta = decode_positions(args.spz, args.max_points)
    if args.npy:
        args.npy.parent.mkdir(parents=True, exist_ok=True)
        np.save(args.npy, pts)
    print(json.dumps({**meta, 'bounds': {'min': pts.min(0).astype(float).tolist(), 'max': pts.max(0).astype(float).tolist()}}, indent=2))


if __name__ == '__main__':
    main()
