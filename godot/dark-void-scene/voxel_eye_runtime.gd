extends Node3D
## The eye - a free-floating voxel ball. It used to carry the mountain wall
## as its own child; the wall is now mountain_wall.gd, a separate STATIC
## world object, so this node can travel independently while the mountain
## stays fixed in place (explicit user direction).

const VOX := 0.34

## The eye is a true 3D ball of voxels (a hollow shell sphere), not a flat
## disc painted on the wall - and it's 5x smaller/finer than the wall
## voxels, per explicit user direction (both EYE_VOX/EYE_RADIUS together
## give exactly a 5x size reduction vs. the old flat-disc eye).
const EYE_VOX := VOX / 5.0
const EYE_RADIUS := 17
const EYE_SHAPE_Y := 0.53 # front-marking squash ratio (matches old HALF_H/HALF_W)

var mode: String = "beacon" # user | beacon | idle
var beacon: Node3D = null
var rig: Node3D = null # the camera rig - a CHILD of this node, arrow keys move the eye itself

## Set from the editor/MCP so this scene needs no manual _ready() wiring
## script - resolved once at startup into beacon/rig above.
@export var beacon_path: NodePath
@export var rig_path: NodePath

## The eye IS the player - arrow keys move its own body directly, relative
## to whichever way the (child) camera rig currently faces. The beacon and
## the mountain are both completely separate, static landmarks.
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

func _build() -> void:
	_eye_root = Node3D.new()
	_eye_root.name = "EyeRoot"
	add_child(_eye_root)

	var box := BoxMesh.new()
	box.size = Vector3(EYE_VOX, EYE_VOX, EYE_VOX)

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

	# Inner iris band - darker radial striation toward the pupil, matching
	# the reference's textured (not flat-color) iris close-up.
	var mat_iris_inner := StandardMaterial3D.new()
	mat_iris_inner.albedo_color = Color8(0x7a, 0x4e, 0x14)
	mat_iris_inner.emission_enabled = true
	mat_iris_inner.emission = Color8(0x5a, 0x30, 0x06)
	mat_iris_inner.emission_energy_multiplier = 0.75
	mat_iris_inner.roughness = 0.5

	var mat_pupil := StandardMaterial3D.new()
	mat_pupil.albedo_color = Color8(0x01, 0x01, 0x01)
	mat_pupil.roughness = 0.92

	# Tiny bright catchlight (specular pixel) offset on the pupil/iris edge -
	# a single-voxel highlight is what makes the reference's eye read as a
	# real wet/reflective eye instead of a flat emissive disc.
	var mat_catchlight := StandardMaterial3D.new()
	mat_catchlight.albedo_color = Color8(0xff, 0xff, 0xff)
	mat_catchlight.emission_enabled = true
	mat_catchlight.emission = Color8(0xff, 0xf6, 0xe0)
	mat_catchlight.emission_energy_multiplier = 3.0

	var mat_rim := StandardMaterial3D.new()
	mat_rim.albedo_color = Color8(0x24, 0x22, 0x1f)
	mat_rim.roughness = 0.98
	mat_rim.emission_enabled = true
	mat_rim.emission = Color8(0x2a, 0x24, 0x18)
	mat_rim.emission_energy_multiplier = 0.3

	# A hollow shell sphere - a real "ball of cubes", not a flat painted
	# disc - with the iris/pupil/rim pattern wrapped around its front-facing
	# cap (still visible/correct in silhouette from the side as you orbit).
	var parts := {"white": [], "iris": [], "iris_inner": [], "pupil": [], "rim": [], "catchlight": []}
	var r_out := float(EYE_RADIUS)
	var r_in := r_out - 1.4
	for z in range(-EYE_RADIUS, EYE_RADIUS + 1):
		for y in range(-EYE_RADIUS, EYE_RADIUS + 1):
			for x in range(-EYE_RADIUS, EYE_RADIUS + 1):
				var dist: float = sqrt(float(x * x + y * y + z * z))
				if dist < r_in or dist > r_out:
					continue
				var is_front := z > EYE_RADIUS * 0.05
				if is_front:
					var ex: float = float(x) / r_out
					var ey: float = float(y) / (r_out * EYE_SHAPE_Y)
					var e: float = ex * ex + ey * ey
					if e <= 1.0:
						var edge := e > 0.78
						var ri: float = pow(float(x) / (r_out * 0.34), 2) + pow(float(y) / (r_out * EYE_SHAPE_Y * 0.62), 2)
						if edge:
							parts["rim"].append(Vector3(x, y, z))
						elif ri < 0.20:
							parts["pupil"].append(Vector3(x, y, z))
						elif ri < 0.42:
							parts["iris_inner"].append(Vector3(x, y, z))
						elif ri < 1.0:
							parts["iris"].append(Vector3(x, y, z))
						else:
							parts["white"].append(Vector3(x, y, z))
						continue
				parts["white"].append(Vector3(x, y, z))
	# One catchlight voxel, offset up-right off the pupil, sitting right on
	# the sphere's own surface - matches the bright white specular pixel
	# visible in the reference's eye close-up.
	var cz: float = sqrt(max(0.0, r_out * r_out - 2.0 * 2.0 - 2.0 * 2.0))
	parts["catchlight"].append(Vector3(2, 2, cz))

	var mats := {
		"white": mat_white, "iris": mat_iris, "iris_inner": mat_iris_inner,
		"pupil": mat_pupil, "rim": mat_rim, "catchlight": mat_catchlight
	}
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
			var t := Transform3D(Basis(), p * EYE_VOX)
			mm.set_instance_transform(i, t)
		mmi.multimesh = mm
		mmi.material_override = mats[key]
		mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		_eye_root.add_child(mmi)
		if key == "iris":
			_iris_mesh = mmi
		elif key == "pupil":
			_pupil_mesh = mmi

func cycle_mode() -> String:
	var order := ["user", "beacon", "idle"]
	var idx := order.find(mode)
	mode = order[(idx + 1) % order.size()]
	return mode

func _physics_process(delta: float) -> void:
	# The eye IS the player - it moves directly, relative to whichever way
	# the camera rig (its own child) currently faces. Completely separate
	# from the beacon and the mountain, neither of which ever move.
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
		var max_shift := EYE_VOX * 1.4
		_eye_root.position = _eye_root.position.lerp(Vector3(gaze.x * max_shift, gaze.y * max_shift, 0), delta * 4.0)

func set_user_gaze(nx: float, ny: float) -> void:
	_gaze_user = Vector2(clamp(nx, -1, 1), clamp(ny, -1, 1))
