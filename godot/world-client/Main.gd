extends Node3D
## World_server native client - main scene. Generates a small grid of
## terrain columns using the exact same World Spec (seed + formulas) as
## the web voxel-world client (see WorldGen.gd), renders them as colored
## boxes via MultiMeshInstance3D, and points a camera at the result.
##
## Smoke-test mode: run headless with `--smoke-test [seed]` and this prints
## a single JSON line of world stats (sample heights/biomes) to stdout and
## quits with exit code 0 - scripts/godot-native-build.js parses this to
## verify the exported build actually ran the real generation code, not
## just that the binary launched.

const WORLD_SEED_DEFAULT := 73194217
const GRID_RADIUS := 12
## Must stay byte-identical to scripts/compare-worldgen.js's own
## SAMPLE_POINTS constant - both sides compute this list independently,
## so a mismatch here silently narrows the regression suite's real
## coverage without either side reporting an error.
const SAMPLE_POINTS := [
	[0, 0], [1, 1], [-1, -1], [10, 10], [-10, 5], [5, -10], [-10, -10],
	[50, -30], [-50, 30], [100, 100], [-100, -100], [100, -100], [-100, 100],
	[250, 0], [0, 250], [-250, 0], [0, -250], [500, 500], [-500, -500], [777, -333],
]

func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	var smoke_test := args.has("--smoke-test")
	var world_seed := WORLD_SEED_DEFAULT
	for a in args:
		if a.is_valid_int():
			world_seed = a.to_int()

	var stats := _generate_and_render(world_seed)

	if smoke_test:
		print(JSON.stringify(stats))
		get_tree().quit(0)
		return

	_setup_camera_and_light()

func _generate_and_render(world_seed: int) -> Dictionary:
	var multimesh := MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.use_colors = true
	var box := BoxMesh.new()
	box.size = Vector3(1, 1, 1)
	multimesh.mesh = box

	var columns: Array = []
	for gx in range(-GRID_RADIUS, GRID_RADIUS):
		for gz in range(-GRID_RADIUS, GRID_RADIUS):
			var h := WorldGen.height_at(float(gx), float(gz), world_seed)
			var biome := WorldGen.biome_at(float(gx), float(gz), world_seed)
			columns.append({"x": gx, "z": gz, "h": h, "biome": biome})

	multimesh.instance_count = columns.size()
	for i in range(columns.size()):
		var c = columns[i]
		var xf := Transform3D(Basis(), Vector3(c.x, c.h, c.z))
		multimesh.set_instance_transform(i, xf)
		multimesh.set_instance_color(i, WorldGen.surface_color_for_biome(c.biome))

	var mesh_instance := MultiMeshInstance3D.new()
	mesh_instance.multimesh = multimesh
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mesh_instance.material_override = mat
	add_child(mesh_instance)

	var heights: Array = []
	var biomes: Array = []
	for sample in SAMPLE_POINTS:
		heights.append(WorldGen.height_at(float(sample[0]), float(sample[1]), world_seed))
		biomes.append(WorldGen.biome_at(float(sample[0]), float(sample[1]), world_seed))

	return {
		"worldSeed": world_seed,
		"columnCount": columns.size(),
		"samplePoints": SAMPLE_POINTS,
		"sampleHeights": heights,
		"sampleBiomes": biomes,
	}

func _setup_camera_and_light() -> void:
	var cam := Camera3D.new()
	cam.position = Vector3(0, 40, 40)
	cam.look_at(Vector3(0, 16, 0), Vector3.UP)
	add_child(cam)

	var sun := DirectionalLight3D.new()
	sun.light_energy = 1.2
	sun.rotation_degrees = Vector3(-45, 30, 0)
	add_child(sun)

	var env := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color(0.498, 0.737, 0.929)
	environment.fog_enabled = true
	environment.fog_light_color = Color(0.498, 0.737, 0.929)
	env.environment = environment
	add_child(env)
