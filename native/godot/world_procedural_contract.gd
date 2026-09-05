extends RefCounted
class_name WorldProceduralContract

const CONTRACT_VERSION := "world-procedural-native-contract-v3"

static func canonical_voxel_lines(voxels: Array) -> String:
    var rows: Array = []
    for v in voxels:
        if typeof(v) != TYPE_ARRAY or v.size() < 4:
            continue
        rows.append([int(v[0]), int(v[1]), int(v[2]), int(v[3])])
    rows.sort_custom(func(a, b):
        if a[0] != b[0]: return a[0] < b[0]
        if a[2] != b[2]: return a[2] < b[2]
        if a[1] != b[1]: return a[1] < b[1]
        return a[3] < b[3]
    )
    var out := ""
    for r in rows:
        out += "%d,%d,%d,%d\n" % [r[0], r[1], r[2], r[3]]
    return out

static func portable_chunk_signature(voxels: Array) -> String:
    var ctx := HashingContext.new()
    ctx.start(HashingContext.HASH_SHA256)
    ctx.update(canonical_voxel_lines(voxels).to_utf8_buffer())
    return ctx.finish().hex_encode()

static func chunk_report(chunk_x: int, chunk_z: int, voxels: Array) -> Dictionary:
    return {
        "x": chunk_x,
        "z": chunk_z,
        "voxels": voxels.size(),
        "portableSignature": portable_chunk_signature(voxels)
    }

static func report(chunks: Array, platform_name := "godot") -> Dictionary:
    return {
        "contractVersion": CONTRACT_VERSION,
        "platform": platform_name,
        "chunks": chunks
    }
