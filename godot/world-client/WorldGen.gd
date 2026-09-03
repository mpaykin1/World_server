extends Node
class_name WorldGen
## Faithful GDScript port of apps/voxel-world/client.js's terrain generation
## (hash32/smooth/valueNoise/fbm/biomeAt/heightAt, lines 59-72 of that
## file). Same seed -> same height/biome at every (x,z) as the web
## renderer - this is what makes the native client a second CLIENT of the
## same World_server world, not a different world. Ported formula-for-
## formula, not reinterpreted; verified against the JS via
## scripts/compare-worldgen.js (Cross-Platform Quality Loop, functional
## equivalence check - see that script for the exact sampled-point diff).

const WORLD_Y := 96

## GDScript's `int` is a 64-bit signed integer with no built-in 32-bit
## wraparound multiply or unsigned-shift, unlike JS's Math.imul/`>>>` -
## the first port of this function used plain 64-bit `*`/`^`/`>>`, which
## silently produced wrong hashes (caught by scripts/compare-worldgen.js:
## the native client rendered visibly different terrain - all "snow" biome
## - from the same seed the web client uses). These two helpers make the
## 32-bit-wraparound and unsigned-shift semantics explicit and correct.
static func to_int32(v: int) -> int:
	var low32 := v & 0xFFFFFFFF
	if low32 >= 0x80000000:
		low32 -= 0x100000000
	return low32

static func imul32(a: int, b: int) -> int:
	return to_int32(a * b)

static func ushr32(v: int, n: int) -> int:
	return (v & 0xFFFFFFFF) >> n

static func hash32(x: int, z: int, seed_val: int) -> float:
	var h: int = to_int32(imul32(x, 374761393) ^ imul32(z, 668265263) ^ seed_val)
	h = imul32(h ^ ushr32(h, 13), 1274126177)
	var u: int = to_int32(h ^ ushr32(h, 16)) & 0xFFFFFFFF
	return float(u) / 4294967295.0

static func smooth(t: float) -> float:
	return t * t * (3.0 - 2.0 * t)

static func value_noise(x: float, z: float, scale: float, seed_val: int) -> float:
	var fx := x / scale
	var fz := z / scale
	var x0 := floori(fx)
	var z0 := floori(fz)
	var tx := smooth(fx - x0)
	var tz := smooth(fz - z0)
	var a := hash32(x0, z0, seed_val)
	var b := hash32(x0 + 1, z0, seed_val)
	var c := hash32(x0, z0 + 1, seed_val)
	var d := hash32(x0 + 1, z0 + 1, seed_val)
	var ab := a + (b - a) * tx
	var cd := c + (d - c) * tx
	return ab + (cd - ab) * tz

static func fbm(x: float, z: float, seed_val: int) -> float:
	return value_noise(x, z, 72, seed_val) * 0.52 \
		+ value_noise(x, z, 31, seed_val + 97) * 0.28 \
		+ value_noise(x, z, 13, seed_val + 197) * 0.14 \
		+ value_noise(x, z, 6, seed_val + 313) * 0.06

static func biome_at(x: float, z: float, world_seed: int) -> String:
	var t := value_noise(x, z, 180, world_seed + 900)
	var m := value_noise(x, z, 150, world_seed + 1400)
	if t > 0.72:
		return "desert"
	if t < 0.22:
		return "snow"
	if m > 0.62:
		return "forest"
	return "plains"

static func height_at(x: float, z: float, world_seed: int) -> int:
	var b := biome_at(x, z, world_seed)
	var n := fbm(x, z, world_seed)
	var ridge := absf(value_noise(x, z, 105, world_seed + 77) - 0.5) * 2.0
	var h := 16.0 + n * 21.0
	if b == "snow":
		h += ridge * 15.0
	if b == "desert":
		h = 17.0 + n * 11.0
	if b == "forest":
		h += 4.0
	return clampi(floori(h), 5, WORLD_Y - 12)

## BLOCK colors - must stay byte-identical to apps/voxel-world/client.js's
## BLOCKS table (same hex values) so the same biome renders the same color
## on both clients.
const BLOCK_GRASS_COLOR := Color(0x5f / 255.0, 0x9f / 255.0, 0x43 / 255.0)
const BLOCK_SAND_COLOR := Color(0xd8 / 255.0, 0xc1 / 255.0, 0x7a / 255.0)
const BLOCK_SNOW_COLOR := Color(0xe9 / 255.0, 0xf4 / 255.0, 0xff / 255.0)
const BLOCK_STONE_COLOR := Color(0x77 / 255.0, 0x7d / 255.0, 0x82 / 255.0)

static func surface_color_for_biome(biome: String) -> Color:
	match biome:
		"desert":
			return BLOCK_SAND_COLOR
		"snow":
			return BLOCK_SNOW_COLOR
		_:
			return BLOCK_GRASS_COLOR
