extends Node3D
## The reference pack's 11_DETAIL_FOREGROUND_VOXELS.png crop shows the
## entire lower frame filled with a dense field of small broken voxel
## rubble - not empty ground between the eye's mountain and the altar.
## This is that ground layer: wide, low, near-black, spanning from near
## the eye's spawn toward the altar.

const VOX := 0.3
const ROCK_DARK := Color(0x16 / 255.0, 0x15 / 255.0, 0x19 / 255.0)
const ROCK_MID := Color(0x3C / 255.0, 0x2A / 255.0, 0x26 / 255.0)

@export var x_range: Vector2 = Vector2(-45, 50)
@export var z_range: Vector2 = Vector2(-30, 22)
@export var base_y: float = -3.0

func _hash2(x: float, y: float) -> float:
	var n := sin(x * 127.1 + y * 311.7) * 43758.5453
	return n - floor(n)

func _fbm1(x: float, y: float, s: float) -> float:
	return sin(x * 0.13 + s) * cos(y * 0.11 - s) * 0.5 + sin(x * 0.31 + y * 0.27 + s * 2.0) * 0.5

func _ready() -> void:
	_build()

func _build() -> void:
	var box := BoxMesh.new()
	box.size = Vector3(VOX * 0.96, VOX * 0.7, VOX * 0.96)

	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(1, 1, 1)
	mat.roughness = 0.9
	mat.emission_enabled = true
	mat.emission = ROCK_DARK
	mat.emission_energy_multiplier = 0.025
	mat.vertex_color_use_as_albedo = true

	var cells: Array = []
	var xi := int(x_range.x)
	var xe := int(x_range.y)
	var zi := int(z_range.x)
	var ze := int(z_range.y)
	var x := xi
	while x <= xe:
		var z := zi
		while z <= ze:
			# Sparse, clustered coverage - not a solid floor slab - so it
			# reads as broken rubble/terrain, not a paved plane. Each kept
			# grid point spawns a tight micro-cluster (not one lone voxel)
			# so the field reads dense like the reference crop without an
			# expensive per-voxel outer loop.
			var cluster: float = _fbm1(float(x), float(z), 2.0)
			if cluster < -0.15:
				z += 1
				continue
			var h: float = base_y + _hash2(float(x), float(z)) * 0.5
			var n_sub: int = 2 + int(_hash2(float(x) + 1.0, float(z) - 1.0) * 3.0)
			for s in range(n_sub):
				var jx: float = (_hash2(float(x) + float(s) * 1.3, float(z)) - 0.5) * 0.7
				var jz: float = (_hash2(float(x), float(z) + float(s) * 1.7) - 0.5) * 0.7
				var jy: float = _hash2(float(x) + float(s) * 2.1, float(z) + float(s)) * 0.3
				cells.append(Vector3(float(x) + jx, h + jy, float(z) + jz))
			z += 1
		x += 1

	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.mesh = box
	mm.instance_count = max(1, cells.size())
	for i in range(cells.size()):
		var p: Vector3 = cells[i]
		var k: float = 0.7 + _hash2(p.x, p.z) * 0.5
		mm.set_instance_transform(i, Transform3D(Basis().scaled(Vector3(k, 0.6 + _hash2(p.z, p.x) * 0.6, k)), p))
		var lit_t: float = clamp(_hash2(p.x * 2.1, p.z * 1.7) * 0.16, 0.0, 1.0)
		mm.set_instance_color(i, ROCK_DARK.lerp(ROCK_MID, lit_t))

	var mmi := MultiMeshInstance3D.new()
	mmi.name = "ValleyVoxels"
	mmi.multimesh = mm
	mmi.material_override = mat
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(mmi)
