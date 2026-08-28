extends Node3D
## True orbit camera rig - a CHILD of the Eye node, sitting at the eye's own
## origin. Mouse motion swings the CAMERA in an arc around that origin
## (yaw on this node, pitch on the Pivot child), so the eye always stays
## centered on screen and the WORLD (mountain, sky, beacon) visibly sweeps
## around it - not the other way around. Arrow-key movement lives on the
## Eye itself (voxel_eye_runtime.gd), relative to this rig's current yaw.

@export var mouse_sensitivity: float = 0.0028
@export var pitch_limit_deg: float = 75.0
@export var distance: float = 13.0
@export var height: float = 1.2

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
	# Tilt down just enough to look back at the rig's own origin (the eye),
	# computed instead of look_at() so it's correct before any transform
	# in the tree has actually settled.
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
		# so arrow keys keep working.
		get_window().grab_focus()
		if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
