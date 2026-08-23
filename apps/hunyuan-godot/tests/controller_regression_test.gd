extends SceneTree

var failures: Array[String] = []

func check(condition: bool, message: String) -> void:
    if not condition:
        failures.append(message)
        push_error("[CONTROL_GUARD] FAIL: " + message)
    else:
        print("[CONTROL_GUARD] PASS: " + message)

func _initialize() -> void:
    call_deferred("_run")

func _run() -> void:
    var packed := load("res://main.tscn") as PackedScene
    check(packed != null, "main scene loads")
    if packed == null:
        quit(1)
        return

    var world := packed.instantiate()
    root.add_child(world)

    for _i in range(120):
        await physics_frame

    var player = world.get_node_or_null("Player")
    check(player != null, "player exists")
    if player == null:
        quit(1)
        return

    var head := player.get_node_or_null("Head") as Node3D
    check(head != null, "head exists above player feet")
    if head == null:
        quit(1)
        return
    check(player.is_on_floor(), "spawn is grounded on floor")
    check(player.global_transform.basis.y.dot(Vector3.UP) > 0.9999, "feet-down/head-up orientation")
    check(abs(player.rotation.x) < 0.00001 and abs(player.rotation.z) < 0.00001, "body has no pitch/roll at spawn")

    var visual := world.get_node_or_null("WorldVisual") as Node3D
    check(visual != null, "visual world exists")
    var world_transform_before := visual.global_transform if visual != null else Transform3D.IDENTITY

    # Look straight up: almost +Y, with no roll.
    player.debug_set_look(0.0, 0.0)
    player.debug_apply_look(Vector2(0.0, -100000.0))
    var up_forward: Vector3 = player.get_view_forward()
    check(up_forward.dot(Vector3.UP) > 0.995, "camera can look almost vertically at sky")
    check(abs(player.rotation.z) < 0.00001 and abs(head.rotation.z) < 0.00001, "look up introduces zero roll")

    # Look straight down: almost -Y.
    player.debug_apply_look(Vector2(0.0, 200000.0))
    var down_forward: Vector3 = player.get_view_forward()
    check(down_forward.dot(Vector3.DOWN) > 0.995, "camera can look almost vertically at feet")

    # Left/right must be yaw around Y only and must never rotate the world.
    player.debug_set_look(0.0, 0.0)
    player.debug_apply_look(Vector2(50000.0, 0.0))
    check(abs(player.rotation.x) < 0.00001 and abs(player.rotation.z) < 0.00001, "left-right changes yaw only")
    check(abs(head.rotation.y) < 0.00001 and abs(head.rotation.z) < 0.00001, "head never rolls during yaw")
    if visual != null:
        check(visual.global_transform.is_equal_approx(world_transform_before), "mouse look never rotates or moves world mesh")

    # Return to grounded state before jump test.
    player.debug_set_look(0.0, 0.0)
    for _i in range(30):
        await physics_frame
    var start: Vector3 = player.global_position
    check(player.is_on_floor(), "grounded before jump")
    player.debug_trigger_jump()
    for _i in range(8):
        await physics_frame
    var airborne: Vector3 = player.global_position
    var horizontal_delta := Vector2(airborne.x - start.x, airborne.z - start.z).length()
    check(airborne.y > start.y + 0.03, "Space moves player upward")
    check(horizontal_delta < 0.015, "Space alone adds no forward/back movement")
    if visual != null:
        check(visual.global_transform.is_equal_approx(world_transform_before), "jump never moves world mesh")

    var landed := false
    for _i in range(300):
        await physics_frame
        if player.is_on_floor() and player.global_position.y <= start.y + 0.10:
            landed = true
            break
    check(landed, "jump returns player to floor")
    var final_horizontal := Vector2(player.global_position.x - start.x, player.global_position.z - start.z).length()
    check(final_horizontal < 0.02, "vertical jump returns to same horizontal position")

    if failures.is_empty():
        print("[CONTROL_GUARD] ALL TESTS PASS")
        quit(0)
    else:
        print("[CONTROL_GUARD] FAILURES=" + str(failures))
        quit(1)
