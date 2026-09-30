# Krieger Level Lab v1 failure — 2026-09-30

This file is the World Server copy of the physical-iPhone postmortem. It exists so future World Server chats/agents do not repeat the same architectural mistake.

Canonical research repo: `mpaykin1/scratch-chain-reaction`  
Canonical detailed postmortem: `KRIEGER_LEVEL_LAB_POSTMORTEM_2026-09-30.md` in that repo.

## Physical-device result

The custom Level Lab no longer rendered black, but the user's iPhone showed:

- primitive flat cuboid geometry rather than Krieger-quality graphics;
- no visible first-person weapon;
- FIRE with no visible shot/effect.

Synthetic framebuffer gates had passed. Physical-device evidence overrides that success claim.

## Confirmed causes

### 1. Geometry fidelity was never implemented

Level Lab v1 is mainly:

```
Mesh_Cube -> COLOR0 -> GenMesh::Add
```

It does not exercise enough of the real Krieger authoring vocabulary: Bevel, Extrude, Displace, Perlin, Grid, Bend, UVProjection, MatLink, procedural bitmap generation, rich material graphs, scene composition and effects.

### 2. Renderer survival material was confused with visual fidelity

The base+light material fixed the 2004 depth contract, but it is intentionally minimal. Correct rendering is not the same milestone as authentic Krieger content generation.

### 3. Weapon bindings were destroyed

Level Lab calls `KKriegerGame::Flush()` after the .kx graph is loaded.

Upstream `Flush()` clears:

```
WeaponShot[]
WeaponOptics[]
WeaponExplode[][]
WeaponTimer
```

Therefore no first-person weapon can be displayed and FIRE has no authored shot operator to execute.

### 4. Native weapon/effect jobs were also removed from rendering

The isolation paint path clears `MeshJobs`, `EffectJobs`, `PortalJobs` and `SectorJobs` before adding the custom lab mesh. That isolates the level but also amputates weapon/effect/event rendering.

## Permanent World Server rules

- Do not equate “uses Krieger renderer/classes” with “Krieger-quality graphics”.
- Do not call destructive `KKriegerGame::Flush()` after weapon resources are populated unless they are explicitly restored.
- Do not globally clear mesh/effect job queues in a product-level custom scene.
- FIRE must be proven end-to-end: input -> game state -> non-null WeaponShot -> shot event -> render -> visible effect/hit.
- Weapon visibility must be separately proven through non-null `WeaponOptics[current]` and framebuffer evidence.
- Physical iPhone remains the final authority for mobile acceptance.

## Required next architecture

Do not add more boxes to Level Lab v1. Keep it as a diagnostic harness.

Build Native Level Lab v2:

```
KX/operator recipe
 -> procedural bitmap/texture graph
 -> mesh operator graph
 -> GenMesh
 -> real GenMaterial graph
 -> GenScene
 -> Sector/Portal/Light
 -> preserve weapon + effects
 -> Engine jobs
 -> Paint2004
 -> postprocess
 -> viewport
```

Before another full custom level claim, complete:

1. KX operator archaeology;
2. Krieger Observatory/provenance tracing;
3. Native Geometry Lab;
4. Native Material Lab;
5. Native Scene Lab;
6. Weapon Lab;
7. Creature Lab.

Pinned upstream remains `MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`.
