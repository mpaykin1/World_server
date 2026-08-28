extends Node3D
## A smaller, simpler rock silhouette placed at a fixed world position
## between the eye's home mountain and the beacon - a genuine midground
## depth band (foreground mountain / midground ridge / far beacon+tower /
## sky), not just two objects floating in empty fog.

const VOX := 0.3
@export var half_width: float = 16.0
@export var peak_height: float = 7.0
@export var seed_offset: float = 0.0

func _hash2(x: float, y: float) -> float:
	var n := sin(x * 127.1 + y * 311.7) * 43758.5453
	return n - floor(n)

func _fbm1(x: float, s: float) -> float:
	var v := 0.0
	var amp := 1.0
	var freq := 1.0
	for i in range(3):
		v += sin(x * freq + s * (float(i) + 1.0) * 2.7) * amp
		freq *= 2.2
		amp *= 0.5
	return v

func _ready() -> void:
	_build()

func _build() -> void:
	var box := BoxMesh.new()
	box.size = Vector3(VOX * 0.98, VOX * 0.98, VOX * 0.98)

	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color8(0x09, 0x08, 0x06)
	mat.roughness = 0.86
	mat.emission_enabled = true
	mat.emission = Color8(0x10, 0x0a, 0x05)
	mat.emission_energy_multiplier = 0.04
	mat.vertex_color_use_as_albedo = true

	var cells: Array = []
	var iw := int(half_width)
	for x in range(-iw, iw + 1):
		var peak: float = peak_height * exp(-pow(float(x) / (half_width * 0.5), 2.0))
		var top: float = 2.0 + peak + _fbm1(float(x) * 0.09 + seed_offset, 4.4 + seed_offset) * (peak_height * 0.35)
		var y := -8
		while y <= int(ceil(top)):
			var dist_from_top: float = top - float(y)
			if dist_from_top < 1.4 and _hash2(float(x) * 1.9 + seed_offset, float(y) * 2.7) > 0.5:
				y += 1
				continue
			var depth: int = 1 + int(round(clamp(1.0 - dist_from_top / 8.0, 0.1, 1.0) * 2.0))
			for d in range(depth):
				cells.append(Vector3(float(x), float(y), -0.2 - float(d) * VOX - _hash2(float(x), float(y) + float(d)) * 0.1))
			y += 1

	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.mesh = box
	mm.instance_count = max(1, cells.size())
	for i in range(cells.size()):
		var p: Vector3 = cells[i]
		var k: float = 0.82 + _hash2(p.x, p.y) * 0.3
		mm.set_instance_transform(i, Transform3D(Basis().scaled(Vector3(k, k, 0.9)), Vector3(p.x * VOX, p.y * VOX, p.z)))
		var shade: float = 0.28 + _hash2(p.x * 3.3, p.y * 1.7) * 0.3
		mm.set_instance_color(i, Color(shade, shade * 0.95, shade * 0.88, 1.0))

	var mmi := MultiMeshInstance3D.new()
	mmi.name = "MidgroundVoxels"
	mmi.multimesh = mm
	mmi.material_override = mat
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(mmi)
