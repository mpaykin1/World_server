extends Node3D
## Stepped voxel tower the beacon's flame sits on top of - the reference
## image shows the light perched on a built structure, not floating bare.
## Regular/stepped (unlike the organic mountain around the eye) so it reads
## as something built rather than natural rock.

const VOX := 0.32

func _ready() -> void:
	_build()

func _build() -> void:
	var box := BoxMesh.new()
	box.size = Vector3(VOX, VOX, VOX)

	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color8(0x1a, 0x14, 0x0d)
	mat.roughness = 0.86
	mat.emission_enabled = true
	mat.emission = Color8(0x33, 0x1e, 0x0d)
	mat.emission_energy_multiplier = 0.4

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

	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = box
	mm.instance_count = max(1, cells.size())
	for i in range(cells.size()):
		var p: Vector3 = cells[i]
		mm.set_instance_transform(i, Transform3D(Basis(), p * VOX))

	var mmi := MultiMeshInstance3D.new()
	mmi.name = "TowerVoxels"
	mmi.multimesh = mm
	mmi.material_override = mat
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(mmi)
