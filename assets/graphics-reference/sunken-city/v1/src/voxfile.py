"""MagicaVoxel .vox writer (version 150): SIZE + XYZI + RGBA, and MATL chunks that make the glowing
palette entries emissive. Axes: the pack's y is up → MagicaVoxel z is up (x stays, depth flips)."""
import struct

import numpy as np
from PIL import Image


def _chunk(cid, content=b"", children=b""):
    return cid.encode() + struct.pack("<ii", len(content), len(children)) + content + children


def _string(s):
    b = s.encode()
    return struct.pack("<i", len(b)) + b


def _dict(d):
    out = struct.pack("<i", len(d))
    for k, v in d.items():
        out += _string(k) + _string(v)
    return out


def write_vox(path, occ, rgb, glow):
    X, Y, Z = occ.shape
    if max(X, Y, Z) > 256:
        raise ValueError(f"model too large for .vox: {occ.shape}")
    idx = np.argwhere(occ)
    cols = rgb[occ].astype(int)
    gl = glow[occ]
    keys = cols[:, 0] * 65536 + cols[:, 1] * 256 + cols[:, 2] + gl.astype(int) * (1 << 24)
    uq, inv = np.unique(keys, return_inverse=True)
    if len(uq) > 255:                                   # too many colours: median-cut quantise the palette
        uc = np.stack([(uq >> 16) & 255, (uq >> 8) & 255, uq & 255], 1).astype(np.uint8)
        im = Image.fromarray(uc[None, :, :]).quantize(colors=255, method=Image.Quantize.MEDIANCUT)
        lut = np.array(im).ravel()
        pal = np.array(im.getpalette()[:255 * 3]).reshape(-1, 3)
        pidx = lut[inv]
        entries = [(tuple(pal[i]), False) for i in range(len(pal))]
        for k, g in zip(pidx, gl):
            if g:
                entries[k] = (entries[k][0], True)
    else:
        pidx = inv
        entries = [(((int(k) >> 16) & 255, (int(k) >> 8) & 255, int(k) & 255), bool(int(k) >> 24)) for k in uq]
    xyzi = struct.pack("<i", len(idx))
    data = np.zeros((len(idx), 4), np.uint8)
    data[:, 0] = idx[:, 0]
    data[:, 1] = (Z - 1) - idx[:, 2]
    data[:, 2] = idx[:, 1]
    data[:, 3] = np.asarray(pidx) + 1
    xyzi += data.tobytes()
    rgba = bytearray()
    for i in range(256):
        if i < len(entries):
            r, g, b = entries[i][0]
            rgba += bytes([int(r), int(g), int(b), 255])
        else:
            rgba += bytes([0, 0, 0, 255])
    children = _chunk("SIZE", struct.pack("<iii", X, Z, Y)) + _chunk("XYZI", xyzi) + _chunk("RGBA", bytes(rgba))
    for i, (_, g) in enumerate(entries):
        if g:
            children += _chunk("MATL", struct.pack("<i", i + 1) + _dict({"_type": "_emit", "_emit": "0.6", "_flux": "1", "_ldr": "0"}))
    data = b"VOX " + struct.pack("<i", 150) + _chunk("MAIN", b"", children)
    with open(path, "wb") as fh:
        fh.write(data)
    return len(data)


def read_vox(path):
    """Minimal reader for tests: returns (size, voxels (n,4), palette rgba (256,4), emissive ids)."""
    b = open(path, "rb").read()
    assert b[:4] == b"VOX ", "bad magic"
    pos = 8
    cid = b[pos:pos + 4]
    n, m = struct.unpack("<ii", b[pos + 4:pos + 12])
    assert cid == b"MAIN"
    pos += 12 + n
    end = pos + m
    size = vox = pal = None
    emit = []
    while pos < end:
        cid = b[pos:pos + 4].decode()
        n, m = struct.unpack("<ii", b[pos + 4:pos + 12])
        body = b[pos + 12:pos + 12 + n]
        if cid == "SIZE":
            size = struct.unpack("<iii", body)
        elif cid == "XYZI":
            cnt = struct.unpack("<i", body[:4])[0]
            vox = np.frombuffer(body[4:4 + cnt * 4], np.uint8).reshape(-1, 4)
        elif cid == "RGBA":
            pal = np.frombuffer(body, np.uint8).reshape(256, 4)
        elif cid == "MATL":
            emit.append(struct.unpack("<i", body[:4])[0])
        pos += 12 + n + m
    return size, vox, pal, emit
