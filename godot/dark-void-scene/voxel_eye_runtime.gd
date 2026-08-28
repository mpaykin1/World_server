extends Node3D
## Ported 1:1 (voxel size, ellipse shape, per-part colors) from the working
## browser implementation at shared/voxel-eye-runtime.mjs so the Godot scene
## matches the same established design instead of guessing from scratch.
## Builds the eye with MultiMeshInstance3D (Godot's InstancedMesh equivalent)
## since thousands of individual MeshInstance3D nodes would be impractical.

const VOX := 0.34
const HALF_W := 17
const HALF_H := 9

var mode: String = "beacon" # camera | user | beacon | idle
var beacon: Node3D = null
var rig: Node3D = null # the camera rig - a CHILD of this node, arrow keys move the eye itself

## Set from the editor/MCP so this scene needs no manual _ready() wiring
## script - resolved once at startup into beacon/rig above.
@export var beacon_path: NodePath
@export var rig_path: NodePath

## The eye IS the player - arrow keys move its own body directly, relative
## to whichever way the (child) camera rig currently faces. The beacon is a
## completely separate, static landmark elsewhere in the world.
@export var move_speed: float = 5.5

var _blink: float = 0.0
var _next_blink: float = 0.0
var _rng := RandomNumberGenerator.new()
var _gaze_user := Vector2.ZERO
var _iris_mesh: MultiMeshInstance3D
var _pupil_mesh: MultiMeshInstance3D
var _eye_root: Node3D

func _ready() -> void:
	if beacon_path != NodePath(""):
		beacon = get_node_or_null(beacon_path)
	if rig_path != NodePath(""):
		rig = get_node_or_null(rig_path)
	_rng.randomize()
	_next_blink = Time.get_ticks_msec() / 1000.0 + randf_range(2.6, 5.2)
	_build()
	set_process(true)

func _hash2(x: float, y: float) -> float:
	var n := sin(x * 127.1 + y * 311.7) * 43758.5453
	return n - floor(n)

func _ridge_height(x: float) -> float:
	var n1 := sin(x * 0.10 + 1.1)
	var n2 := sin(x * 0.27 - 2.0)
	var n3 := sin(x * 0.045 + 0.5)
	var jag: float = (_hash2(floor(x / 2.0), 11.3) - 0.5) * 3.0
	return 9.0 + n1 * 5.0 + n2 * 2.2 + n3 * 6.0 + jag

func _build() -> void:
	_eye_root = Node3D.new()
	_eye_root.name = "EyeRoot"
	add_child(_eye_root)

	var box := BoxMesh.new()
	box.size = Vector3(VOX, VOX, VOX)

	var mat_dark := StandardMaterial3D.new()
	# Needs to read as dark charcoal AGAINST the near-black background, not
	# blend into it - a hero silhouette that disappears in the void is a
	# release-blocking regression (see error-prevention-registry.json:
	# "voxel-hero-silhouette-invisible-against-void").
	mat_dark.albedo_color = Color8(0x1e, 0x19, 0x13)
	mat_dark.roughness = 0.86
	mat_dark.emission_enabled = true
	mat_dark.emission = Color8(0x33, 0x20, 0x0e)
	mat_dark.emission_energy_multiplier = 0.42

	var mat_white := StandardMaterial3D.new()
	mat_white.albedo_color = Color8(0xd8, 0xd2, 0xc2)
	mat_white.roughness = 0.68
	mat_white.emission_enabled = true
	mat_white.emission = Color8(0xd8, 0xcc, 0xb0)
	mat_white.emission_energy_multiplier = 0.5

	var mat_iris := StandardMaterial3D.new()
	mat_iris.albedo_color = Color8(0xb8, 0x7a, 0x1e)
	mat_iris.emission_enabled = true
	mat_iris.emission = Color8(0x8a, 0x4e, 0x0a)
	mat_iris.emission_energy_multiplier = 0.95
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

	# Jagged mountain silhouette the eye sits embedded in - a real ridge
	# profile (not scattered ellipse noise) so it actually reads as a
	# mountain mass against the sky, matching the reference image.
	var wall_cells: Array = []
	for x in range(-33, 34):
		var top: float = _ridge_height(float(x))
		var y := -22
		while y <= int(ceil(top)):
			var e: float = pow(float(x) / 19.0, 2) + pow(float(y) / 10.5, 2)
			if e < 1.10:
				y += 1
				continue
			var dist_from_top: float = top - float(y)
			if dist_from_top < 2.2 and _hash2(x * 1.7, y * 2.3) > 0.5:
				y += 1
				continue
			wall_cells.append(Vector3(x, y, -0.35 - _hash2(x, y) * 1.6))
			y += 1

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

func _physics_process(delta: float) -> void:
	# The eye IS the player - it moves directly, relative to whichever way
	# the camera rig (its own child) currently faces. Completely separate
	# from the beacon, which never moves at all.
	if not rig:
		return
	var input_dir := Vector2.ZERO
	if Input.is_action_pressed("ui_up"):
		input_dir.y += 1.0
	if Input.is_action_pressed("ui_down"):
		input_dir.y -= 1.0
	if Input.is_action_pressed("ui_left"):
		input_dir.x -= 1.0
	if Input.is_action_pressed("ui_right"):
		input_dir.x += 1.0
	input_dir = input_dir.normalized()

	var rig_basis: Basis = rig.global_transform.basis
	var forward: Vector3 = -rig_basis.z
	forward.y = 0.0
	forward = forward.normalized()
	var right: Vector3 = rig_basis.x
	right.y = 0.0
	right = right.normalized()

	var wish: Vector3 = forward * input_dir.y + right * input_dir.x
	global_position += wish * move_speed * delta

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
		"beacon":
			if beacon:
				var to_beacon: Vector3 = (beacon.global_transform.origin - global_transform.origin).normalized()
				gaze = Vector2(to_beacon.x, to_beacon.y) * 0.4
	if _eye_root:
		var max_shift := VOX * 1.4
		_eye_root.position = _eye_root.position.lerp(Vector3(gaze.x * max_shift, gaze.y * max_shift, 0), delta * 4.0)

func set_user_gaze(nx: float, ny: float) -> void:
	_gaze_user = Vector2(clamp(nx, -1, 1), clamp(ny, -1, 1))
