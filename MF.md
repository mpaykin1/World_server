# MF — MUST FINISH

**MF** is the canonical World Server list of projects the owner has explicitly said **must be finished**.

Machine-readable mirror: `data/must-finish-projects.json`.

## Rules

- Only an explicit owner instruction may add a project to MF or remove/close it.
- A green CI run, merge, deploy, percentage, or assistant judgment does **not** remove an MF item.
- MF items survive chat boundaries. Fresh chats must read this file before claiming an MF project is complete or starting a replacement implementation.
- Continue from the linked checkpoint/code in `master`; do not rebuild from scratch when a recoverable implementation already exists.
- Preserve explicit SUCCESS/FAILURE history. An in-progress successor does not erase an earlier accepted baseline.
- An item leaves active MF only after the owner explicitly accepts completion or explicitly asks to remove it.

## Active MF

### 1. Living Light Cat 3D V4 — broken rim + moving tail

Status: **MUST FINISH / IN PROGRESS**

- App: `apps/living-light-cat-3d-v4/`
- Live: https://world-server.mmmpaykin.workers.dev/apps/living-light-cat-3d-v4/
- Cross-chat checkpoint: `LIVING_LIGHT_CAT_3D_V4_PROGRESS.md`
- Accepted parent baseline: `LIVING_LIGHT_CAT_3D_V2_SUCCESS.md`
- Core goal: match the reference behavior — incomplete variable-thickness lighting contour plus a tail that follows the torso and changes pose smoothly with movement.
- Do not mark done until the owner explicitly accepts the result.

### 2. Gothic Destruction MVP

Status: **MUST FINISH**

- App: `apps/gothic-destruction-mvp/`
- Live: https://world-server.mmmpaykin.workers.dev/apps/gothic-destruction-mvp/
- Preserved accepted subsystem: `docs/GOTHIC_VOXEL_FRAGMENTATION_GOLDEN_SUCCESS.md`
- Core rule: preserve the already accepted independent voxel-debris behavior (“камни разлетаются хорошо”) while finishing the project around it.
- Read the current app, release registry and latest Git history before changing it.
- Do not silently substitute `apps/ai3d-voxel-city/` or a reference-test project for this MF item.

## Discovery aliases

`MF`, `Must Finish`, `must-finish`, `обязательно доделать`, `список MF`, `проекты MF`.
