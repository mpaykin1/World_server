# Unified Matter + Voxel Physics Runtime

## Purpose

World Server now has one material/structure simulation contract for both pixel-cell and voxel-cell worlds. The runtime is intended to reproduce the operations visible in the analyzed Noita-style sequences without making the renderer or one particular game the source of physics truth.

## Architecture

```
MatterWorld
  -> phases / density / temperature / combustion / reactions
  -> deterministic cell events
WorldStructureEngine
  -> anchors / support graph / disconnected components
WorldClusterEngine
  -> detached cell groups / gravity / impulse / discrete rotation / impact
WorldPressureEngine
  -> bounded radial heat / damage / fracture / displacement
WorldPhysicsRuntime
  -> one event stream and one step contract
       |-> PixelCellAdapter
       |-> VoxelCellAdapter
       |-> WorldPhysicsSequencer
       |-> renderCommandsForEvents
       |-> WorldPhysicsVoxelBridge
       -> Three.js dynamic-matter renderer
```

## Same operations, two representations

`mode: "pixel2d"` restricts matter and connectivity to X/Y and clamps Z to zero.
`mode: "voxel3d"` uses six-neighbor X/Y/Z connectivity and the same material catalog, temperature, combustion, density and reaction rules.

The physics code does not contain separate "pixel fire" and "voxel fire" implementations. Representation adapters translate the same physical events to a 2D cell renderer or to Voxel World block mutations.

## Systems added

### Matter

Materials include stone, metal, glass, coal, dirt, snow, ash, sand, water, oil, wood, steam, fire and lava. Cells can carry temperature, fuel, lifetime and integrity. Existing hardened rules remain: fixed Y-up gravity and nonflammable materials cannot be forged into a burning state.

### Structural support

Solid cells form a deterministic support graph. Support originates from ground, explicit anchors or a caller-defined anchor rule. Unsupported connected components are identified without scanning beyond a configured structural-cell budget. A budget overflow fails closed: unknown structure is not detached.

### Detached clusters

Unsupported solid components become temporary detached clusters. They can fall, receive linear/radial impulses, perform bounded quarter-turn rotation, collide with the cell world, then materialize back into cells. A sufficiently hard impact is reported as a shatter event and returns the cluster to cell simulation.

This is a grid-rigid approximation, not a continuous rigid-body solver. It intentionally preserves deterministic cell coordinates and bounded CPU work.

### Pressure and fracture

Explosions apply bounded radial heat, integrity damage, fracture and mobile-material displacement. The affected coordinate set is snapshotted before mutation, so one displaced cell cannot be processed repeatedly by the same blast. Radius and visited-cell budgets are capped.

### Rendering and effects

Physics emits semantic events instead of renderer calls. The render bridge maps them to commands such as:

- fire sparks / steam / ash / debris;
- light emitters and thermal/explosion light pulses;
- camera impulses;
- detached-cluster visual state.

The Three.js adapter renders dynamic matter and detached voxel clusters with instancing. Fire and lava use emissive materials and a bounded dynamic-light pool. Existing World Server bloom/particle/quality systems remain reusable rather than being duplicated inside physics.

### Voxel World bridge

`WorldVoxelMatter` is an opt-in capability in `apps/voxel-world`. Normal gameplay is unchanged until a caller explicitly starts a local physics region.

Available operations:

- `begin(center, options)`
- `step(options)`
- `inject(position, material, state)`
- `ignite(position, options)`
- `explode(position, options)`
- `snapshot()`
- `reset()`
- `diagnostics()`

A bounded region is imported from Voxel World, boundary solids are anchored to represent support continuing into unloaded terrain, and physics events are translated back to block changes. Materials without a static block id (fire, steam, lava, oil, ash) stay in the dynamic-matter layer.

The bridge also exposes voxel change batches so a persistence/network layer can record them without making the physics engine itself depend on an API.

## Sequential scene reproduction

`WorldPhysicsSequencer` provides deterministic tick-based actions: set, clear, fill, anchor, remove-anchor, ignite, explode, impulse, transition, camera and marker.

This is sufficient to author the analyzed chain:

character / wand event -> material release -> avalanche -> transition -> cave material setup -> ignition -> spreading fire -> sparks / light -> impact or explosion -> next transition.

Character animation remains handled by the existing character/animation systems; the sequencer supplies physical and cinematic event timing rather than duplicating those systems.

## Performance and safety boundaries

- Matter updates only active cells.
- Structural analysis has an explicit max-cell budget.
- Explosion radius and visited cells are capped.
- Cluster translation steps are bounded.
- Dynamic rendering has mobile/desktop instance and light budgets.
- Voxel physics imports a local region instead of the whole infinite world.
- Existing Voxel World destruction is not enabled automatically.

## Evidence

Before this task, the local master release gate reached 1022 tests with 1018 PASS, two SKIP and two pre-existing `mcp-filesystem-proxy.test.js` timeouts. Those failures were present before any physics code changed.

During implementation the original Matter suite plus the new structural/parity suite reached 26/26 focused tests locally. A parity test initially failed because the 3D fixture gave water additional Z escape paths; the fixture was corrected to use an equivalent closed chamber instead of changing the engine.

Exact-head browser/Voxel tests and repository CI are attached to PR #432.

## Scientific status

This is D2 / code-confirmed engineering behavior. It implements deterministic gameplay rules inspired by cellular-material and structural simulations; it is not claimed to be a validated model of real material science, thermodynamics or blast physics.
