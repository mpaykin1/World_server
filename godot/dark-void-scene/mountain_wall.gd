extends Node3D
## The mountain the eye sits near - a completely separate, STATIC world
## object per explicit user direction: the eye-ball must be free to move
## away while the wall stays fixed in place, instead of the wall being
## carried along as the eye's own child (which is how it worked before).

const VOX := 0.34

## Same measured palette as everything else in the scene
## (12_DOMINANT_PALETTE.png from the reference pack).
const ROCK_DARK := Color(0x16 / 255.0, 0x15 / 255.0, 0x19 / 255.0)
const ROCK_MID := Color(0x3C / 255.0, 0x2A / 255.0, 0x26 / 255.0)
const ROCK_LIT := Color(0x7A / 255.0, 0x4C / 255.0, 0x38 / 255.0)

func _ready() -> void:
	_build()

func _hash2(x: float, y: float) -> float:
	var n := sin(x * 127.1 + y * 311.7) * 43758.5453
	return n - floor(n)

## Layered sine "fbm" - macro sweep + medium bumps + fine jitter, so the
## mountain reads as a real irregular ridge instead of one clean sine wave.
func _fbm1(x: float, seed: float) -> float:
	var v := 0.0
	var amp := 1.0
	var freq := 1.0
	for i in range(4):
		v += sin(x * freq + seed * (float(i) + 1.0) * 2.7) * amp
		freq *= 2.13
		amp *= 0.52
	return v

func _ridge_height(x: float) -> float:
	# One dominant broad peak (real mountains have an apex, not a repeating
	# wave), with fbm layered on top for natural roughness/jaggedness.
	var peak: float = 16.0 * exp(-pow((x + 3.0) / 20.0, 2.0))
	var macro: float = _fbm1(x * 0.05, 3.1) * 3.6
	var medium: float = _fbm1(x * 0.17, 9.7) * 2.2
	var jag: float = (_hash2(floor(x / 1.5), 11.3) - 0.5) * 2.2
	return 2.5 + peak + macro + medium + jag

func _build() -> void:
	var mat_dark := StandardMaterial3D.new()
	# Needs to read as dark charcoal AGAINST the near-black background, not
	# blend into it - a hero silhouette that disappears in the void is a
	# release-blocking regression (see error-prevention-registry.json:
	# "voxel-hero-silhouette-invisible-against-void").
	mat_dark.albedo_color = Color(1, 1, 1)
	mat_dark.roughness = 0.8
	mat_dark.emission_enabled = true
	mat_dark.emission = ROCK_DARK
	mat_dark.emission_energy_multiplier = 0.03
	mat_dark.vertex_color_use_as_albedo = true

	# Jagged mountain MASS with actual volume (multiple depth layers per
	# surface point, not a painted shell) plus a separate rubble pass for
	# foreground micro-detail. A small hole is left near the origin - this
	# is where the free-floating eye ball starts, embedded-looking at rest.
	var wall_cells: Array = [] # each entry: [x, y, z, depth_index, depth_count]
	for x in range(-33, 34):
		var top: float = _ridge_height(float(x))
		var y := -22
		while y <= int(ceil(top)):
			var e: float = pow(float(x) / 4.2, 2) + pow(float(y) / 4.2, 2)
			if e < 1.10:
				y += 1
				continue
			var dist_from_top: float = top - float(y)
			if dist_from_top < 2.2 and _hash2(x * 1.7, y * 2.3) > 0.5:
				y += 1
				continue
			# Real thickness: 2-6 voxel layers deep, denser lower on the
			# mountain (base reads as solid rock) and thinner near ridgelines
			# (peaks read as thin jagged crests) - gives actual rock volume
			# instead of a flat cutout.
			var depth_bias: float = clamp(1.0 - dist_from_top / 14.0, 0.15, 1.0)
			var depth_count: int = 2 + int(round(depth_bias * 4.0 + _hash2(x * 3.1, y * 0.7) * 2.0))
			for d in range(depth_count):
				var front_z: float = -0.3 - _hash2(x, y) * 0.5
				var z: float = front_z - float(d) * (VOX * 0.92) - _hash2(x + d * 7.0, y - d * 5.0) * 0.12
				wall_cells.append([float(x), float(y), z, d, depth_count])
			y += 1

	# Foreground rubble - small loose voxel debris scattered along the base,
	# pushed slightly toward the camera, for near-camera micro-detail the
	# reference's "micro voxel breakup" calls for.
	for i in range(260):
		var rx: float = _hash2(float(i) * 1.7, 4.1) * 66.0 - 33.0
		var ry: float = -20.0 + _hash2(float(i) * 2.3, 8.8) * 5.0
		var base_top: float = _ridge_height(rx)
		if ry > base_top - 3.0:
			continue
		var e2: float = pow(rx / 4.2, 2) + pow(ry / 4.2, 2)
		if e2 < 1.25:
			continue
		wall_cells.append([rx + _hash2(float(i), 1.1) * 0.8, ry, 0.15 + _hash2(float(i), 5.5) * 0.6, -1, 1])

	var wall_box := BoxMesh.new()
	wall_box.size = Vector3(VOX * 0.98, VOX * 0.98, VOX * 0.98)
	var wall_mmi := MultiMeshInstance3D.new()
	wall_mmi.name = "MountainVoxels"
	var wall_mm := MultiMesh.new()
	wall_mm.transform_format = MultiMesh.TRANSFORM_3D
	wall_mm.use_colors = true
	wall_mm.mesh = wall_box
	wall_mm.instance_count = max(1, wall_cells.size())
	for i in range(wall_cells.size()):
		var c: Array = wall_cells[i]
		var px: float = c[0]
		var py: float = c[1]
		var pz: float = c[2]
		var d: int = c[3]
		var depth_count: int = c[4]
		var k: float = 0.8 + _hash2(px, py) * 0.36
		var kz: float = 0.82 + _hash2(py, px) * 0.7
		var basis := Basis().scaled(Vector3(k, k, kz))
		wall_mm.set_instance_transform(i, Transform3D(basis, Vector3(px * VOX, py * VOX, pz)))
		# Real palette hue-shift, not a grayscale brightness multiply: deep/
		# buried voxels stay near ROCK_DARK, surface voxels catching light
		# lerp toward ROCK_LIT per the reference's measured dark-to-warm
		# gradient. Kept mostly dark (pow curve) so only true edges pop,
		# matching the reference's near-black massing.
		var depth_t: float = 0.0 if depth_count <= 1 else float(d) / float(max(1, depth_count - 1))
		var lit_t: float = clamp((1.0 - depth_t) + (_hash2(px * 5.1, py * 2.3) - 0.5) * 0.35, 0.0, 1.0)
		lit_t = pow(lit_t, 4.5)
		var col: Color = ROCK_DARK.lerp(ROCK_MID, clamp(lit_t * 1.3, 0.0, 0.16))
		col = col.lerp(ROCK_LIT, clamp((lit_t - 0.9) * 5.0, 0.0, 0.14))
		wall_mm.set_instance_color(i, col)
	wall_mmi.multimesh = wall_mm
	wall_mmi.material_override = mat_dark
	wall_mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(wall_mmi)
