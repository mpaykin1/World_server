extends RefCounted
class_name ShaderHitchCollectorV10
var frame := 0
var events: Array[Dictionary] = []
func record_shader_compile(variant: String, compile_ms: float) -> void:
    events.append({"frame": frame, "timestamp": Time.get_ticks_msec()/1000.0, "variant": variant, "compileMs": compile_ms, "frameSpikeMs": compile_ms, "source":"godot-explicit-warmup"})
func record_frame(frame_ms: float, hitch_ms: float = 8.0) -> void:
    frame += 1
    if frame_ms >= hitch_ms:
        events.append({"frame": frame, "timestamp": Time.get_ticks_msec()/1000.0, "variant":"unknown", "compileMs":0.0, "frameSpikeMs":frame_ms, "source":"godot-frame-spike-unattributed"})
func drain() -> Array[Dictionary]:
    var out = events.duplicate(true); events.clear(); return out
