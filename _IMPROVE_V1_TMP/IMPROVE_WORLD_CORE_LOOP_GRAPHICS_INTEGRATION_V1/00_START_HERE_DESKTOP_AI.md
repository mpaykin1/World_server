# 00 START HERE — Desktop AI

## Mission
Integrate `IMPROVE_WORLD_CORE_LOOP_GRAPHICS_INTEGRATION_V1` into the current `World_server` without deleting/simplifying any accepted graphics, controls, collision, mobile behavior, API contract, quality gate or existing AI3D backend. The end state is one capability graph in which **every questionnaire answer produces a visible world change**, and advanced systems progressively enrich the same derived world-state.

## Non-stop rule
Do not stop at the first PASS. For every failing unit/E2E/browser/network/runtime/CI/deployment check: capture evidence -> find root cause -> fix root cause -> add regression protection -> rerun failed check -> rerun parent gate -> continue until there are zero mandatory failures. An external blocker must be documented precisely and forbids a 100% claim.

## Installation order
1. Update/checkout current `master`; record HEAD. Ensure worktree is clean.
2. Run: `node install.cjs <World_server>`. This is audit-only. Compare with `docs/CURRENT_MASTER_GRAPHICS_AUDIT.md`; newer master wins.
3. Run: `node install.cjs <World_server> --apply --phase=A`. This creates a task branch if needed, installs the Answer->World foundation and low-conflict missing modules.
4. Run all new core and module checks. Fix until green.
5. Run: `node install.cjs <World_server> --apply --phase=all` to stage/install remaining compatible global pipelines. Already-installed sentinels are skipped. Manual guarded modules remain staged with explicit instructions rather than being forced unsafely.
6. For Ink Glyph after base install, execute its OSS/font/stroke bootstrap from the installed module instructions; verify licenses/hashes.
7. For APNG V3 on Windows use its PowerShell installer from staged payload, then Chromium+Firefox+WebKit gate.
8. Integrate Pixel 3DGS Phone/4D and Video2Game Voxel as persistent worker capabilities, not Vercel serverless heavy jobs. Run their full regression suites before exposing routes.
9. Run `npm run iw:graphics:audit`, module-specific gates, `npm run quality:impact`, `npm run release:gate`. Do not weaken existing gates.
10. Browser matrix: desktop Chromium/WebGL2; available WebGPU; forced fallback; iPhone/Safari or equivalent real-device evidence; Android/Chrome if available; portrait+landscape; touch+mouse+keyboard.
11. Critical UX test: start from empty/base world; submit >=20 answers of different types. **Every answer must change at least one visible channel**, with no full page reload and no mandatory login before the first wow.
12. Measure actual p50/p95: answer->first paint, answer->meaningful world change, interaction readiness. Targets: <=300 ms immediate, <=1.5 s p95 meaningful, <=3 s interactive. Report measured numbers, not claims.
13. Privacy regression: raw answer text must not appear in shareable world-state, merge payload, analytics event, public DOM data attributes or invite URL.
14. Merge test: combine derived world states only. Raw questionnaires remain private.
15. Commit in small checkpoints, push task branch, open PR, verify CI + Preview. Promote only after all mandatory evidence is green.

## Mandatory invariants
- Existing working production route is not overwritten before preview evidence.
- No duplicate global FPS/LOD controller: `WorldQualityAutopilot` stays authoritative.
- External AI3D/GPU worker outage cannot delay the first visible answer reaction.
- CPU fallback always exists for required flows.
- Do not install superseded versions when a newer selected lineage is present.
- Never silently overwrite Supabase migration history; reconcile exact live migration state first.
- Never claim an optional model/backend active until health/status proves it.
