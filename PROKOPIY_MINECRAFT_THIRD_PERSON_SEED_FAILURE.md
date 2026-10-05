# Prokopiy Minecraft — third-person infinite-seed successor — USER-DECLARED FAILURE

Date: 2026-10-05  
Owner verdict time: `2026-10-05T14:04:00+04:00`  
Failed deployed SHA reviewed by owner: `ed036e50b8ffbbdd981da657d59356caac97fc4c`  
Reviewed Cloudflare URL: `https://world-server-pr-manual.mmmpaykin.workers.dev/apps/prokopiy-minecraft-mvp/`

## Owner verdict

The project owner explicitly marked the **third-person + infinite Architecture Seed successor = FAILURE** after testing it on mobile.

This verdict applies to the successor revision only. It does **not** erase or rewrite the earlier user-approved V1 success at SHA `66880d00d791c7847bde01a9f9abd56ab7c29390`.

## What the owner observed

- The player model spawns.
- The surrounding world does not build; the viewport is mostly sky.
- The HUD visibly reports `region 0:0 · seed error`.
- Character animations do not work.

This is sufficient product evidence for FAILURE. Automated deployment or browser-smoke PASS must never override the owner verdict.

## Root-cause analysis

### RC1 — seed preview was sent into an authenticated write path

The MVP asks for a deterministic read-only Architecture Seed profile with:

`POST /api/world-factory { action: "preview-seed", ... }`

But the Cloudflare worker routes every non-GET/HEAD `/api/world-factory` request through `proxyWorldStack(...)` as a write and rejects requests without an Authorization header with HTTP 401.

The branch-local Node handler knows how to handle `action === "preview-seed"`, but the deployed Cloudflare path never reaches that handler. The browser therefore cannot obtain the Architecture Seed profile.

### RC2 — one seed-profile failure aborts chunk construction

`createChunk()` awaits `getRegionProfile()` before it creates terrain meshes. When the profile request fails, the chunk job exits before ground/soil/roads/buildings are added.

That exactly explains the owner screenshot: the player GLB is present, but the world around it is absent.

### RC3 — readiness was a false positive

`boot()` calls `syncChunks()` asynchronously, then sets:

`globalThis.ProkopiyMinecraftMVP.ready = true`

without proving that even the initial chunk was built.

The delivery gate therefore saw a visible canvas and a truthy ready flag, while the HUD simultaneously showed `seed error`. A player on a blue background was enough visual signal for the generic screenshot check.

### RC4 — real character animation was never implemented

The source audit records `modelAnimationClips: 0` for the imported portable GLBs.

The loader path also returns only `g.scene` and discards `g.animations`. The movement loop merely translates/rotates the player and adds a small vertical sine bob; there is no `THREE.AnimationMixer`, no imported clip playback, and no procedural limb rig animation.

So the successor could move a model root, but it did not have real walk/run/idle character animation.

## Why our previous automated proof missed it

The proof checked deployment identity, HTTP 200, canvas visibility, Golden inventory membership and `ProkopiyMinecraftMVP.ready === true`.

Those checks proved **delivery**, not the requested gameplay. They did not assert:

- successful seed profile response;
- at least one materialized world chunk around the player;
- absence of `seed error`;
- a world-ready state derived from real chunk construction;
- an animation-ready state;
- visible pose change while moving.

That gap is now treated as an acceptance-test defect, not as a user-testing problem.

## Permanent prevention rules

Before any future third-person Minecraft successor is handed to the owner as ready:

1. `preview-seed` must use a Cloudflare-supported read-only deterministic route; it must never be blocked by world-creation authentication.
2. Readiness must stay false until the initial seed profile succeeds and at least the center chunk is actually materialized.
3. The app must expose separate machine-readable `worldReady` and `animationReady` states; generic canvas visibility is insufficient.
4. Mobile browser acceptance must fail on `seed error`, missing world readiness, or missing animation readiness.
5. Touch movement must be tested by actually moving the character while document scroll remains unchanged.
6. Animation acceptance requires a real clip/procedural pose system and observable animation state; root translation or sine bob does not count.
7. A verified link may be delivered only after the app-specific Minecraft acceptance gate passes on the exact deployed SHA.
8. Previous accepted V1 success and this successor failure must remain separate immutable evidence records.

## Required repair order

1. Fix the deployed Cloudflare route for read-only Architecture Seed preview.
2. Make initial chunk construction awaited and fail-closed.
3. Add real idle/walk/run animation using a rigged/animated asset or deterministic procedural limb animation.
4. Expose `worldReady`, `animationReady`, chunk count and seed error state for machine verification.
5. Run desktop + mobile app-specific acceptance, then request a new owner verdict.

## Search aliases

**Minecraft successor failure**, **seed error**, **empty sky**, **third-person animation failure**, **Prokopiy Minecraft failure**, **USER-DECLARED FAILURE**.
