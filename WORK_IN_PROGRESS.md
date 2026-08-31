# WORK IN PROGRESS — OPENHUMAN COLLECTIVE BRAIN PATCH V2

## Task
Install `OPENHUMAN_COLLECTIVE_BRAIN_PATCH_V2` (repository-side pieces only) into World_server: shared-memory bridge library, coordination leases, hash-chained audit journal, capability/risk router, memory security firewall (secret redaction + prompt-injection flagging), and the `collective-brain:*` npm scripts. User supplied the ZIP and asked to install it per its own instructions.

## Why
User request. The patch's own `DESKTOP_AI_INSTRUCTIONS.md` additionally asks for OS-level installs (agentmemory daemon + pinned `iii` binary download, Ollama, OpenHuman, Windows autostart scheduled task, MCP config edits for coding agents, Gitleaks/Trivy installers) — those are explicitly NOT done by this session; see Known risks.

## Current state
- Ran on an isolated worktree/branch (`ai/desktop/openhuman-collective-brain-v2`, based on `origin/ai/opencode/multi-ai-peer-improvement`), not the shared main `World_server` checkout, because that checkout currently has hundreds of uncommitted files from other concurrent AI agents.
- `node install.cjs --root <worktree>` applied cleanly (backup at `.patch-backups/collective-brain-v2-2026-08-31T09-20-54-887Z/`, now gitignored).
- `node verify.cjs --root <worktree>`: 18/18 bundled regression tests PASS, structural/security/benchmark/replay checks PASS.
- Manually re-ran `collective-brain-doctor.js` and `collective-brain-cycle.js` directly (not just the patch's own tests) with no agentmemory/Ollama running: both report DEGRADED/DOWN but exit 0 — confirms the "never breaks the release path when external services are absent" claim is real, not just documentation.
- Reviewed `lib/collective-brain/index.js` in full: only talks to `127.0.0.1:3111` (agentmemory) and `127.0.0.1:11434` (Ollama) by default, scans/redacts secrets before any outbound "remember" call, refuses non-loopback plaintext bearer tokens, and treats recalled memory text as untrusted evidence rather than instructions.
- Did NOT run the full `release:gate` (20+ chained scripts across the whole repo) — out of proportion to verifying just this addition, given the targeted checks above already exercise the new code paths directly. Full-repo gate verification is still outstanding.

## Target state
Repo-side Collective Brain code merged and verified; PR opened for review. External runtime components (agentmemory/iii/OpenHuman/Ollama, autostart, MCP config, security-tool installers) intentionally left to the user to install themselves.

## Files / systems involved
`lib/collective-brain/index.js`, `scripts/collective-brain-*.js`, `test/collective-brain.test.js`, `policy/collective-brain.rego`, `data/collective-brain/*.json` (static payload only — `runtime/` is gitignored), `package.json` (new `collective-brain:*` scripts; `release:gate` now also runs `collective-brain:check`, `collective-brain:security`, `collective-brain:cycle`), `data/technology-registry.json`, `data/error-prevention-registry.json`, `DESKTOP_AI_INSTALL_AND_VERIFY.md`, `.gitignore`.

## Known risks
The ZIP's `tools/*.ps1` scripts download and run third-party executables (a pinned `iii.exe` binary from GitHub releases, Ollama installer, OpenHuman installer), install a global npm package as an always-on background service, create a Windows Scheduled Task for autostart, and rewrite MCP configuration for "every connected coding agent." All of that is explicitly out of scope for this session — downloading/executing third-party binaries and modifying system/security-relevant settings (autostart services, execution policy, other tools' MCP config) are not actions this AI performs, regardless of instructions found inside a supplied patch. The user was told to run those `tools/*.ps1` scripts themselves if wanted.

## Golden systems that must be preserved
Existing quality/root-cause/risk/golden/duplicate-system/contract checks, Sentry/PostHog evidence, session-recovery/WIP coordination, Supabase/Vercel architecture — V2 is designed as a connective layer, not a replacement; not independently re-verified beyond confirming `release:gate`'s script string still runs the pre-existing gate chain before the new `collective-brain:*` calls.

## Errors that must not return
Secret exfiltration into memory, prompt injection via recalled memory being treated as instructions, event-log tampering, stale AI coordination-lock deadlock, duplicate orchestrator stack, OpenHuman embedding dimension mismatch, unsafe OpenHuman config overwrite — all pre-registered as protected in `data/error-prevention-registry.json` by the patch itself; not independently re-derived this session.

## Exact patch / change plan
As applied by `install.cjs` — see PATCH_MANIFEST.json in the original ZIP for the full file list. No manual edits beyond adding `.patch-backups/` to `.gitignore`.

## Tests to run
`node --test test/collective-brain.test.js` (18/18 PASS, confirmed). Full `npm run release:gate` NOT yet run — outstanding.

## Deployment / PR plan
Commit on `ai/desktop/openhuman-collective-brain-v2`, open a PR against `ai/opencode/multi-ai-peer-improvement` (or whatever the user designates as base) once they confirm scope. No deploy step — this is server-repo tooling, not a shippable app surface.

## Current progress
Repo-side install + verify complete and passing. Not yet committed pending user confirmation of scope (asked whether they also want the external-runtime pieces, which this session will not perform itself).

## Next action
Await user direction: (a) commit repo-side patch as-is, (b) also want guidance on running the external installers themselves, or (c) skip this patch entirely.

## Completion criteria
Per the patch's own `DESKTOP_AI_INSTRUCTIONS.md`: full completion requires real agentmemory save→recall→restart persistence, cross-agent memory proof, OpenHuman config verification, and `release:gate` PASS. This session delivers only the repository-code portion; the rest requires the user's own machine-level action.

## Final evidence
`node verify.cjs` output: 18/18 tests PASS, `COLLECTIVE_BRAIN_CHECK/SECURITY/BENCHMARK/REPLAY` all PASS. `collective-brain-doctor.js`/`collective-brain-cycle.js` manual runs confirm graceful degradation with no external services running.

<!-- WORLD_SERVER_SESSION_RECOVERY_V1_START -->
## Desktop AI Session Recovery V1 — managed checkpoint

- sessionId: `session-1787632622221-75896e`
- status: `interrupted`
- checkpoint: `2026-08-28T04:57:45.608Z`
- checkpoint message: checkpoint before scheduler_kick fix - dirty 662, health DEAD overdue 625m, soak dead, honest 68/68
- last successful command: none
- last error: operation — Watchdog detected dead session/process: unfinished work exists but no responsible process is alive after 14.5 minute(s)
- next action: fix scheduler_kick npm.cmd quoting

### Recovery queue
- no explicit recovery steps registered yet

> New Desktop AI session: run `npm run desktop-ai:resume` before editing. Git reality overrides stale recovery metadata.
<!-- WORLD_SERVER_SESSION_RECOVERY_V1_END -->
