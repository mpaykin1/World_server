extends Node3D
## Incremental, camera-centered terrain streaming using the native WorldGen spec.
## Streams the existing colored voxel surface; never changes terrain formulas.
const Planner = preload("res://ChunkPlanner.gd")
const CHUNK_SIZE := 16

@export_range(1, 8) var render_radius := 2
@export_range(1, 4) var chunks_per_frame := 2

var _seed: int
var _target: Camera3D
var _chunks: Dictionary = {}
var _block_mesh: BoxMesh
var _material: StandardMaterial3D

func _ready() -> void:
	_block_mesh = BoxMesh.new()
	_block_mesh.size = Vector3.ONE
	_material = StandardMaterial3D.new()
	_material.vertex_color_use_as_albedo = true

func configure(seed_value: int, camera: Camera3D) -> void:
	_seed = seed_value
	_target = camera

func loaded_count() -> int:
	return _chunks.size()

func _process(_delta: float) -> void:
	if _target == null:
		return
	var center := Vector2i(
		floori(_target.global_position.x / CHUNK_SIZE),
		floori(_target.global_position.z / CHUNK_SIZE)
	)
	_unload_distant(center)
	var needed := Planner.plan_missing(center, render_radius,
		chunks_per_frame, _chunks)
	for location in needed:
		_chunks[location] = _build_chunk(location)

func _unload_distant(center: Vector2i) -> void:
	for location in _chunks.keys():
		if abs(location.x - center.x) <= render_radius + 1 \
				and abs(location.y - center.y) <= render_radius + 1:
			continue
		var chunk_node: MultiMeshInstance3D = _chunks[location]
		chunk_node.queue_free()
		_chunks.erase(location)

func _build_chunk(location: Vector2i) -> MultiMeshInstance3D:
	var instances := MultiMesh.new()
	instances.transform_format = MultiMesh.TRANSFORM_3D
	instances.use_colors = true
	instances.mesh = _block_mesh
	instances.instance_count = CHUNK_SIZE * CHUNK_SIZE
	var index := 0
	for lz in range(CHUNK_SIZE):
		for lx in range(CHUNK_SIZE):
			var x := location.x * CHUNK_SIZE + lx
			var z := location.y * CHUNK_SIZE + lz
			var height := WorldGen.height_at(float(x), float(z), _seed)
			var biome := WorldGen.biome_at(float(x), float(z), _seed)
			instances.set_instance_transform(index, Transform3D(
				Basis(), Vector3(x, height, z)))
			instances.set_instance_color(index,
				WorldGen.surface_color_for_biome(biome))
			index += 1
	var chunk_node := MultiMeshInstance3D.new()
	chunk_node.multimesh = instances
	chunk_node.material_override = _material
	add_child(chunk_node)
	return chunk_node
