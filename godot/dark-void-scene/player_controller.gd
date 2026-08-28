extends Node3D
## Free-flight player rig for the dark void: arrow keys move, mouse looks
## around. Standard yaw-on-body / pitch-on-head FPS pattern so mouse-look
## feels normal while movement stays horizontal-plane relative (pressing
## "up" always moves forward on the ground plane, independent of how far
## you're looking up/down - avoids disorienting nose-diving in an open void).

@export var move_speed: float = 6.0
@export var mouse_sensitivity: float = 0.0028
@export var pitch_limit_deg: float = 85.0

var head: Node3D
var camera: Camera3D
var _pitch: float = 0.0

func _ready() -> void:
	head = Node3D.new()
	head.name = "Head"
	head.position = Vector3(0, 1.6, 0)
	add_child(head)

	camera = Camera3D.new()
	camera.name = "Camera3D"
	camera.current = true
	camera.fov = 62.0
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

func _physics_process(delta: float) -> void:
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

	# Horizontal-plane movement relative to yaw only (not head pitch) - a
	# free-flying void still reads as controllable rather than a spaceship.
	var forward := -transform.basis.z
	forward.y = 0.0
	forward = forward.normalized()
	var right := transform.basis.x
	right.y = 0.0
	right = right.normalized()

	var wish := forward * (-input_dir.y) + right * input_dir.x
	global_position += wish * move_speed * delta
