# Memory Art World / KRIEGER Painting-to-World — MF Handoff

## Status

- MF ID: `memory-art-world`
- Status: `must-finish / in-progress`
- Added by explicit user request: 2026-10-05
- This is a durable cross-chat project. Do not replace it with a new duplicate MVP.

## Product idea

Build an interactive journey through a person's memory using World Server.

The user gradually provides situations, memories, people, places and emotional fragments. World Server turns them into a growing spatial memory system rather than a flat diary.

Two primary presentation modes share the same underlying data:

1. **Memory Gallery** — a navigable gallery of living paintings/portals. The user approaches an image, it begins to move/sound, and the user can enter it.
2. **Memory World** — memories become one explorable 3D geography. Semantic/emotional closeness determines spatial relationships more than literal geography.

A third source mode is equally important:

3. **Painting-to-World** — a 2D artwork becomes an explorable interactive 3D world where depicted elements can be approached, climbed, animated or entered. The target experience is comparable in spirit to immersive exhibitions where a visitor can walk inside the logic of a painting rather than merely view it on a wall.

## Core architectural decision

Do **not** build a separate memory engine.

Use a universal scene specification plus a reusable World Server graphics/world compiler:

```
TEXT / MEMORY / IMAGE / ARTWORK / VIDEO REFERENCE
                    ↓
             Scene Specification
                    ↓
       KRIEGER ART WORLD COMPILER
                    ↓
          interactive 3D world
```

The KRIEGER layer must be reusable outside this project. It should become a compact procedural authoring language / compiler for geometry, materials, lighting, animation, particles, post-processing, interaction and LOD.

## Target pipelines

### Memory

```
user memory
→ MemorySpec
→ semantic entities / people / objects / places / emotions / relations
→ Memory Graph
→ spatial layout
→ KRIEGER scene operators
→ playable world
→ semantic portals into related memories
```

### Painting

```
painting
→ segmentation
→ semantic objects
→ depth / layers
→ scene graph
→ style extraction
→ 3D completion
→ KRIEGER operators
→ painterly materials / strokes
→ animation + interaction
→ playable world
```

The generated world should continue the **visual logic of the artwork**, not normalize it back to realistic physics. Impossible scale, warped perspective, painterly surfaces and surreal deformation are valid first-class scene properties.

## Data truth rule for memories

AI must not silently blur user memory and invention.

Every generated element needs provenance:

- `USER_FACT` — explicitly supplied by the user.
- `AI_INFERENCE` — plausible but inferred.
- `ARTISTIC_GENERATION` — invented for atmosphere/composition.

The scene may be visually coherent, but provenance must remain machine-readable.

## Existing World Server systems to reuse

Do not rebuild these from scratch:

- procedural KRIEGER camera/graphics MVP;
- KRIEGER Total Control operator work;
- deterministic world-emergence / seed systems;
- Creature Factory for generated living entities;
- shared Golden graphics / atmosphere / lighting / material pipeline;
- existing mobile/static-viewport interaction rules;
- existing AI / world-state / persistence infrastructure where compatible.

Before implementation, re-audit current master and use the latest canonical KRIEGER evidence/ledger rather than old chat percentages.

## Candidate open-source projects to study/adapt

These are **research candidates**, not automatic imports. Before importing any code/assets, re-verify the exact repository, commit, code license, asset license and attribution requirements.

- **VR Art Gallery** — useful reference for artwork preprocessing, normal/displacement style depth and WebXR presentation.
- **Open Brush** — useful for volumetric/painterly stroke geometry and spatial painting concepts.
- **VARTISTE** — useful for image/surface projection, layers and WebXR editing concepts.
- **Rooms** — useful for SDF/sculpt/deformation/animation/experience-graph concepts.
- **A-Frame** — useful as a reference for WebXR interaction patterns only; do not introduce a second engine if the existing Three.js/WebGL World Server stack already covers the need.

Preferred policy remains: IMPORT only when clearly justified; otherwise ADAPT / LEARN-REIMPLEMENT. Avoid engine duplication.

## First vertical slice

Build the smallest end-to-end proof, not a large content demo.

### Input
- 1 artwork or 1 memory scene.

### Required output
- a real walkable 3D scene;
- fixed/static game viewport on desktop/mobile;
- at least 3 semantically meaningful interactive objects;
- at least one object can act as a portal to another scene/state;
- lighting/material/style clearly derive from the source rather than generic gray geometry;
- deterministic regeneration from stored scene spec / seed;
- provenance metadata preserved for memory-generated content.

### Preferred initial memory proof
Five memories → one gallery → five living portals, then demonstrate one semantic cross-link between two memories.

### Preferred initial painting proof
One artwork → segmented/depth-aware 3D scene → user can enter it, walk around, approach at least three depicted elements, and trigger at least one artwork-specific animation/deformation.

## Completion criteria for MF closure

This MF item must remain open until all of the following are true:

1. Canonical `MemorySpec` / generic scene-spec schema exists and is versioned.
2. Deterministic Memory Graph exists.
3. Reusable KRIEGER Art World Compiler exists and is not hardcoded to one demo.
4. A 2D painting can become a playable 3D world with meaningful style preservation.
5. A user memory can become a playable scene with provenance labels.
6. Semantic objects can link/portal to related memories/scenes.
7. At least one painterly/stroke-oriented rendering path is demonstrated.
8. Desktop interaction is proven.
9. Mobile/iPhone interaction is proven with static viewport and touch controls.
10. Golden/evidence gates and regression protection exist.
11. Stable recoverable production delivery exists.
12. User explicitly approves closure/removal from MF.

## Do not regress / do not cheat

- Do not reduce the result to a flat panorama, slideshow, OrbitControls viewer or gallery-only wall texture.
- Do not call image displacement alone a finished Painting-to-World system.
- Do not fake interactivity with pre-rendered video.
- Do not replace a source artwork's visual logic with generic realistic materials.
- Do not silently present AI-invented memory details as remembered facts.
- Do not add a second rendering/game engine unless current World Server capabilities are proven insufficient.
- Do not mark the MF item complete from CI alone; user closure is mandatory.
- Do not issue a test/final URL without the current Verified Link Delivery gate.

## Current next action

Create the first bounded `MemorySpec / ArtWorldSpec → Scene Specification → KRIEGER Art World Compiler` vertical slice on top of the current World Server stack. Prefer reuse of the preserved procedural KRIEGER MVP and existing graphics/emergence systems. Prove one small painting or memory end-to-end before expanding content.
