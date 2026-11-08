# World Server 2.0 — TARGET-FIRST migration and modernization (2026-10-16)

**Status:** LIVE_METADATA_VERIFIED / REBUILD_NOT_STARTED / SOURCE_AND_TARGET_DATA_UNPROVEN / NO_CUTOVER.  
**Owner verdict:** PENDING (only the owner may choose PASS or FAIL).  
**PR:** #514, branch `ai/supabase-owned-migration-20261016`.  
**Intent:** Use the existing owner-controlled Supabase **world-server-preview** as the new foundation. **Do not create a second paid or empty project.**

## Owner scope override — 2026-10-16 07:01 UTC

The owner explicitly prioritizes **GRAPHICS, ANIMATION and FPS** over preserving legacy Supabase data.
Old-world history, player save data and AI-learning database memory are **NOT migration acceptance criteria**.
We must reuse recovered source code, lessons, validated visuals, shaders, art workflows and compatible open-source assets; if a needed runtime is unavailable, recreate a better *original or properly licensed* implementation, benchmarking against the prior game. Do not confuse a user-discarded *database data-migration requirement* with permission to delete either database or other people's files.

Immediate direction:
- Do not block visual/FPS work on obtaining the old Postgres password, Auth mapping, history copying, source `pg_dump`, or target full parity with legacy DB.
- Use the existing owner-controlled Supabase TARGET if backend is needed, but **visual experiments and frame benchmarks must run independently of Supabase**; do not set up another engine or paid provider.
- Prioritize improvements as visual reference fidelity, animation smoothness, and **real frame performance** (median, p95, 1%-low, frame spikes) on desktop + iPhone 11 class mobile. Capture before/after on fixed seed/viewport/camera/scenes; retain the real source of measurements and control hardware.
- Prefer reuse of legally compatible OSS libraries/assets (CC0/MIT/BSD/Apache-2.0) over rewriting existing proven code. Verify repo revision, code and art license separately; preserve attribution, do not blindly copy from closed reference screenshots.
- Use `world-server-tech-lab` capability registry and live checkpoints for measured experiments, not unverified imagined integrations. Keep existing project architecture and old production immutable until verified release.
- Visual score 85%+ must come from evidence of real user-visible improvement, not formulaic declaration. Do not hand out testing links as if confirmed before visibility/reliability gates pass. Owner alone sets PASS or FAIL; learning outcome commits only after that verdict.
- This owner message **supersedes** previous requirements below about preserving legacy worlds/accounts and completing old schema/data parity. Historic migration notes remain evidence, not current blockers.

## Independently verified evidence

SOURCE `iphfwxjuhsucvdyluink`, accessible through the legacy Supabase MCP integration, queried read-only on 2026-10-16:
- PostgreSQL 17; about 518 MB; `public=113` tables, `private=38`, `auth=27`, `storage=8`.
- This is catalogue/SQL visibility, **not** a native full dump and not permission to overwrite or disable the old production.
- SOURCE holds world saves, voxel events, Chain Reaction history, orchestration, quality learning, gap closure, factory records and Auth data. These may carry unique state.

TARGET `xlcdnlsyvxqtopmkweiy`, **existing** `world-server-preview`, org `ayoxcnfmwbpmvwhdeljs`:
- Supabase Management API and read-only SQL **PASS**, project `ACTIVE_HEALTHY`; 32 `public`, 0 `private`, 27 `auth`, 8 `storage` tables. All 32 TARGET public tables have RLS **enabled**. This does not prove that policies are correct.
- Evidence: [GitHub Actions live TARGET schema probe run 38864102236](https://github.com/mpaykin1/World_server/actions/runs/38864102236). Only names, counts and RLS flags were read; no user rows.
- TARGET native PostgreSQL session connection `WS_TARGET_DATABASE_URL` exists as a GitHub Secret but was rejected (`PASSWORD_REJECTED`) after TLS CA was repaired. Repeated retry alone did not fix it. Do not reset passwords again blindly. The separate Management API PAT works.
- `WS_SOURCE_DATABASE_URL` is absent from GitHub Actions; legacy MCP source SQL access must not be mislabeled native backup access.

**Structural comparison (public tables only):** 15 names shared; 17 TARGET-only; 98 SOURCE-only.
- Shared: `chat_messages`, `game_player_states`, `game_world_state`, `merges`, `profiles`, `quality_telemetry`, `sharabass_objects`, `stories`, `survival_buildings`, `survival_resource_states`, `voxel_block_overrides`, `voxel_player_states`, `voxel_worlds`, `world_remote_tasks`, `worlds`.
- TARGET-only: `world_chat_messages`, `world_community_reports`, `world_feature_votes`, `world_feedback`, `world_feedback_development_candidates`, `world_feedback_embeddings`, `world_feedback_resolution_v6`, `world_function_catalog`, `world_function_events`, `world_function_installations`, `world_function_requests`, `world_game_design_evidence`, `world_game_design_specs`, `world_rate_limit_buckets_v6`, `world_translation_cache`, `world_translation_corrections`, `world_translation_terms`.
- SOURCE-only includes `world_canon_events`, `voxel_world_events`, `voxel_region_revisions`, `chain_reaction_world_members`, `chain_reaction_private_events`, `gap_closure_evidence`, `gap_closure_runs`, `procedural_quality_learning`, `pixel_animation_profiles`, `factory_*`, orchestration and queues. No table or field equality is inferred from name equality.

## Target-first delivery contract

1. **Keep the new project; no second Supabase project and no paid add-ons.** Continue using existing Management API read-only tools for inventory while native credentials are unresolved.
2. **Protect both worlds.** Before any DDL, `DELETE`, imports, grants, Auth changes, Edge deployment, cron startup or optimization on TARGET, obtain a full recoverable TARGET backup and demonstrate isolated restore. Source remains untouched. Never mistake a query count, TOC list or local fixture for proof of a recoverable live database.
3. **Preserve target innovations.** Existing `world_*` feedback/function/translation/design subsystems are independent; no blanket restore over them. Use additive, versioned migrations and deterministic mapping, never drop-and-recreate.
4. **Fresh visual/runtime foundation, not legacy state import.** Legacy DB saves, world history and AI training-memory are out of scope by explicit owner decision; use independently licensed/recovered renderers, animation controllers, assets and prior benchmark knowledge. Do not delete historical data; no need to rebuild the old database schema in TARGET.
5. **Modernize on TARGET only**, once backed up: profile real slow queries and p95, remove only proven redundant indexes with dependency review, fix RLS/ACL issues, bound cron/queues and retention, consolidate duplicate workers, secure credentials and indexes, improve browser/Telegram parity. Do not claim improvements from LOCAL_FIXTURE benchmarks.
6. **Visual/FPS acceptance before production:** build scenes with reference fidelity, motion continuity and measured FPS; prove desktop + simulated mobile baseline then physical iPhone 11. Capture comparable before/after frame time (median/p95), frame stalls, image checks and memory footprint. No unearned 85% visibility or performance claims. Confirm baseline features work; Auth, migration-history and AI database-memory parity are not prerequisites for this visual experiment.
7. **Owner-only final decision:** preserve `DRAFT / NO_CUTOVER / OWNER_VERDICT_PENDING` until owner evaluates a working test artifact. Commit PASS or FAIL learning **only after their explicit verdict**.

## Next executable work, independent of the old password

- Expand the existing read-only TARGET probe to report schema, RLS, live catalogue and safe advisory metadata; run the exact-head GitHub Actions proof. This has begun in PR #514; **do not create a sixth scheduled AKA task**.
- Generate a TARGET-first additive migration plan mapping the 17 new TARGET tables and 15 shared tables to application callers. Add regression tests against destructive SQL, unexpected table deletion, unsafe `public` grants and duplicate runtime workers.
- Separately establish backups and restore rehearsals. Native TARGET `PASSWORD_REJECTED` may be a Supavisor cache or URI/credentials problem; use diagnostic tests, not endless password rotations. Supabase supports optional PostgreSQL temporary/PAT access with explicit project authorization and role mapping; enabling it is a security-affecting action and needs approval.
- Owner confirmed **legacy save/history/AI training-memory are unnecessary to the new version**. No further decision needed on importing them. Existing databases remain intact; do not conflate fresh frontend development with deleting TARGET content.

### Safety invariants

NO SOURCE WRITE; NO PROD CUTOVER; NO TARGET RESET; NO UNBACKED DDL; NO AUTH/ROLE MIGRATION BY GUESS; NO PASSWORDS IN GIT/CHAT/LOGS; NO PAID API/PROJECT; NO SELF-ASSIGNED PASS/FAIL.

This file is a handoff for **any new ChatGPT/Claude/Codex agent**. Read alongside `AI_START_HERE.md`, `docs/SUPABASE_OWNER_MIGRATION_20261016.md` and the latest PR #514 evidence.
