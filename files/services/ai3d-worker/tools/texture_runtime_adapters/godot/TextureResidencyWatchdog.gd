extends Node
class_name TextureResidencyWatchdog

var events: Array[Dictionary] = []
@export var max_events := 2048

func record(set_key: String, event_name: String, extra: Dictionary = {}) -> void:
    var row := {
        "setKey": set_key,
        "event": event_name,
        "timestamp": Time.get_ticks_msec() / 1000.0,
    }
    row.merge(extra, true)
    events.append(row)
    while events.size() > max_events:
        events.pop_front()

func snapshot() -> Dictionary:
    return {
        "schemaVersion": 1,
        "events": events.duplicate(true),
        "note": "Godot adapter records explicit residency/import/runtime events; it does not invent VRAM/OOM telemetry.",
    }

func emergency_mip_bias(set_key: String, plan: Dictionary, profile: String) -> int:
    for row in plan.get("entries", []):
        if row.get("setKey", "") == set_key and row.get("profile", "") == profile:
            return int(row.get("emergencyMipBiasDelta", 0))
    return 0
