extends Node3D
## PROVEN true-orbit camera rig - copy into a new project as-is (rename the
## class/file if you like, keep the structure). See README.md in this
## template directory for why this exact shape matters.
##
## Usage: make this script's node a CHILD of the tracked subject (the
## hero), with this node's own `position` left at (0,0,0) - do NOT set a
## position on this node in the scene file. The back/up camera offset is
## built internally below; duplicating it on this node's own transform is
## the #1 way this pattern breaks (orbit center drifts off the subject).

@export var mouse_sensitivity: float = 0.0028
@export var pitch_limit_deg: float = 75.0
@export var distance: float = 13.0
@export var height: float = 1.4

var pivot: Node3D
var camera: Camera3D

func _ready() -> void:
	pivot = Node3D.new()
	pivot.name = "Pivot"
	add_child(pivot)

	camera = Camera3D.new()
	camera.name = "Camera3D"
	camera.current = true
	camera.fov = 58.0
	camera.near = 0.05
	camera.far = 300.0
	camera.position = Vector3(0, height, distance)
	# Tilt down just enough to look back at the rig's own origin (the
	# tracked subject), computed instead of look_at() so it's correct
	# before any transform in the tree has actually settled.
	camera.rotation.x = -atan2(height, distance)
	pivot.add_child(camera)

	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	get_window().grab_focus()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		rotation.y -= event.relative.x * mouse_sensitivity
		var p: float = clamp(pivot.rotation.x - event.relative.y * mouse_sensitivity, deg_to_rad(-pitch_limit_deg), deg_to_rad(pitch_limit_deg))
		pivot.rotation.x = p
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED else Input.MOUSE_MODE_CAPTURED
	if event is InputEventMouseButton and event.pressed:
		# A stray click can steal OS keyboard focus onto some other panel;
		# clicking anywhere in the game view should always bring it back,
		# so movement keys keep working.
		get_window().grab_focus()
		if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

## Call this from the tracked subject's own _physics_process to get a
## camera-relative forward/right pair for movement, e.g.:
##   var basis := rig.get_forward_right()
##   global_position += (basis[0]*input.y + basis[1]*input.x) * speed * delta
func get_forward_right() -> Array:
	var b: Basis = global_transform.basis
	var forward: Vector3 = -b.z
	forward.y = 0.0
	forward = forward.normalized()
	var right: Vector3 = b.x
	right.y = 0.0
	right = right.normalized()
	return [forward, right]
