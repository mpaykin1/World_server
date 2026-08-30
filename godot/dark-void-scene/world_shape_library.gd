class_name WorldShapeLibrary
extends RefCounted
## GDScript port of shared/world-shape-library.mjs, function-for-function.
## Same block-id table as the JS Builder's DEFAULT palette so an intent
## parsed by either WorldCommandParser or world-command-parser.mjs
## produces the same shape id vocabulary in both engines.

const BLOCK := {
	"AIR": 0, "GRASS": 1, "DIRT": 2, "STONE": 3, "SAND": 4, "WOOD": 5, "LEAVES": 6,
	"SNOW": 7, "WATER": 8, "GLASS": 9, "BRICK": 10, "PLANK": 11, "COAL": 12, "IRON": 13,
}

class Builder:
	var palette: Dictionary
	var max_blocks: int
	var blocks: Dictionary = {}

	func _init(p: Dictionary, max_b: int) -> void:
		palette = p
		max_blocks = max_b

	func add(x: float, y: float, z: float, t: int) -> void:
		if blocks.size() >= max_blocks:
			return
		var xi := roundi(x)
		var yi := roundi(y)
		var zi := roundi(z)
		blocks["%d,%d,%d" % [xi, yi, zi]] = {"x": xi, "y": yi, "z": zi, "block_type": t}

	func box(x0: int, y0: int, z0: int, x1: int, y1: int, z1: int, t: int, shell: bool = false) -> void:
		for y in range(y0, y1 + 1):
			for z in range(z0, z1 + 1):
				for x in range(x0, x1 + 1):
					if shell and x > x0 and x < x1 and y > y0 and y < y1 and z > z0 and z < z1:
						continue
					add(x, y, z, t)

	func sphere(cx: float, cy: float, cz: float, rx: float, ry: float, rz: float, t: int, shell: bool = false) -> void:
		for y in range(floori(cy - ry), ceili(cy + ry) + 1):
			for z in range(floori(cz - rz), ceili(cz + rz) + 1):
				for x in range(floori(cx - rx), ceili(cx + rx) + 1):
					var q := pow((x - cx) / rx, 2) + pow((y - cy) / ry, 2) + pow((z - cz) / rz, 2)
					if q > 1.0:
						continue
					if shell:
						var ix := pow((x - cx) / maxf(0.1, rx - 1), 2) + pow((y - cy) / maxf(0.1, ry - 1), 2) + pow((z - cz) / maxf(0.1, rz - 1), 2)
						if ix < 1.0:
							continue
					add(x, y, z, t)

	func values() -> Array:
		return blocks.values()


static func _shape_eye(b: Builder, s: float) -> void:
	var w := maxi(8, roundi(14 * s))
	var h := maxi(5, roundi(8 * s))
	var d := maxi(2, roundi(3 * s))
	var front := d
	for y in range(-h, h + 1):
		for x in range(-w, w + 1):
			var e := pow(float(x) / w, 2) + pow(float(y) / h, 2)
			if e > 1.0:
				continue
			var z := roundi(sqrt(maxf(0.0, 1.0 - e)) * d)
			b.add(x, y, z, b.palette["SNOW"])
			if e < 0.22:
				b.add(x, y, front + 1, b.palette["WOOD"])
			if e < 0.075:
				b.add(x, y, front + 2, b.palette["COAL"])
	for x in range(-w - 2, w + 3):
		var yy := roundi((1.0 - pow(float(x) / (w + 2), 2)) * h * 0.72)
		b.add(x, yy + 2, 0, b.palette["STONE"])
		b.add(x, -yy - 2, 0, b.palette["STONE"])

static func _shape_beacon(b: Builder, s: float) -> void:
	var h := maxi(7, roundi(12 * s))
	for y in range(0, h):
		var r := maxi(1, roundi(float(h - y) / 5.0))
		b.box(-r, y, -r, r, y, r, b.palette["STONE"] if y < h * 0.7 else b.palette["BRICK"])
	b.add(0, h, 0, b.palette["WOOD"])
	b.add(0, h + 1, 0, b.palette["GLASS"])
	b.add(0, h + 2, 0, b.palette["GLASS"])

static func _shape_tower(b: Builder, s: float) -> void:
	var h := maxi(9, roundi(18 * s))
	for y in range(0, h):
		var r := maxi(1, roundi(4 * s * (1.0 - float(y) / (h * 1.3))))
		b.box(-r, y, -r, r, y, r, b.palette["STONE"], true)
	for i in range(-1, 2):
		b.add(i, h, 0, b.palette["BRICK"])

static func _shape_tree(b: Builder, s: float, rng: RandomNumberGenerator) -> void:
	var h := maxi(6, roundi((8.0 + rng.randf() * 4.0) * s))
	b.box(0, 0, 0, 0, h, 0, b.palette["WOOD"])
	var rr := maxi(3, roundi(4 * s))
	b.sphere(0, h, 0, rr, maxf(2.0, rr * 0.75), rr, b.palette["LEAVES"], false)

static func _shape_bridge(b: Builder, s: float) -> void:
	var length := maxi(10, roundi(22 * s))
	var w := maxi(2, roundi(3 * s))
	for z in range(0, length):
		for x in range(-w, w + 1):
			b.add(x, roundi(sin(float(z) / length * PI) * 2 * s), z, b.palette["PLANK"])
	var z := 0
	while z < length:
		b.add(-w - 1, 2, z, b.palette["WOOD"])
		b.add(w + 1, 2, z, b.palette["WOOD"])
		z += 3

static func _shape_stairs(b: Builder, s: float) -> void:
	var n := maxi(8, roundi(14 * s))
	var w := maxi(2, roundi(3 * s))
	for z in range(0, n):
		for x in range(-w, w + 1):
			for y in range(0, floori(z / 2.0) + 1):
				b.add(x, y, z, b.palette["STONE"])

static func _shape_house(b: Builder, s: float) -> void:
	var w := maxi(4, roundi(6 * s))
	var d := maxi(4, roundi(6 * s))
	var h := maxi(4, roundi(5 * s))
	b.box(-w, 0, -d, w, h, d, b.palette["BRICK"], true)
	for y in range(0, 3):
		b.add(0, y, -d, b.palette["AIR"])
		b.add(1, y, -d, b.palette["AIR"])
	for y in range(0, w + 1):
		var rw := w - y
		for x in range(-rw, rw + 1):
			for z in range(-d, d + 1):
				if absi(z) == d or z % 2 == 0:
					b.add(x, h + y, z, b.palette["PLANK"])

static func _shape_portal(b: Builder, s: float) -> void:
	var w := maxi(3, roundi(5 * s))
	var h := maxi(6, roundi(9 * s))
	for y in range(0, h + 1):
		for x in range(-w, w + 1):
			var edge := absi(x) >= w - 1 or y <= 1 or y >= h - 1
			if edge:
				b.add(x, y, 0, b.palette["COAL"])
			elif (x + y) % 2 == 0:
				b.add(x, y, 0, b.palette["GLASS"])

static func _shape_wall(b: Builder, s: float) -> void:
	var w := maxi(7, roundi(14 * s))
	var h := maxi(4, roundi(7 * s))
	b.box(-w, 0, 0, w, h, 1, b.palette["STONE"], false)

static func _shape_sphere(b: Builder, s: float) -> void:
	var r := maxi(4, roundi(7 * s))
	b.sphere(0, r, 0, r, r, r, b.palette["IRON"], true)

static func _shape_monolith(b: Builder, s: float) -> void:
	var h := maxi(10, roundi(18 * s))
	b.box(-2, 0, -2, 2, h, 2, b.palette["COAL"], false)
	b.box(-1, h + 1, -1, 1, h + 3, 1, b.palette["GLASS"], false)

static func _shape_wish(b: Builder, s: float, rng: RandomNumberGenerator) -> void:
	var radius := maxi(5, roundi(8 * s))
	var n := maxi(12, roundi(28 * s))
	for i in range(0, n):
		var a := i * 0.78 + rng.randf() * 0.4
		var rad := 2.0 + (float(i) / n) * radius
		var x := roundi(cos(a) * rad)
		var z := roundi(sin(a) * rad)
		var hh := 1 + floori((2.0 + rng.randf() * 8.0) * s)
		for y in range(0, hh):
			b.add(x, y, z, b.palette["GLASS"] if (i + y) % 7 == 0 else b.palette["STONE"])
	var rr := maxi(3, roundi(4 * s))
	b.sphere(0, rr, 0, maxi(2, roundi(3 * s)), maxi(2, roundi(3 * s)), maxi(2, roundi(3 * s)), b.palette["IRON"], true)

static func _transform(rows: Array, origin: Dictionary, yaw: float) -> Array:
	var c := cos(yaw)
	var sn := sin(yaw)
	var out := []
	for q in rows:
		out.append({
			"x": roundi(origin["x"] + q["x"] * c - q["z"] * sn),
			"y": roundi(origin["y"] + q["y"]),
			"z": roundi(origin["z"] + q["x"] * sn + q["z"] * c),
			"block_type": q["block_type"],
		})
	return out

## origin: {"x","y","z"} in grid units. palette: optional override merged
## onto BLOCK (pass {} to just use the defaults). Returns an Array of
## {"x","y","z","block_type"} Dictionaries in grid units, already rotated
## by yaw and translated to origin - ready to feed straight to a
## MultiMesh instance placer.
static func build_world_shape(intent: Dictionary, origin: Dictionary, yaw: float, palette: Dictionary, max_blocks: int) -> Array:
	var full_palette := BLOCK.duplicate()
	for k in palette.keys():
		full_palette[k] = palette[k]
	var b := Builder.new(full_palette, max_blocks)
	var s: float = clampf(float(intent.get("scale", 1.0)), 0.45, 2.0)
	var seed_val: int = int(intent.get("seed", 1))
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_val
	match intent.get("type", "wish-sculpture"):
		"eye": _shape_eye(b, s)
		"beacon": _shape_beacon(b, s)
		"tower": _shape_tower(b, s)
		"tree": _shape_tree(b, s, rng)
		"bridge": _shape_bridge(b, s)
		"stairs": _shape_stairs(b, s)
		"house": _shape_house(b, s)
		"portal": _shape_portal(b, s)
		"wall": _shape_wall(b, s)
		"sphere": _shape_sphere(b, s)
		"monolith": _shape_monolith(b, s)
		_: _shape_wish(b, s, rng)
	return _transform(b.values(), origin, yaw)
