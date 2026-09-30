# Gothic Destruction MVP — failure analysis: glued voxels and obstructive HUD

Date: 2026-09-30

## Context

The first public Gothic Destruction MVP correctly proved structural support loss and Rapier motion, but a real iPhone screenshot exposed two player-visible failures that automated tests did not reject strongly enough.

## Failure 1 — a broken voxel cluster moved as one glued object

### Symptom

After a cannon hit, a tower/viaduct section fell, but the cubes that visually formed that section stayed rigidly welded together instead of separating and colliding as individual debris.

### Root cause

The performance repair used `colliderMode: "cluster-aabb"` in `shared/physics/rapier-collapse-runtime.mjs`. The canonical structural planner correctly decided which voxels had lost support, but the presentation/physics adapter represented the entire selected component as one Rapier rigid body with one AABB collider. That optimization preserved gross motion but changed the visible physical meaning from “many breakable voxels” to “one solid chunk”.

The previous browser regression was too weak: it proved that a newly spawned rigid body moved, but it did not prove that multiple voxels became independent bodies or that their pairwise separation changed over time.

### Corrective rule

For a destruction effect whose visible material is discrete voxels, the runtime must not use one rigid body for the whole visible cluster when the intended behavior is fragmentation. The structural planner may still decide unsupported sets as clusters, but the motion adapter must convert the visible debris into bounded independent voxel bodies with distinct deterministic linear/angular impulses.

Performance must be recovered with:
- instanced rendering of fragment meshes;
- strict fragment/body budgets;
- adaptive DPR/shadows/physics frequency;
- deterministic prioritization near the impact;
- sleep/deactivation of settled bodies.

Do **not** recover performance by gluing the visible cubes back into one body.

### Regression proof

The public MVP E2E must:
1. spawn at least several new voxel rigid bodies from one shot;
2. prove unique voxel IDs;
3. measure the same bodies twice;
4. prove their pairwise spread increases after the impact;
5. keep body/collider counts inside the configured budget;
6. keep the existing FPS floor.

## Failure 2 — diagnostic UI covered the graphics

### Symptom

The phone viewport showed a title card, technology badge, target selector, large control panel and status readout. The actual 3D scene was squeezed behind interface chrome.

### Root cause

A diagnostic/demo presentation was allowed to become the player-facing presentation. The project already had a Golden rule that persistent technical/status information must not obstruct gameplay, but the dedicated MVP E2E only checked that controls were on-screen; it did not constrain how much of the viewport they consumed or how many persistent HUD elements were visible.

### Corrective rule

For this graphics demonstration the persistent gameplay HUD is exactly:
- one center reticle;
- one FIRE button.

Everything else must be removed from the persistent viewport. Debug/status data may exist only in hidden test/runtime state or behind a non-persistent diagnostic path.

The canvas remains fullscreen and the fire button must occupy only a small fraction of the viewport, including on portrait mobile.

### Regression proof

The browser gate must assert:
- visible HUD inventory equals `reticle + fire`;
- legacy selectors/panels/status/legend are absent;
- canvas fills at least 98% of viewport width and height;
- fire button occupies less than 8% of viewport area;
- reticle occupies less than 1%.

## General lesson for future AI agents

A technically correct simulator can still fail the user if its **representation changes the semantics**. “The object moved” is not enough evidence for fragmentation. Tests must measure the property the user actually cares about.

Likewise, a graphics-first game should not inherit an engineering dashboard. Technical proof belongs in telemetry/tests; the player viewport belongs to the world.
