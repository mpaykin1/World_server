@tool
extends RefCounted
class_name CinematicVoxelExportGate

const HARD_FLOOR := 90.0

static func audit_scene(root: Node) -> Dictionary:
	if root == null:
		return {"pass": false, "score": 0.0, "failures": ["scene_missing"]}
	var stats := {
		"mesh_nodes": 0, "lights": 0, "fog": 0, "ui": 0,
		"lod_nodes": 0, "voxel_markers": 0, "hero_markers": 0
	}
	for n in _walk(root):
		if n is MeshInstance3D: stats.mesh_nodes += 1
		# A single MultiMeshInstance3D with many instances (a voxel wall, an
		# eye, a tower...) is procedural density, not sparseness - it would
		# otherwise always fail geometry_too_sparse regardless of how
		# detailed the scene actually is.
		if n is MultiMeshInstance3D:
			var count := 1
			if n.multimesh != null: count = maxi(1, n.multimesh.instance_count)
			stats.mesh_nodes += clampi(int(count / 20.0), 1, 12)
		if n is Light3D: stats.lights += 1
		if n is FogVolume: stats.fog += 1
		# Most scenes use WorldEnvironment fog rather than a dedicated
		# FogVolume node - both are legitimate atmosphere, recognize either.
		if n is WorldEnvironment and n.environment != null and n.environment.fog_enabled:
			stats.fog += 1
		if n is Control and n.visible: stats.ui += 1
		# LODGroup3D isn't a real Godot class (native LOD lives on
		# GeometryInstance3D via visibility_range_*) - string-compare
		# get_class() instead of `is` so a missing/renamed class never
		# breaks parsing of this whole gate script.
		if n.get_class() == "LODGroup3D":
			stats.lod_nodes += 1
		elif n is GeometryInstance3D and n.visibility_range_end > 0.0:
			stats.lod_nodes += 1
		if n.is_in_group("voxel") or n.has_meta("voxel_art"): stats.voxel_markers += 1
		if n.is_in_group("cinematic_hero"): stats.hero_markers += 1
	var failures: Array[String] = []
	if stats.mesh_nodes < 24: failures.append("geometry_too_sparse")
	if stats.lights < 2: failures.append("lighting_too_simple")
	if stats.fog < 1: failures.append("atmosphere_missing")
	if stats.lod_nodes < 1: failures.append("lod_missing")
	if stats.voxel_markers < 1: failures.append("voxel_contract_missing")
	var score := 100.0
	score -= failures.size() * 18.0
	return {"pass": failures.is_empty() and score >= HARD_FLOOR, "score": max(score,0.0), "failures": failures, "stats": stats}

static func _walk(root: Node) -> Array[Node]:
	var out: Array[Node] = []
	var stack: Array[Node] = [root]
	while not stack.is_empty():
		var n := stack.pop_back()
		out.append(n)
		for c in n.get_children(): stack.append(c)
	return out
