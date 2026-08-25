extends Node
class_name TextureRuntimeAdapter

var telemetry: Array[Dictionary] = []
var material_priorities: Dictionary = {}

func observe(set_key: String, distance: float, screen_coverage: float, visible: bool = true, seconds: float = 1.0) -> Dictionary:
    var safe_distance := max(0.05, distance)
    var coverage := clamp(screen_coverage, 0.0, 1.0)
    var score := (1.0 if visible else 0.15) * max(seconds, 0.0) * (0.25 + coverage * 3.0) / sqrt(safe_distance)
    var mip_bias := 3
    if score > 0.9: mip_bias = 0
    elif score > 0.3: mip_bias = 1
    elif score > 0.08: mip_bias = 2
    var event := {"setKey": set_key, "distance": distance, "screenCoverage": coverage, "visible": visible, "seconds": seconds, "desiredMipBias": mip_bias, "unixTime": Time.get_unix_time_from_system()}
    telemetry.append(event)
    material_priorities[set_key] = event
    return event

func drain_telemetry() -> Array[Dictionary]:
    var result := telemetry.duplicate(true)
    telemetry.clear()
    return result
