# Living Ink / ASQURA — visual gap analysis after successful 3D walkthrough MVP

Date: 2026-09-30

## Context

The current public MVP already proves:
- autonomous standalone HTML
- offline-after-load runtime
- mobile touch walkthrough
- world-space 3D office modules
- Living Ink stylization
- procedural office scenes

This is a real success and must be preserved.

The current runtime visual output is still visibly below the approved ASQURA reference image. The reference reads as a directed architectural ink-and-watercolor illustration; the current MVP still reads as a sparse technical sketch.

## Success that must not be lost

1. True 3D world-space scene, not a flat illustration.
2. Mobile navigation: left-thumb movement + right-thumb look.
3. Procedural office modules instead of one fixed shot.
4. Living Ink as a renderer/stylization layer over scene data.
5. Standalone/offline HTML artifact.
6. One shared world across desktop and mobile rather than separate scene implementations.

Future work must improve this same stack incrementally, not replace it with a disconnected demo.

## Why the current MVP succeeded

The successful step was moving navigation into the same world-space camera used by the Living Ink renderer. Office modules are generated in real x/y/z coordinates around the camera, so movement changes perspective, parallax, depth ordering and visible office areas. This made the project a navigable 3D world instead of a static illustration.

The touch controller also maps directly to movement and camera rotation rather than screen-space panning:
- left side -> forward / backward / strafe velocity
- right side -> yaw / pitch

This preserved the same scene and renderer for desktop and phone.

## Main visual gap versus the approved ASQURA reference

The reference has:
- much stronger foreground / midground / background composition
- cleaner and more expressive human silhouettes
- richer office object density
- stronger glass/partition architecture
- better tonal hierarchy
- larger watercolor masses
- better grounding/contact shadows
- semantic simplification at distance
- staged office behavior instead of mostly technical placement

The current MVP already has the correct architectural direction, but lacks these quality-control systems.

## Required next systems

### 1. Volumetric Human Silhouette System

Goal: replace marker-like figures with readable office workers.

Needed:
- stronger torso / hip / shoulder volumes
- cleaner body proportions
- readable office clothing silhouettes
- pose cleanup layer
- dedicated stand / walk / sit / type / talk / meeting profiles
- richer hands/feet/head/hair treatment at near LOD
- stable simplified human silhouettes at mid/far LOD

### 2. Architectural Glass & Partition Renderer

Goal: make glass partitions one of the dominant visual style carriers.

Needed:
- translucent layered glass planes
- thin architectural frame lines
- depth-aware overlap
- selective edge emphasis
- hidden-line suppression
- stronger nearby glass, weaker distant glass
- doorway/frame grammar

### 3. Tonal Hierarchy / Exposure Control

Goal: remain pale and airy while keeping important objects readable.

Needed:
- focal contrast hierarchy
- local opacity boosting
- distance-based tone management
- line darkness ranking
- readability-preserving atmospheric fade
- screen-space tonal balancing

### 4. Watercolor Mass Layer

Goal: make the image read as ink + watercolor rather than wireframe.

Needed:
- soft translucent wash masses
- grouped washes behind furniture and people
- character wash silhouettes
- larger low-frequency tonal areas
- deterministic layered watercolor accumulation by seed

### 5. Semantic Prop Density System

Goal: increase believable office richness without clutter.

Needed:
- desk kits
- monitor/keyboard/mouse/phone/mug/document clusters
- meeting-room kits
- coffee-zone kits
- printer-corner kits
- shelf/book/folder clusters
- near/mid/far density rules

### 6. Contact Shadow + Grounding System

Goal: make people and props sit convincingly in the environment.

Needed:
- soft human contact shadows
- furniture grounding shadows
- chair/desk/plant grounding
- subtle floor tone accumulation
- depth-aware floor anchoring

### 7. Artistic Simplification LOD 2.0

Goal: simplify by visual meaning rather than just geometry amount.

Human example:
- near: body shape + clothing + accessories + pose detail
- mid: silhouette + jacket/tie hints + limb gesture
- far: head/torso/limbs + wash patch
- very far: a few purposeful strokes

Furniture example:
- near: object parts and accessories
- mid: core silhouette + one or two semantic features
- far: light volume + line hints

### 8. Shot-Aware Composition System

Goal: generate frames that read as architectural illustrations, not just valid layouts.

Needed:
- foreground / midground / background planning
- focal point selection
- empty-space control
- visual rhythm of glass partitions
- composition-aware people/prop placement
- hero-object / secondary-object hierarchy

### 9. Behavioral Scene Direction

Goal: make the office feel intentionally inhabited.

Needed:
- staged work/talk/walk clusters
- conversational pairs
- foreground hero characters
- role-aware occupancy
- pose selection based on scene composition
- animation-to-zone matching

### 10. Dual Mode Camera System

Goal: support both exploration and presentation-quality framing.

Modes:
1. Walkthrough mode
2. Illustration / Camera Director mode

Needed:
- auto-composed camera presets
- screenshot/export views
- stable focal lengths
- composition-aware camera placement

## Priority order

### Priority 1 — biggest visual gain
1. Volumetric Human Silhouette System
2. Architectural Glass & Partition Renderer
3. Tonal Hierarchy / Exposure Control
4. Watercolor Mass Layer

### Priority 2 — scene richness and grounding
5. Semantic Prop Density System
6. Contact Shadow + Grounding System
7. Artistic Simplification LOD 2.0

### Priority 3 — final push toward reference quality
8. Shot-Aware Composition System
9. Behavioral Scene Direction
10. Dual Mode Camera System

## Rule for future chats and agents

Do not discard the current 3D walkthrough MVP.
Do not replace it with a flat static illustration.
Do not create a second disconnected graphics path.

Reuse and improve:
- shared/living-ink-core.js
- shared/living-ink-office.js
- lib/living-ink-compiler.js
- data/living-ink-office.recipe.json
- apps/living-ink-office/index.html

The target is to improve the existing navigable Living Ink stack until the live 3D scene approaches the approved ASQURA reference visually.
