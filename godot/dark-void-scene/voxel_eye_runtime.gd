extends Node3D
## Ported 1:1 (voxel size, ellipse shape, per-part colors) from the working
## browser implementation at shared/voxel-eye-runtime.mjs so the Godot scene
## matches the same established design instead of guessing from scratch.
## Builds the eye with MultiMeshInstance3D (Godot's InstancedMesh equivalent)
## since thousands of individual MeshInstance3D nodes would be impractical.

const VOX := 0.34
const HALF_W := 17
const HALF_H := 9

var mode: String = "camera" # camera | user | beacon | idle
var beacon: Node3D = null
var target_cam: Camera3D = null

var _blink: float = 0.0
var _next_blink: float = 0.0
var _rng := RandomNumberGenerator.new()
var _gaze_user := Vector2.ZERO
var _iris_mesh: MultiMeshInstance3D
var _pupil_mesh: MultiMeshInstance3D
var _eye_root: Node3D

func _ready() -> void:
	_rng.randomize()
	_next_blink = Time.get_ticks_msec() / 1000.0 + randf_range(2.6, 5.2)
	_build()
	set_process(true)

func _hash2(x: float, y: float) -> float:
	var n := sin(x * 127.1 + y * 311.7) * 43758.5453
	return n - floor(n)

func _build() -> void:
	_eye_root = Node3D.new()
	_eye_root.name = "EyeRoot"
	add_child(_eye_root)

	var box := BoxMesh.new()
	box.size = Vector3(VOX, VOX, VOX)

	var mat_dark := StandardMaterial3D.new()
	mat_dark.albedo_color = Color8(0x0e, 0x11, 0x18)
	mat_dark.roughness = 1.0
	mat_dark.emission_enabled = true
	mat_dark.emission = Color8(0x0a, 0x0e, 0x1c)
	mat_dark.emission_energy_multiplier = 0.4

	var mat_white := StandardMaterial3D.new()
	mat_white.albedo_color = Color8(0xd1, 0xce, 0xc0)
	mat_white.roughness = 0.68
	mat_white.emission_enabled = true
	mat_white.emission = Color8(0xc8, 0xd4, 0xe8)
	mat_white.emission_energy_multiplier = 0.55

	var mat_iris := StandardMaterial3D.new()
	mat_iris.albedo_color = Color8(0x9a, 0x6a, 0x24)
	mat_iris.emission_enabled = true
	mat_iris.emission = Color8(0x41, 0x26, 0x09)
	mat_iris.emission_energy_multiplier = 0.62
	mat_iris.roughness = 0.5

	var mat_pupil := StandardMaterial3D.new()
	mat_pupil.albedo_color = Color8(0x01, 0x01, 0x01)
	mat_pupil.roughness = 0.92

	var mat_rim := StandardMaterial3D.new()
	mat_rim.albedo_color = Color8(0x24, 0x22, 0x1f)
	mat_rim.roughness = 0.98
	mat_rim.emission_enabled = true
	mat_rim.emission = Color8(0x2a, 0x24, 0x18)
	mat_rim.emission_energy_multiplier = 0.3

	var parts := {"white": [], "iris": [], "pupil": [], "rim": []}
	for y in range(-HALF_H, HALF_H + 1):
		for x in range(-HALF_W, HALF_W + 1):
			var e: float = pow(float(x) / HALF_W, 2) + pow(float(y) / HALF_H, 2)
			if e > 1.0:
				continue
			var edge := e > 0.78
			var ri: float = pow(float(x) / (HALF_W * 0.34), 2) + pow(float(y) / (HALF_H * 0.62), 2)
			if edge:
				parts["rim"].append(Vector3(x, y, 0.0))
			elif ri < 0.20:
				parts["pupil"].append(Vector3(x, y, 0.8))
			elif ri < 1.0:
				parts["iris"].append(Vector3(x, y, 0.5))
			else:
				parts["white"].append(Vector3(x, y, 0.15))

	var mats := {"white": mat_white, "iris": mat_iris, "pupil": mat_pupil, "rim": mat_rim}
	for key in parts.keys():
		var cells: Array = parts[key]
		var mmi := MultiMeshInstance3D.new()
		mmi.name = "Eye_%s" % key
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.mesh = box
		mm.instance_count = max(1, cells.size())
		for i in range(cells.size()):
			var p: Vector3 = cells[i]
			var t := Transform3D(Basis(), Vector3(p.x * VOX, p.y * VOX, p.z))
			mm.set_instance_transform(i, t)
		mmi.multimesh = mm
		mmi.material_override = mats[key]
		mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		_eye_root.add_child(mmi)
		if key == "iris":
			_iris_mesh = mmi
		elif key == "pupil":
			_pupil_mesh = mmi

	# Dark voxel wall the eye sits embedded in - matches the reference image's
	# pyramid-like dark mass with the eye reading clearly against it.
	var wall_cells: Array = []
	for y in range(-15, 16):
		for x in range(-29, 30):
			var e: float = pow(float(x) / 19.0, 2) + pow(float(y) / 10.5, 2)
			if e < 1.10:
				continue
			if e > 2.55 and _hash2(x, y) > 0.45:
				continue
			if _hash2(x + 9, y - 5) > 0.86:
				continue
			wall_cells.append(Vector3(x, y, -0.35 - _hash2(x, y) * 1.25))

	var wall_box := BoxMesh.new()
	wall_box.size = Vector3(VOX * 0.98, VOX * 0.98, VOX * 0.98)
	var wall_mmi := MultiMeshInstance3D.new()
	wall_mmi.name = "EyeWall"
	var wall_mm := MultiMesh.new()
	wall_mm.transform_format = MultiMesh.TRANSFORM_3D
	wall_mm.mesh = wall_box
	wall_mm.instance_count = max(1, wall_cells.size())
	for i in range(wall_cells.size()):
		var p: Vector3 = wall_cells[i]
		var k: float = 0.78 + _hash2(p.x, p.y) * 0.42
		var kz: float = 0.8 + _hash2(p.y, p.x) * 0.9
		var basis := Basis().scaled(Vector3(k, k, kz))
		wall_mm.set_instance_transform(i, Transform3D(basis, Vector3(p.x * VOX, p.y * VOX, p.z)))
	wall_mmi.multimesh = wall_mm
	wall_mmi.material_override = mat_dark
	wall_mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(wall_mmi)

func cycle_mode() -> String:
	var order := ["camera", "user", "beacon", "idle"]
	var idx := order.find(mode)
	mode = order[(idx + 1) % order.size()]
	return mode

func _process(delta: float) -> void:
	var t := Time.get_ticks_msec() / 1000.0
	# Auto-blink: squash the iris/pupil vertically for a few frames.
	if t > _next_blink:
		_blink = 1.0
		_next_blink = t + randf_range(2.6, 5.2)
	if _blink > 0.0:
		_blink = max(0.0, _blink - delta * 6.0)
		var s: float = 1.0 - _blink
		if _iris_mesh:
			_iris_mesh.scale = Vector3(1.0, max(0.05, s), 1.0)
		if _pupil_mesh:
			_pupil_mesh.scale = Vector3(1.0, max(0.05, s), 1.0)
	else:
		if _iris_mesh:
			_iris_mesh.scale = Vector3.ONE
		if _pupil_mesh:
			_pupil_mesh.scale = Vector3.ONE

	# Micro-gaze toward the active target depending on mode.
	var gaze := Vector2.ZERO
	match mode:
		"user":
			gaze = _gaze_user
		"camera":
			if target_cam:
				gaze = Vector2(0, 0)
		"beacon":
			if beacon:
				var to_beacon: Vector3 = (beacon.global_transform.origin - global_transform.origin).normalized()
				gaze = Vector2(to_beacon.x, to_beacon.y) * 0.4
	if _eye_root:
		var max_shift := VOX * 1.4
		_eye_root.position = _eye_root.position.lerp(Vector3(gaze.x * max_shift, gaze.y * max_shift, 0), delta * 4.0)

func set_user_gaze(nx: float, ny: float) -> void:
	_gaze_user = Vector2(clamp(nx, -1, 1), clamp(ny, -1, 1))
