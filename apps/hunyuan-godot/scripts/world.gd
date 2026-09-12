extends Node3D

# PRODUCTION INVARIANT: server and desktop use the same full-quality visual asset.
const VISUAL_FULL := preload("res://assets/visual_full_quality.glb")
const COLLISION_WORLD := preload("res://assets/collision.glb")
const PLAYER_SCRIPT := preload("res://scripts/player.gd")

# Verified against the supplied collision mesh: this point intersects a street surface
# at approximately Y=-3.801 with an almost perfectly upward normal.
const TARGET_STREET_Y := -3.80
const PREFERRED_SPAWN_XZ := Vector2(-1.50, 10.40)

var world_visual: Node3D
var world_visual_initial_transform := Transform3D.IDENTITY
var player_ref
var _spawn_guard_frames := 120

func _ready() -> void:
    _setup_environment()
    _load_visual_world()
    _load_collision_world()
    _create_hud()

    # create_trimesh_collision() bodies must enter the physics space before spawn rays.
    await get_tree().physics_frame
    await get_tree().physics_frame

    var spawn := _find_walkable_spawn()
    player_ref = PLAYER_SCRIPT.new()
    player_ref.name = "Player"
    add_child(player_ref)
    player_ref.set_spawn(spawn)

    if OS.has_feature("web"):
        JavaScriptBridge.eval("window.__hunyuanStartup=" + JSON.stringify({
            "spawn": [spawn.x, spawn.y, spawn.z],
            "world_locked": world_visual.global_transform.is_equal_approx(world_visual_initial_transform),
            "quality": "FULL_1313748_TRIANGLES"
        }) + ";", true)

func _physics_process(_delta: float) -> void:
    # Input may NEVER transform the city mesh. If another script mutates it, restore immediately.
    if is_instance_valid(world_visual) and not world_visual.global_transform.is_equal_approx(world_visual_initial_transform):
        push_error("[CONTROL_GUARD] WorldVisual transform mutation blocked and restored")
        world_visual.global_transform = world_visual_initial_transform

    if is_instance_valid(player_ref):
        # Absolute upright invariant: body yaw only, head pitch only, roll always zero.
        player_ref.rotation.x = 0.0
        player_ref.rotation.z = 0.0
        var head := player_ref.get_node_or_null("Head") as Node3D
        if head != null:
            head.rotation.y = 0.0
            head.rotation.z = 0.0
            head.rotation.x = clamp(head.rotation.x, -deg_to_rad(89.5), deg_to_rad(89.5))

        # Fail-safe: never leave the player floating if physics import settles slowly in Web export.
        if _spawn_guard_frames > 0:
            _spawn_guard_frames -= 1
            if _spawn_guard_frames == 0 and not player_ref.is_on_floor():
                push_warning("[CONTROL_GUARD] spawn grounding watchdog triggered")
                player_ref.set_spawn(_find_walkable_spawn())

func _setup_environment() -> void:
    var world_environment := WorldEnvironment.new()
    var environment := Environment.new()
    environment.background_mode = Environment.BG_COLOR
    environment.background_color = Color(0.008, 0.012, 0.025)
    environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
    environment.ambient_light_color = Color(0.46, 0.50, 0.62)
    environment.ambient_light_energy = 0.72
    environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
    world_environment.environment = environment
    add_child(world_environment)

    var sun := DirectionalLight3D.new()
    sun.name = "Sun"
    sun.rotation_degrees = Vector3(-48.0, -32.0, 0.0)
    sun.light_energy = 0.55
    sun.shadow_enabled = false
    add_child(sun)

func _load_visual_world() -> void:
    world_visual = VISUAL_FULL.instantiate()
    world_visual.name = "WorldVisual"
    add_child(world_visual)
    world_visual_initial_transform = world_visual.global_transform

    # Preserve reconstruction vertex colors. Normals still contribute subtle lighting,
    # avoiding the flat/muddy V2 look without replacing or simplifying the geometry.
    var material := StandardMaterial3D.new()
    material.vertex_color_use_as_albedo = true
    material.cull_mode = BaseMaterial3D.CULL_DISABLED
    material.roughness = 0.88
    material.metallic = 0.0

    for node in world_visual.find_children("*", "MeshInstance3D", true, false):
        var mesh_instance := node as MeshInstance3D
        mesh_instance.material_override = material
        mesh_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

func _load_collision_world() -> void:
    var collision_root := COLLISION_WORLD.instantiate()
    collision_root.name = "WorldCollision"
    add_child(collision_root)

    for node in collision_root.find_children("*", "MeshInstance3D", true, false):
        var mesh_instance := node as MeshInstance3D
        mesh_instance.create_trimesh_collision()
        mesh_instance.visible = false

func _ray_ground_at(xz: Vector2, from_y: float, to_y: float) -> Dictionary:
    var query := PhysicsRayQueryParameters3D.create(
        Vector3(xz.x, from_y, xz.y),
        Vector3(xz.x, to_y, xz.y)
    )
    query.collide_with_areas = false
    return get_world_3d().direct_space_state.intersect_ray(query)

func _find_walkable_spawn() -> Vector3:
    # Search ONLY the street-level band. Raycasting from the sky could select a roof.
    var candidates: Array[Vector2] = [
        PREFERRED_SPAWN_XZ,
        Vector2(-1.7, 10.1), Vector2(-1.2, 10.7), Vector2(-0.8, 11.5),
        Vector2(0.0, 8.0), Vector2(1.2, 11.3), Vector2(-2.4, 9.5)
    ]
    for x in range(-4, 5, 2):
        for z in range(6, 15, 2):
            candidates.append(Vector2(float(x), float(z)))

    var best := Vector3(PREFERRED_SPAWN_XZ.x, TARGET_STREET_Y + 0.035, PREFERRED_SPAWN_XZ.y)
    var best_score := INF

    for xz in candidates:
        var hit := _ray_ground_at(xz, -1.25, -8.8)
        if hit.is_empty():
            continue
        var normal: Vector3 = hit["normal"]
        if normal.dot(Vector3.UP) < 0.72:
            continue
        var p: Vector3 = hit["position"]
        var score: float = abs(p.y - TARGET_STREET_Y) * 4.0
        score += (1.0 - normal.dot(Vector3.UP)) * 10.0
        score += Vector2(p.x - PREFERRED_SPAWN_XZ.x, p.z - PREFERRED_SPAWN_XZ.y).length() * 0.02
        if score < best_score:
            best_score = score
            best = p + Vector3(0.0, 0.035, 0.0)

    return best

func debug_world_is_locked() -> bool:
    return is_instance_valid(world_visual) and world_visual.global_transform.is_equal_approx(world_visual_initial_transform)

func _create_hud() -> void:
    var layer := CanvasLayer.new()
    layer.name = "HUD"
    add_child(layer)

    var instructions := Label.new()
    instructions.text = "WASD / стрелки — ходить   •   мышь — смотреть   •   Shift — бег   •   Space — прыжок вверх   •   Esc — мышь"
    instructions.position = Vector2(18, 14)
    instructions.add_theme_font_size_override("font_size", 16)
    instructions.add_theme_color_override("font_color", Color(0.96, 0.97, 1.0, 0.96))
    instructions.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.9))
    instructions.add_theme_constant_override("shadow_offset_x", 2)
    instructions.add_theme_constant_override("shadow_offset_y", 2)
    layer.add_child(instructions)

    var quality := Label.new()
    quality.text = "FULL QUALITY • 1,313,748 triangles"
    quality.position = Vector2(18, 40)
    quality.add_theme_font_size_override("font_size", 13)
    quality.add_theme_color_override("font_color", Color(0.75, 0.86, 1.0, 0.9))
    quality.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.9))
    layer.add_child(quality)

    var crosshair := Label.new()
    crosshair.text = "+"
    crosshair.set_anchors_preset(Control.PRESET_CENTER)
    crosshair.position = Vector2(-5, -12)
    crosshair.add_theme_font_size_override("font_size", 22)
    crosshair.add_theme_color_override("font_color", Color(1, 1, 1, 0.78))
    layer.add_child(crosshair)
