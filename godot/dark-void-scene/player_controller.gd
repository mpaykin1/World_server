extends Node3D
## Camera rig - a CHILD of the Eye node (not a separate free-flying body).
## Mouse rotates THIS rig in place, so looking around always orbits the
## eye with zero lag (rig moves rigidly with its parent). Eye itself owns
## all translation (arrow keys); this script only ever rotates.

@export var mouse_sensitivity: float = 0.0028
@export var pitch_limit_deg: float = 75.0

var head: Node3D
var camera: Camera3D
var _pitch: float = 0.0

func _ready() -> void:
	head = Node3D.new()
	head.name = "Head"
	add_child(head)

	camera = Camera3D.new()
	camera.name = "Camera3D"
	camera.current = true
	camera.fov = 58.0
	camera.near = 0.05
	camera.far = 300.0
	head.add_child(camera)

	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		rotation.y -= event.relative.x * mouse_sensitivity
		_pitch = clamp(_pitch - event.relative.y * mouse_sensitivity, deg_to_rad(-pitch_limit_deg), deg_to_rad(pitch_limit_deg))
		head.rotation.x = _pitch
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED else Input.MOUSE_MODE_CAPTURED
