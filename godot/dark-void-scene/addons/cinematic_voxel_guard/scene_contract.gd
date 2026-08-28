extends Node
class_name CinematicVoxelSceneContract

@export var depth_layers := 3
@export var hero_lights := 2
@export_range(0.0, 2.0) var near_voxel_density_ratio := 1.0
@export_range(0.0, 1.0) var atmosphere_quality_ratio := 0.8
@export var material_layers := 3
@export var eye_integrated := true
@export var fire_complete := true
@export var navigator_ui_required := true
@export var navigator_ui_present := true
@export_range(0.0, 1.0) var empty_screen_ratio := 0.35

func _ready() -> void:
	if has_node("/root/CinematicVoxelGuard"):
		get_node("/root/CinematicVoxelGuard").register_adapter(self)

func get_cinematic_stats() -> Dictionary:
	return {
		"depth_layers": depth_layers,
		"hero_lights": hero_lights,
		"near_voxel_density_ratio": near_voxel_density_ratio,
		"atmosphere_quality_ratio": atmosphere_quality_ratio,
		"material_layers": material_layers,
		"eye_integrated": eye_integrated,
		"fire_complete": fire_complete,
		"navigator_ui_required": navigator_ui_required,
		"navigator_ui_present": navigator_ui_present,
		"empty_screen_ratio": empty_screen_ratio
	}

func apply_cinematic_quality(scale: float, fps: float, target_fps: float) -> void:
	# Scene implementation should override/extend. Protect hero/near geometry; reduce far/hidden work first.
	near_voxel_density_ratio = max(0.72, min(1.20, scale))
	atmosphere_quality_ratio = max(0.45, min(1.0, scale))

func ensure_depth_layers() -> void: depth_layers = max(depth_layers, 3)
func ensure_hero_lighting() -> void: hero_lights = max(hero_lights, 2)
func increase_near_voxel_density() -> void: near_voxel_density_ratio = max(near_voxel_density_ratio, 0.90)
func ensure_volumetric_atmosphere() -> void: atmosphere_quality_ratio = max(atmosphere_quality_ratio, 0.65)
func ensure_material_layers() -> void: material_layers = max(material_layers, 3)
func integrate_eye_into_world() -> void: eye_integrated = true
func upgrade_fire_beacon() -> void: fire_complete = true
func ensure_navigator_ui() -> void: navigator_ui_present = true
func fill_meaningful_world_detail() -> void: empty_screen_ratio = min(empty_screen_ratio, 0.45)
