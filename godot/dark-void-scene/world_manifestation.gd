extends Node3D
class_name WorldManifestation
## Real world-generation backend for this scene - the same deterministic
## text -> shape pipeline as the browser port (WorldCommandParser +
## WorldShapeLibrary, ported line-for-line from shared/world-command-
## parser.mjs + shared/world-shape-library.mjs; no network/LLM call) and
## the original apps/voxel-world (WorldManifestationEngine), placing real
## voxel cubes near the Eye instead of just echoing the typed text.
##
## Placement is NOT the raw "12-19 grid units ahead of the player" the
## original engine uses - that's tuned for an open blocky world. In this
## vignette the mountain wall sits right at the Eye's spawn point, so a
## forward-only offset lands inside/behind it. SPAWN_X_BIAS + a fixed
## yaw of PI/2 push the engine's own scale-dependent forward distance
## sideways into open void instead - see the matching constant in the
## browser's shared/dark-void-manifestation.mjs for the pixel-readback
## sweep that found this window.

const MAX_BLOCKS_PER_PLAN := 700
const CAPACITY := 20000
const SPAWN_X_BIAS := 20.0
const SPAWN_Y_LIFT := 10.0

@export var vox_size: float = 0.34
## The Eye (or whatever hero node creations should appear beside).
@export var origin_path: NodePath = ^"/root/Main/Eye"

var _rock_dark := Color("161519")
var _rock_mid := Color("3c2a26")
var _rock_lit := Color("7a4c38")
var _leaf_color := Color("232c1c")
var _snow_color := Color("d8c9a8")
var _ember_color := Color("ffb066")
var _water_color := Color("3f6f9e")

var _mm: MultiMesh
var _mmi: MultiMeshInstance3D
var _origin_node: Node3D
var _slot_of: Dictionary = {}       # "x,y,z" -> instance slot int
var _block_type_of: Dictionary = {} # "x,y,z" -> currently-placed block_type
var _free: Array = []
var _max_used: int = 0

var busy := false
var undo_stack: Array = []
var redo_stack: Array = []
var last_intent: Dictionary = {}
var last_block_count: int = 0

func _ready() -> void:
	_origin_node = get_node_or_null(origin_path)
	var mesh := BoxMesh.new()
	mesh.size = Vector3.ONE * vox_size * 0.94
	_mm = MultiMesh.new()
	_mm.transform_format = MultiMesh.TRANSFORM_3D
	_mm.use_colors = true
	_mm.mesh = mesh
	_mm.instance_count = CAPACITY
	_mm.visible_instance_count = 0
	_mmi = MultiMeshInstance3D.new()
	_mmi.multimesh = _mm
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color.WHITE
	mat.vertex_color_use_as_albedo = true
	mat.roughness = 0.82
	mat.metallic = 0.04
	_mmi.material_override = mat
	add_child(_mmi)

## Returns {"error": String} on failure, or {"intent", "blocks"} on
## success - mirrors WorldManifestationEngine#execute's shape.
func execute(text: String) -> Dictionary:
	var intent := WorldCommandParser.parse_world_command(text)
	if intent.has("error"):
		return {"error": intent["error"]}
	if intent["action"] == "undo":
		return undo()
	if intent["action"] == "redo":
		return redo()
	if busy:
		return {"error": "Мир уже создаёт предыдущую команду."}
	if not _origin_node:
		return {"error": "Нет опорной точки для создания."}
	busy = true
	var origin_grid := {
		"x": _origin_node.global_position.x / vox_size + SPAWN_X_BIAS,
		"y": _origin_node.global_position.y / vox_size + SPAWN_Y_LIFT,
		"z": _origin_node.global_position.z / vox_size,
	}
	var blocks := WorldShapeLibrary.build_world_shape(intent, origin_grid, PI / 2.0, {}, MAX_BLOCKS_PER_PLAN)
	if blocks.is_empty():
		busy = false
		return {"error": "Не удалось построить план мира."}
	var before := []
	for blk in blocks:
		var key := "%d,%d,%d" % [blk["x"], blk["y"], blk["z"]]
		before.append({"x": blk["x"], "y": blk["y"], "z": blk["z"], "block_type": _block_type_of.get(key, 0)})
	_apply_batch(blocks)
	undo_stack.append({"before": before, "after": blocks})
	if undo_stack.size() > 24:
		undo_stack.pop_front()
	redo_stack.clear()
	last_intent = intent
	last_block_count = blocks.size()
	busy = false
	return {"intent": intent, "blocks": blocks}

func undo() -> Dictionary:
	if busy or undo_stack.is_empty():
		return {"error": "нечего отменять"}
	var h = undo_stack.pop_back()
	_apply_batch(h["before"])
	redo_stack.append(h)
	return {"intent": last_intent, "blocks": h["before"]}

func redo() -> Dictionary:
	if busy or redo_stack.is_empty():
		return {"error": "нечего вернуть"}
	var h = redo_stack.pop_back()
	_apply_batch(h["after"])
	undo_stack.append(h)
	return {"intent": last_intent, "blocks": h["after"]}

func stats() -> Dictionary:
	return {
		"busy": busy, "undo": undo_stack.size(), "redo": redo_stack.size(),
		"lastType": last_intent.get("type", null), "lastBlocks": last_block_count,
		"placed": _slot_of.size(),
	}

func _apply_batch(blocks: Array) -> void:
	for blk in blocks:
		var key := "%d,%d,%d" % [blk["x"], blk["y"], blk["z"]]
		var existing = _slot_of.get(key, null)
		var block_type: int = blk["block_type"]
		if block_type == 0:
			if existing != null:
				_hide_slot(existing)
				_slot_of.erase(key)
				_block_type_of.erase(key)
				_free.append(existing)
			continue
		var slot = existing
		if slot == null:
			if not _free.is_empty():
				slot = _free.pop_back()
			elif _max_used < CAPACITY:
				slot = _max_used
				_max_used += 1
			else:
				continue # capacity exhausted - cinematic vignette, not a full world
			_slot_of[key] = slot
		_block_type_of[key] = block_type
		_place_slot(slot, blk)
	_mm.visible_instance_count = maxi(_mm.visible_instance_count, _max_used)

func _place_slot(slot: int, blk: Dictionary) -> void:
	var pos := Vector3(blk["x"], blk["y"], blk["z"]) * vox_size
	_mm.set_instance_transform(slot, Transform3D(Basis(), pos))
	_mm.set_instance_color(slot, _color_for_block(blk["block_type"]))

func _hide_slot(slot: int) -> void:
	_mm.set_instance_transform(slot, Transform3D(Basis().scaled(Vector3.ZERO), Vector3.ZERO))

func _color_for_block(t: int) -> Color:
	match t:
		3, 12: return _rock_dark      # STONE, COAL
		2, 5, 10, 11: return _rock_mid # DIRT, WOOD, BRICK, PLANK
		13, 4, 1: return _rock_lit     # IRON, SAND, GRASS
		6: return _leaf_color
		7: return _snow_color
		9: return _ember_color
		8: return _water_color
		_: return _rock_mid
