@tool
extends Node
class_name CinematicVoxelPerformanceGovernor

@export var target_fps_desktop := 60.0
@export var target_fps_mobile := 45.0
@export var min_scale := 0.68
@export var hero_quality_floor := 0.78
@export var sample_window := 180
var _frames: Array[float] = []
var _last_adjust_ms := 0
var quality_scale := 1.0
var far_detail := 1.0
var atmosphere := 1.0
var shadow_quality := 1.0

func _process(delta: float) -> void:
	if delta <= 0.0: return
	_frames.append(delta * 1000.0)
	if _frames.size() > sample_window: _frames.pop_front()
	var now := Time.get_ticks_msec()
	if _frames.size() < 60 or now - _last_adjust_ms < 2500: return
	var sorted := _frames.duplicate(); sorted.sort()
	var p95: float = sorted[int((sorted.size()-1)*0.95)]
	var target: float = target_fps_mobile if OS.has_feature("mobile") else target_fps_desktop
	var budget: float = 1000.0 / maxf(target, 1.0)
	if p95 > budget * 1.55:
		far_detail = max(0.35, far_detail - 0.08)
		shadow_quality = max(0.45, shadow_quality - 0.06)
		atmosphere = max(0.52, atmosphere - 0.05)
		if far_detail <= 0.45: quality_scale = max(min_scale, quality_scale - 0.04)
	elif p95 < budget * 0.90:
		quality_scale = min(1.0, quality_scale + 0.02)
		far_detail = min(1.0, far_detail + 0.04)
		shadow_quality = min(1.0, shadow_quality + 0.03)
		atmosphere = min(1.0, atmosphere + 0.03)
	_last_adjust_ms = now
	get_tree().call_group("cinematic_quality_adapter", "apply_device_quality", {"scale":quality_scale,"far_detail":far_detail,"atmosphere":atmosphere,"shadow_quality":shadow_quality,"hero_floor":hero_quality_floor})
