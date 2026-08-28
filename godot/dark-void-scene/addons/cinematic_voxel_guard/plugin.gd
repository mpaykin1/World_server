@tool
extends EditorPlugin

const ExportGate = preload("res://addons/cinematic_voxel_guard/export_gate.gd")
var last_audit: Dictionary = {}

func _enter_tree() -> void:
	print("[CinematicVoxelGuard] V3 enabled — primitive graphics fail closed")

func _exit_tree() -> void:
	pass

func _build() -> bool:
	var root := get_editor_interface().get_edited_scene_root()
	if root == null: return true
	if not root.has_meta("cinematic_voxel_guard") and not root.is_in_group("cinematic_voxel_scene"):
		return true
	last_audit = ExportGate.audit_scene(root)
	if not last_audit.get("pass", false):
		push_error("[CinematicVoxelGuard] BUILD BLOCKED: " + JSON.stringify(last_audit))
		return false
	print("[CinematicVoxelGuard] BUILD PASS score=", last_audit.get("score", 0))
	return true
