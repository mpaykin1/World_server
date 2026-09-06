# CLOUD AI HANDOFF — World Graph + RUN_072 production port

`World_server` is cloud-first. Use the existing GitHub repository and existing Google AI Studio/Cloud Run publication. Do not create a second project, service, repo, runtime, or coordinator. Desktop is only a bounded coordinator and must not receive worktrees, caches, logs, builds, or archives.

## Patch-to-World continuation contract

The merged Patch-to-World graph is at commit `7da54475f053463b590c25fd5f1f722f7a3d52a1`. Its reusable core is `lib/world-graph.js`, ingestion is `scripts/ingest-world-patches.js`, manifests are in `data/world-manifests/`, and the read-only API is `GET /api/worlds`. Ingestion is deterministic/idempotent, preserves revisions/history and portal edges, and re-evaluates `data/app-release-registry.json` at request time so public output remains deny-by-default. Do not bypass that registry or replace existing catalog/runtime systems.

Every incoming patch must be classified truthfully as `ALREADY_INTEGRATED`, `SUPERSEDED`, `PARTIAL`, `MISSING`, `CONFLICT`, or `WORLD_ONLY`; preserve source SHA, patch family, revision, and manifest hash. Do not overwrite newer bridge-only changes. Feed ZIP metadata/content through the existing Library/backlog handoff and existing remote-task bridge rather than requiring manual folder moves.

Source patch commit: `f30efebe6021b9dd5fd231840934c4764bfbc8eb`.
Production target: `https://world-server.ai.studio`.
Base: current `origin/master` only. Do not merge the old divergent RUN_072 branch.

## Included
- RUN_062/066/071 minimal science dependencies required by RUN_072.
- RUN_072 script and focused test.
- Immutable `SCIENCE_RUN_072_H2.json` evidence (`pass:true`).
- Exact RUN_072 error-prevention registry entry merged into the current registry.
- `GET /api/science-run072` for production/browser/cloud read access.
- Existing remote-task bridge allowlist: read evidence + rerun RUN_072 by scriptId.

## Cloud continuation
Run full CI/release checks in GitHub/cloud, not on the user's PC.
After merge, sync/publish the existing production project; do not create another repo/project.
Verify `GET https://world-server.ai.studio/api/science-run072` returns HTTP 200 and `evidence.pass=true`.
If deployment is quota-blocked, record the blocker and retry in cloud; do not compensate with heavy local work.

## Local policy
Browser/cloud first. Local AI is coordination/minimal bridge only.
No Desktop clones/worktrees/logs/caches/builds/ZIPs. Temp data stays off Desktop and is removed promptly.
Do not launch local LLMs or heavy suites while cloud CI can perform the work.
