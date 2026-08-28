extends Node3D
## Stepped voxel tower the beacon's flame sits on top of - the reference
## image shows the light perched on a built structure, not floating bare.
## Regular/stepped (unlike the organic mountain around the eye) so it reads
## as something built rather than natural rock.

const VOX := 0.32

## Same measured palette as the main mountain (reference pack
## 12_DOMINANT_PALETTE.png) so the altar reads as the same world/material,
## just architectural (stepped/regular) instead of organic.
const ROCK_DARK := Color(0x16 / 255.0, 0x15 / 255.0, 0x19 / 255.0)
const ROCK_LIT := Color(0x7A / 255.0, 0x4C / 255.0, 0x38 / 255.0)

## World-space Y (local to Beacon) where the flame should sit - the tip of
## the candle/pillar rising above the pyramid apex. Read by main.tscn wiring
## to reposition the Flame light/mesh after _build() runs.
var flame_local_y: float = 0.0

func _ready() -> void:
	_build()
	var flame := get_node_or_null("Flame")
	var flame_mesh := get_node_or_null("FlameMesh")
	var flame_glow := get_node_or_null("FlameGlow")
	if flame:
		flame.position.y = flame_local_y
	if flame_mesh:
		flame_mesh.position.y = flame_local_y
	if flame_glow:
		flame_glow.position.y = flame_local_y

func _build() -> void:
	var box := BoxMesh.new()
	box.size = Vector3(VOX, VOX, VOX)

	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(1, 1, 1)
	mat.roughness = 0.8
	mat.emission_enabled = true
	mat.emission = ROCK_DARK
	mat.emission_energy_multiplier = 0.03
	mat.vertex_color_use_as_albedo = true

	var cells: Array = []
	var levels := 14
	for lvl in range(levels):
		var half_w: float = max(0.5, 5.0 - float(lvl) * 0.34)
		var y: float = -7.5 + float(lvl) * 0.55
		var iw := int(round(half_w))
		for x in range(-iw, iw + 1):
			for z in range(-iw, iw + 1):
				if abs(x) == iw or abs(z) == iw or lvl == 0:
					cells.append(Vector3(x, y, z))

	# Thin candle/pillar rising above the pyramid apex - the reference shows
	# the flame perched on a slender column, not flush on the stepped mass.
	var apex_y: float = -7.5 + float(levels - 1) * 0.55
	var pillar_levels := 9
	for lvl in range(pillar_levels):
		var y: float = apex_y + 1.0 + float(lvl) * 1.0
		cells.append(Vector3(0, y, 0))
		cells.append(Vector3(1, y, 0))
		cells.append(Vector3(-1, y, 0))
		cells.append(Vector3(0, y, 1))
		cells.append(Vector3(0, y, -1))
	flame_local_y = (apex_y + 1.0 + float(pillar_levels)) * VOX

	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.mesh = box
	mm.instance_count = max(1, cells.size())
	for i in range(cells.size()):
		var p: Vector3 = cells[i]
		mm.set_instance_transform(i, Transform3D(Basis(), p * VOX))
		var lit_t: float = clamp(1.0 - abs(p.x) - abs(p.z), 0.0, 1.0) * 0.14
		mm.set_instance_color(i, ROCK_DARK.lerp(ROCK_LIT, lit_t))

	var mmi := MultiMeshInstance3D.new()
	mmi.name = "TowerVoxels"
	mmi.multimesh = mm
	mmi.material_override = mat
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(mmi)
