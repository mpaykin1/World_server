# World Server — GRAPHICS-DEMO-001 original medieval game upgrade

User's decision on previous MVP: **FAIL** (some progress, far from supplied screenshot). Owner alone decides final PASS/FAIL. Do not close this task from model scores/CI alone.

## Two required equal tracks

The five **existing** hourly agents must perform **50% CLEAN_SERVER / 50% graphics** of measured productive effort over four hours. Scheduled runs do not equal minutes. Use issue #80 as canonical capacity and evidence ledger. No sixth task, new scheduler, second writer or duplicate PR. CLEAN_SERVER must continue; graphics cannot be indefinitely deferred. Shared writes/CI respect safety gates; real offline gameplay improvements in the same original demo.html can continue while repository writes are blocked.

## Restore original source and reference

- Original ZIP (ChatGPT Library): `/World Server/Graphics Reference/medieval_world_infinite_pack_v3.zip`.
- Owner target PNG: `/World Server/Graphics Reference/target_pixel_art_reference_2026-10-10.png`.
- The repeated 52×28 map is *not* a unique infinite procedural world; pseudo-3D PNGs are *not* real 3D meshes.
- Preserve `demo.html`, knight identity, WASD/arrows, touch movement, collisions, bridge passability and viewport lock.

## Measured upgrade loop

**BENCHMARK → CONTROL/HOLDOUT → GAP → ONE BOUNDED CODE CHANGE → RETEST → LEARN → REPEAT.**

Use actual loaded gameplay captures with fixed seed/route/camera/zoom: village → road → bridge → forest → mine, plus one reserved scene not used during candidate tuning. Evaluate water/shore and cliff forms, organic terrain, trees and asset variation, paths/bridges, shadows, depth, ambient animation and coherent composition. Select 1–3 highest-impact gaps and implement just one owned slice per cycle. Reuse `lib/reference-visual-autotune.js`, `lib/reference-visual-compiler.js` and `lib/reference-fidelity.js`; the callback-based autotuner does not write code or invent a renderer automatically. No paid API. Verify source asset licenses and memory costs.

| Independent Fleet criterion | Maximum |
|---|---:|
| Organic terrain / water / cliffs | 20 |
| Coherent pixel-art assets / style | 25 |
| Lighting, depth, shadows | 20 |
| Composition / scene density | 15 |
| Runtime-visible animation | 10 |
| Traversal / readable controls | 10 |

Require >=85/100 overall **and** >=75% of each axis, zero critical regression, desktop+mobile game smoke, same-camera before/after and holdout screenshots, FPS and loading evidence. No measured evidence -> **UNKNOWN**. The executable `node scripts/check-graphics-evolution.cjs` validates honest policy/evidence structure; it cannot replace independent visual judgement. `node --test test/graphics-evolution-policy.test.js` must pass.

## First executable implementation

Remove square grass/river/road/cliff joins in the same game; increase legitimate coherent foliage, flowers, rocks and reeds; animate water, trees, torches and waterfall; capture real playable before/after. Keep last-known-good playable on fail. Plans and task prompt edits do not count as a graphical improvement. Two cycles without visible delta -> TASK_STARVATION and switch strategy family.

## After benchmark passes

Even when independent Fleet score passes, await **user PASS** after a playable MVP. Only then activate `NEXT_VISUAL_EVOLUTION` at the same 50/50 ratio: lighting/time-of-day, weather, seasons, wildlife, waves, detailed materials, richer motion and new biomes, one measured non-regressing slice per cycle. Test transferred improvement on an unseen scene, not just reference memorization.

## Existing roles only

Builder changes actual game and publishes evidence; Architect prioritizes and watches quota; Fleet independently scores gameplay before/after; Ocean handles guarded merge and post-release evidence; SRE observes queues/CPU/FPS/memory and time ledger read-only. New work and failures persist in issue #80, not in noisy standalone report PRs.
