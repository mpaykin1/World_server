# PIXEL ANIMATION SYSTEM V3 — World_server

Additive V3 upgrade for scalable pixel-art animation. It preserves V2 graphics/input/physics and adds GPU compute culling, multi-atlas texture arrays/streaming, procedural region rigging, backend warm-up/cache, animated regression checks, authenticated device baselines, bounded learned quality policy and safe auto-integration.

## V3 systems
- WebGPU compute culling with bounded visible buffer + `drawIndexedIndirect`.
- WebGPU `texture_2d_array` and WebGL2 `sampler2DArray`; legacy single atlas = layer 0.
- Multi-atlas manifest/streamer with max 16 layers and stream-ahead policy.
- Region/mask rig for head/torso/legs-style procedural deformation without replacing source art.
- Pipeline/backend cache: failed backends are deprioritized; successful paths warm up first.
- Animated visual-regression signatures across 8 deterministic frames.
- Device baseline tracker with conservative bounded policy learning.
- Server telemetry accepts only authenticated requests; raw user-agent data is not stored.
- Modern Supabase publishable/secret key handling is compatible with `sb_publishable_*` / `sb_secret_*` and legacy JWT keys.
- Safe auto-integrator touches only explicitly marked world/game canvases and is idempotent.
- V2 WebGPU/WebGL2/Canvas2D fallback, worker path, PixiJS adapter, 17 profiles, spatial culling, LOD and adaptive budgets remain.

## Verified in this patch environment
- Node/unit/syntax suite: **20/20 PASS**.
- Animated regression: **8/8 frames PASS**.
- 50,000-object CPU spatial query benchmark: about **0.065 ms/query** in the latest run.
- Supabase runtime policy: **v3 active**.
- `pixel-animation-config`: **v3 ACTIVE**.
- `pixel-animation-telemetry`: **v2 ACTIVE**, JWT verification enabled.
- 17 server profiles remain enabled.
- V3 tables have RLS; client access to raw baselines is explicit deny-all.
- Current Supabase Advisor shows no pixel-animation security warning after the deny policy. Fresh V3 `updated_at` indexes were removed because they were unused.

## Still requires repository/device evidence
The connected GitHub account currently exposes no repository to this chat, so source integration/PR/preview cannot be completed here. Desktop AI must install this patch into the actual World_server checkout, use a task branch, run the full project gates, then verify real WebGPU/WebGL2/Canvas2D on desktop + mobile. Node structural checks are not a substitute for actual browser GPU validation.

## Install
From the World_server repository root:

`node <path-to-patch>/install.cjs <repo-root>`

The installer creates a task branch if currently on `main`/`master`, installs additive modules, safely auto-integrates only marked world canvases, registers the candidate, and runs structural/unit/visual/benchmark gates.

Read `DESKTOP_AI_PIXEL_ANIMATION_V3.md` before promotion.
