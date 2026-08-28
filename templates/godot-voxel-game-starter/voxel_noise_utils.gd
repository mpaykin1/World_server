extends RefCounted
class_name VoxelNoiseUtils
## Shared hash/fbm/palette helpers so every voxel-generator script in a
## project stops reimplementing its own copy (this happened 4 times in
## dark-void-scene before being worth extracting). Static functions -
## instantiate nothing, just call VoxelNoiseUtils.hash2(x, y) etc.

static func hash2(x: float, y: float) -> float:
	var n: float = sin(x * 127.1 + y * 311.7) * 43758.5453
	return n - floor(n)

## Layered sine "fbm" - macro sweep + medium bumps + fine jitter, so a
## generated silhouette reads as naturally irregular instead of one clean
## periodic wave. Range is roughly [-2, 2].
static func fbm1(x: float, seed: float) -> float:
	var v: float = 0.0
	var amp: float = 1.0
	var freq: float = 1.0
	for i in range(4):
		v += sin(x * freq + seed * (float(i) + 1.0) * 2.7) * amp
		freq *= 2.13
		amp *= 0.52
	return v

## The capped dark->lit palette lerp from README.md's "materials" section.
## dark/mid/lit should be real measured colors from a reference image, not
## guesses. lit_t in [0,1] (already pow()-curved by the caller so most
## values cluster near 0). mid_cap/lit_cap are the "never fully reach it"
## ceilings - keep them small (~0.15-0.25) unless you've confirmed via a
## real screenshot that the silhouette isn't reading as a uniform wash.
static func palette_lerp(dark: Color, mid: Color, lit: Color, lit_t: float, mid_cap: float = 0.16, lit_cap: float = 0.14) -> Color:
	var col: Color = dark.lerp(mid, clamp(lit_t * 1.3, 0.0, mid_cap))
	col = col.lerp(lit, clamp((lit_t - 0.9) * 5.0, 0.0, lit_cap))
	return col
