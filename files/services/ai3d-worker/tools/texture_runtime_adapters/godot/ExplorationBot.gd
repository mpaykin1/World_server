extends Node
class_name TextureExplorationBot

signal sample_requested(waypoint: Dictionary)
signal mission_finished(samples: Array)

var aborted := false
var dwell_scale := 1.0

func abort() -> void:
    aborted = true

func run_mission(camera: Camera3D, mission: Dictionary) -> Array:
    var samples: Array = []
    for waypoint in mission.get("waypoints", []):
        if aborted:
            break
        var p = waypoint.get("position", [])
        var look = waypoint.get("lookAt", [])
        if p.size() < 3 or look.size() < 3:
            continue
        # Candidate adapter: caller must validate navigation/collisions before accepting teleport movement.
        camera.global_position = Vector3(float(p[0]), float(p[1]), float(p[2]))
        camera.look_at(Vector3(float(look[0]), float(look[1]), float(look[2])), Vector3.UP)
        await get_tree().create_timer(max(0.05, float(waypoint.get("dwellSeconds", 0.5)) * dwell_scale)).timeout
        sample_requested.emit(waypoint)
        samples.append({"targetSetKey": waypoint.get("targetSetKey"), "cameraPosition": [camera.global_position.x, camera.global_position.y, camera.global_position.z]})
    mission_finished.emit(samples)
    return samples
