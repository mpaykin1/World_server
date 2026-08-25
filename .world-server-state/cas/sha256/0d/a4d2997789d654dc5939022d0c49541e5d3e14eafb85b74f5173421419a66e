extends Node
class_name TextureMetricsCollector

var frame_ms: Array[float] = []
var estimated_texture_vram_mb: Variant = null

func record_frame(delta: float) -> void:
    if delta > 0.0:
        frame_ms.append(delta * 1000.0)

func report(platform: String = "godot_desktop") -> Dictionary:
    var values := frame_ms.duplicate()
    values.sort()
    var mean := 0.0
    for value in values: mean += value
    if values.size() > 0: mean /= values.size()
    var p95: Variant = null
    if values.size() > 0:
        p95 = values[min(values.size() - 1, int(floor(values.size() * 0.95)))]
    return {
        "platform": platform,
        "fps": (1000.0 / mean) if mean > 0.0 else null,
        "p95FrameMs": p95,
        "textureVramMB": estimated_texture_vram_mb,
        "textureVramSource": "STATIC_RUNTIME_PLAN_ESTIMATE" if estimated_texture_vram_mb != null else "UNAVAILABLE",
        "visualDelta": null,
        "visualDeltaSource": "REQUIRES_BEFORE_AFTER_CAPTURE",
        "frames": values.size(),
    }
