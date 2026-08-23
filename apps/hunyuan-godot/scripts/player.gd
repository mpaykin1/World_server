extends CharacterBody3D

const MAX_PITCH := deg_to_rad(89.5)
const EYE_HEIGHT := 1.62
const BODY_HEIGHT := 1.72
const BODY_RADIUS := 0.34

@export var walk_speed := 4.5
@export var sprint_speed := 7.5
@export var jump_velocity := 5.6
@export var mouse_sensitivity := 0.0022
@export var gravity := 18.0

var head: Node3D
var camera: Camera3D
var respawn_point := Vector3.ZERO
var _jump_queued := false
var _debug_elapsed := 0.0

func _ready() -> void:
    up_direction = Vector3.UP
    floor_snap_length = 0.32
    floor_max_angle = deg_to_rad(52.0)

    head = Node3D.new()
    head.name = "Head"
    head.position = Vector3(0.0, EYE_HEIGHT, 0.0)
    add_child(head)

    camera = Camera3D.new()
    camera.name = "Camera3D"
    camera.current = true
    camera.fov = 72.0
    camera.near = 0.05
    head.add_child(camera)

    var body_shape := CollisionShape3D.new()
    body_shape.name = "BodyCollision"
    var capsule := CapsuleShape3D.new()
    capsule.radius = BODY_RADIUS
    capsule.height = BODY_HEIGHT
    body_shape.shape = capsule
    # Player node origin is the feet. The capsule center is above the origin.
    body_shape.position = Vector3(0.0, BODY_HEIGHT * 0.5, 0.0)
    add_child(body_shape)

    Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func set_spawn(point: Vector3) -> void:
    respawn_point = point
    global_position = point
    velocity = Vector3.ZERO
    rotation = Vector3.ZERO
    if is_instance_valid(head):
        head.rotation = Vector3.ZERO
    apply_floor_snap()

func _unhandled_input(event: InputEvent) -> void:
    if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
        _apply_look_delta(event.relative)
    elif event is InputEventMouseButton and event.pressed:
        Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
    elif event is InputEventKey and event.pressed:
        if event.keycode == KEY_ESCAPE:
            Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
        elif event.keycode == KEY_SPACE and not event.echo:
            _jump_queued = true
            get_viewport().set_input_as_handled()

func _apply_look_delta(delta: Vector2) -> void:
    # HARD INVARIANT: left/right changes yaw around world Y only.
    rotation.y = wrapf(rotation.y - delta.x * mouse_sensitivity, -PI, PI)
    rotation.x = 0.0
    rotation.z = 0.0

    # HARD INVARIANT: up/down changes head pitch around local X only.
    var next_pitch := clamp(head.rotation.x - delta.y * mouse_sensitivity, -MAX_PITCH, MAX_PITCH)
    head.rotation = Vector3(next_pitch, 0.0, 0.0)

func _physics_process(delta: float) -> void:
    var right_axis := 0.0
    var forward_axis := 0.0

    if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
        right_axis -= 1.0
    if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
        right_axis += 1.0
    if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
        forward_axis += 1.0
    if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
        forward_axis -= 1.0

    var input_len := Vector2(right_axis, forward_axis).length()
    if input_len > 1.0:
        right_axis /= input_len
        forward_axis /= input_len

    # Movement is derived from yaw only. Pitch never affects walking or jumping.
    var yaw := rotation.y
    var right := Vector3(cos(yaw), 0.0, -sin(yaw))
    var forward := Vector3(-sin(yaw), 0.0, -cos(yaw))
    var direction := right * right_axis + forward * forward_axis
    var speed := sprint_speed if Input.is_key_pressed(KEY_SHIFT) else walk_speed
    velocity.x = direction.x * speed
    velocity.z = direction.z * speed

    if is_on_floor():
        if velocity.y < 0.0:
            velocity.y = 0.0
        if _jump_queued:
            # HARD INVARIANT: Space changes vertical velocity only.
            velocity.y = jump_velocity
    else:
        velocity.y -= gravity * delta

    _jump_queued = false
    move_and_slide()

    if global_position.y < -24.0:
        set_spawn(respawn_point)

    _debug_elapsed += delta
    if _debug_elapsed >= 0.08:
        _debug_elapsed = 0.0
        _publish_web_debug()

func get_view_forward() -> Vector3:
    return -camera.global_transform.basis.z.normalized()

func debug_apply_look(delta: Vector2) -> void:
    _apply_look_delta(delta)

func debug_set_look(yaw: float, pitch: float) -> void:
    rotation = Vector3(0.0, wrapf(yaw, -PI, PI), 0.0)
    head.rotation = Vector3(clamp(pitch, -MAX_PITCH, MAX_PITCH), 0.0, 0.0)

func debug_trigger_jump() -> void:
    _jump_queued = true

func debug_state() -> Dictionary:
    return {
        "ready": true,
        "x": global_position.x,
        "y": global_position.y,
        "z": global_position.z,
        "vy": velocity.y,
        "yaw": rotation.y,
        "pitch": head.rotation.x,
        "roll": rotation.z + head.rotation.z,
        "grounded": is_on_floor(),
        "max_pitch": MAX_PITCH
    }

func _publish_web_debug() -> void:
    if not OS.has_feature("web"):
        return
    var payload := JSON.stringify(debug_state())
    JavaScriptBridge.eval("window.__hunyuanDebug=" + payload + ";", true)
