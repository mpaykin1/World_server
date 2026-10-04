# Trinity Lab unified MVP — user-confirmed success — 2026-10-04

**Status:** SUCCESS — explicitly decided by the user after testing the new unified public MVP.

This success supersedes the earlier INK/CUBE FAILURE **for the new unified version only**. The earlier failure remains valuable history and is preserved in `data/trinity-lab-user-verdict.json`.

## Why this version succeeded

The decisive change was architectural, not cosmetic:

**one canonical semantic scene/layout → one camera/composition → three style adapters.**

The previous failed version shared semantic IDs but the strongest corridor geometry, depth rhythm, foreground anchor and lighting structure were effectively KRIEGER-only. INK and CUBE therefore looked like separate weaker interpretations.

The unified version moved those spatial decisions into a canonical contract and made all three modes consume the same layout.

### KRIEGER

The already user-approved quality baseline was preserved: architectural rhythm, repeated arches/columns, local warm light, real material response, microdetail, foreground/midground/background separation and controlled darkness.

### INK

INK stopped behaving like a wireframe/toon fallback. It now reuses the existing Living Watercolor 3D system with paper compositing, watercolor washes, pigment pooling, granulation and semantic lines while keeping the canonical layout and camera.

The earlier black-outline-shell failure was removed rather than hidden.

### CUBE

CUBE stopped being a set of approximate debug blocks. The same canonical corridor is interpreted as finished voxel art with a continuous voxel floor, stepped arches/columns, the same foreground device and shared lighting intent.

Final measured structure in the verified candidate:
- 3402 corridor voxels
- 325 foreground voxels
- 5 local lights

### Shared evidence

- canonical layout signature: `3534bc53`
- semantic parity across KRIEGER / INK / CUBE: PASS
- page/runtime errors: 0
- user-visible scene visibility: 100%
- desktop evidence: PASS
- portrait evidence: PASS
- relevant regression tests: 14/14 PASS

## Reusable lesson for other agents

**Technical PASS is not enough for a graphics MVP.** The failed INK/CUBE version had real technical capabilities but did not meet the user's visual-quality bar.

The successful pattern is:

`CANONICAL SCENE → SHARED GEOMETRY/CAMERA/LIGHT INTENT → STYLE ADAPTER`

not three renderer-specific worlds.

And the successful graphics coupling remains:

`ARCHITECTURE → MATERIAL → LOCAL LIGHT → MICRODETAIL → DEPTH → CONTROLLED DARKNESS`

Future Trinity work must preserve this success while generalizing beyond the golden corridor.
