extends Node

const FLOOR_SCORE := 88.0
const TARGET_SCORE := 98.0
var adapters: Array[Node] = []
var fps_samples: Array[float] = []
var current_quality := 1.0

func register_adapter(adapter: Node) -> void:
	if adapter != null and not adapters.has(adapter): adapters.append(adapter)

func unregister_adapter(adapter: Node) -> void:
	adapters.erase(adapter)

func _process(delta: float) -> void:
	if delta <= 0.0: return
	fps_samples.append(1.0 / delta)
	if fps_samples.size() > 180: fps_samples.pop_front()
	if Engine.get_process_frames() % 120 == 0:
		_tune_performance()
		for adapter in adapters.duplicate():
			if is_instance_valid(adapter): audit_and_repair(adapter)
			else: adapters.erase(adapter)

func _avg_fps() -> float:
	if fps_samples.is_empty(): return 0.0
	var total := 0.0
	for f in fps_samples: total += f
	return total / fps_samples.size()

func _target_fps() -> float:
	var os_name := OS.get_name().to_lower()
	if os_name.contains("android") or os_name.contains("ios"): return 45.0
	return 60.0

func _tune_performance() -> void:
	var fps := _avg_fps()
	var target := _target_fps()
	if fps > target + 8.0: current_quality = min(1.20, current_quality + 0.04)
	elif fps < target - 7.0: current_quality = max(0.72, current_quality - 0.05)
	for a in adapters:
		if is_instance_valid(a) and a.has_method("apply_cinematic_quality"):
			a.call("apply_cinematic_quality", current_quality, fps, target)

func audit_and_repair(a: Node) -> Dictionary:
	if not a.has_method("get_cinematic_stats"): return {"pass": false, "score": 0, "failures": ["adapter_missing_stats"]}
	var s: Dictionary = a.call("get_cinematic_stats")
	var failures: Array[String] = []
	if int(s.get("depth_layers", 0)) < 3: failures.append("depth_layers")
	if int(s.get("hero_lights", 0)) < 2: failures.append("hero_lights")
	if float(s.get("near_voxel_density_ratio", 0.0)) < 0.72: failures.append("near_voxel_density")
	if float(s.get("atmosphere_quality_ratio", 0.0)) < 0.45: failures.append("atmosphere")
	if int(s.get("material_layers", 0)) < 3: failures.append("material_layers")
	if not bool(s.get("eye_integrated", false)): failures.append("eye_integration")
	if not bool(s.get("fire_complete", false)): failures.append("fire_beacon")
	if bool(s.get("navigator_ui_required", true)) and not bool(s.get("navigator_ui_present", false)): failures.append("navigator_ui")
	if float(s.get("empty_screen_ratio", 1.0)) > 0.52: failures.append("empty_screen")
	var score := 100.0 - failures.size() * 12.0
	if score < FLOOR_SCORE or not failures.is_empty(): _repair(a, failures)
	return {"pass": failures.is_empty() and score >= FLOOR_SCORE, "score": score, "failures": failures, "stats": s}

func _repair(a: Node, failures: Array[String]) -> void:
	var methods := {
		"depth_layers":"ensure_depth_layers",
		"hero_lights":"ensure_hero_lighting",
		"near_voxel_density":"increase_near_voxel_density",
		"atmosphere":"ensure_volumetric_atmosphere",
		"material_layers":"ensure_material_layers",
		"eye_integration":"integrate_eye_into_world",
		"fire_beacon":"upgrade_fire_beacon",
		"navigator_ui":"ensure_navigator_ui",
		"empty_screen":"fill_meaningful_world_detail"
	}
	for failure in failures:
		var method := String(methods.get(failure, ""))
		if method != "" and a.has_method(method): a.call(method)
