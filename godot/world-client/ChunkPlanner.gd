extends RefCounted
class_name WorldChunkPlanner
## Matches World Server browser scheduling; original independent implementation.
static func plan_missing(center: Vector2i, radius: int, budget: int,
		loaded: Dictionary, pending: Dictionary = {}) -> Array[Vector2i]:
	assert(radius >= 0 and radius <= 16)
	assert(budget >= 0 and budget <= 64)
	var candidates: Array[Vector2i] = []
	for dz in range(-radius, radius + 1):
		for dx in range(-radius, radius + 1):
			candidates.append(Vector2i(center.x + dx, center.y + dz))
	candidates.sort_custom(func(a: Vector2i, b: Vector2i) -> bool:
		var da := (a - center).length_squared()
		var db := (b - center).length_squared()
		if da != db:
			return da < db
		if a.y != b.y:
			return a.y < b.y
		return a.x < b.x
	)
	var result: Array[Vector2i] = []
	for pos in candidates:
		if loaded.has(pos) or pending.has(pos):
			continue
		result.append(pos)
		if result.size() >= budget:
			break
	return result

static func affected_chunks(x: int, z: int, chunk_size: int = 16) -> Array[Vector2i]:
	assert(chunk_size >= 1 and chunk_size <= 256)
	var cx := floori(float(x) / float(chunk_size))
	var cz := floori(float(z) / float(chunk_size))
	var lx := posmod(x, chunk_size)
	var lz := posmod(z, chunk_size)
	var xs: Array[int] = [0]
	var zs: Array[int] = [0]
	if lx == 0:
		xs.append(-1)
	elif lx == chunk_size - 1:
		xs.append(1)
	if lz == 0:
		zs.append(-1)
	elif lz == chunk_size - 1:
		zs.append(1)
	var out: Array[Vector2i] = []
	for dx in xs:
		for dz in zs:
			out.append(Vector2i(cx + dx, cz + dz))
	return out
