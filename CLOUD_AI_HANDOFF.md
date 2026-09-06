# CLOUD AI HANDOFF

## Purpose
`World_server` is cloud-first. Desktop AI should do only the minimum work required to make a task available to browser/cloud agents, then coordinate rather than continue heavy local execution.

Production entry point: `https://world-server.ai.studio`
Source of truth: existing GitHub repository `mpaykin1/World_server`.

## Verified Google AI Studio publication identity

- Existing authenticated AI Studio app: `World_server`
- App URL: `https://aistudio.google.com/apps/a4f7cd27-2a1c-41ac-9dbf-378b09e0eb39?showPreview=true&showAssistant=true`
- AI Studio app ID: `a4f7cd27-2a1c-41ac-9dbf-378b09e0eb39`
- Google Cloud project shown by the app: `gen-lang-client-0576616033`
- App metadata says: `Imported from GitHub repository mpaykin1/World_server`.
- This is the existing project/publication control path. Do not create another AI Studio app/project.
- AI Studio settings currently exposes `GitHub` sync only as `Force push to mpaykin1/World_server`; never use that direction for this task because it would overwrite current master with stale app code.
- AI Studio `Versions`/publication panel currently reports `Quota exceeded`; this is an account/platform quota condition, not a code failure.
- Current official Build Mode documentation (last updated 2026-08-20): https://ai.google.dev/gemini-api/docs/aistudio-build-mode . It states that linked GitHub apps support two-way sync and that Cloud Run deployment updates the app externally.

## Mandatory execution order
1. Inspect the current branch/commit and existing architecture.
2. Reuse existing systems; do not create a second repo, second AI Studio project, second coordinator, or duplicate service.
3. If a patch starts on the user's PC, make the smallest safe integration needed to commit/push it.
4. After push, move implementation/review/testing to browser/cloud whenever possible.
5. Use existing CI/cloud systems for heavy tests, builds, audits and long-running verification.
6. Keep Desktop/local work bounded, low-impact and reversible.

## Local computer protection
- No AI-generated worktrees/clones/logs/caches/builds/archives on Desktop.
- Prefer `%LOCALAPPDATA%\WorldServerAI\` and existing off-Desktop worktrees for unavoidable local temporary work.
- Do not launch local LLMs when a cloud agent can do the task.
- Do not start duplicate workers/recovery loops.
- Check RAM/disk/process pressure during long work and offload if the machine slows down.
- Delete only proven task-owned disposable artifacts; never unknown/user files.

## Coordinator responsibilities
- Prefer already-available cloud/browser agents and GitHub/CI over local compute.
- Use `scripts/master-coordinator.cjs` and the existing collective-brain/reporting/lease mechanisms instead of inventing a parallel dispatcher.
- Split large goals into small independently reviewable cloud tasks.
- Avoid duplicate assignments unless a deliberate independent review is useful.
- Collect results, compare them, integrate the best verified solution, and record root causes/regression protection.
- Keep machine-readable task state in the repository/shared coordination state so another agent can continue without rereading the whole project.

## Patch handoff contract
For every new patch committed for cloud continuation, record commit/branch, changed files, completed work, remaining work, checks, blockers, and affected production URLs.

## RUN_072 production port
Source patch commit: `f30efebe6021b9dd5fd231840934c4764bfbc8eb`.
Merged production-port commit: `342911650c0aac60de0ee49f346777c340711069` (PR #47, now in `master`).
Base: current `origin/master`; never merge the old divergent RUN_072 history.
Included: minimal RUN_062/066/071 dependencies, RUN_072 script/test, immutable `SCIENCE_RUN_072_H2.json`, and exact registry protection.
Production read endpoint: `GET /api/science-run072`.
Existing remote-task bridge access:
- read evidence: `inspect_logs` with `SCIENCE_RUN_072_H2.json`;
- verify RUN_072: `run_existing_script` with scriptId `science-run-072`.

## Cloud continuation
Run full CI/release checks in GitHub/cloud, not on the user's PC.
After merge, sync/publish the existing production project; do not create another repo/project.
Verify `GET https://world-server.ai.studio/api/science-run072` returns HTTP 200 and `evidence.pass=true`.
Current independent probe: root `https://world-server.ai.studio` returns `302` to `/apps/dark-void-scene/`, then `200`, `Server: Google Frontend`; Navigator browser smoke passes. The endpoint currently returns `404`, proving the existing AI Studio publication is stale relative to merged master.

## Exact resync/publish steps for an authenticated browser/cloud agent

1. Open the existing app URL above while signed in as the owner account.
2. Confirm the app title is `World_server`, source text is `Imported from GitHub repository mpaykin1/World_server`, and Google project is `gen-lang-client-0576616033`.
3. Do not click `Force push to mpaykin1/World_server`; that is AI Studio→GitHub and risks reverting master.
4. Use the existing app's supported GitHub import/reload/version control path, if it becomes available after quota recovery, and select the default `master` branch at commit `342911650c0aac60de0ee49f346777c340711069`.
5. Publish/update the existing app to the already-live `world-server.ai.studio` custom domain. Do not create a new app, project, domain, or Vercel deployment.
6. If the UI has no pull/reimport action, use the existing AI Studio app's code/import support to refresh the current `master` contents; preserve `api/science-run072.js`, `SCIENCE_RUN_072_H2.json`, and `data/collective-brain/remote-task-commands.json`.
7. After publication, run these independent probes:
   - `curl -i https://world-server.ai.studio/api/science-run072` → `200`;
   - parse JSON and assert `.run == RUN_072`, `.sourceCommit == f30efebe6021b9dd5fd231840934c4764bfbc8eb`, `.evidence.pass == true`;
   - open `https://world-server.ai.studio/apps/dark-void-scene/` in a fresh browser context and verify Navigator renders with no fatal console errors.
8. Record the AI Studio publication/version identifier, timestamp, live response headers, endpoint JSON result, and browser smoke result back into this handoff or the existing evidence system.

The merged GitHub PR and all available GitHub workflows are already green. Remaining work is specifically synchronization/publication of the existing Google AI Studio app; do not treat Vercel checks or the Vercel homepage as proof of this Google-hosted domain.

## Exact current UI observation / smallest blocked action

On the authenticated existing app URL, Settings → GitHub currently shows only “Sync to a new repository” and “Force push to mpaykin1/World_server” (with a warning that master would be overwritten); no “Pull changes” control is currently exposed. Settings → Publish remains at “Loading publication state” while the app reports “Quota exceeded”. Do not click either destructive/new-repository option. The smallest safe authenticated action is: after quota/access recovers, reconnect or enable the existing GitHub two-way binding for `mpaykin1/World_server` inside this same app, choose Pull changes from `master`, then use the same app's Publish/Cloud Run update control. This is not permission to create a new app/project/slot.

## Completion rule
Local work is complete when the minimal safe patch is committed/pushed and cloud agents have enough context to continue.
Cloud agents must preserve graphics/gameplay quality, fix root causes, add regression protection, and never weaken working visuals merely to make tests pass.
