# WORK IN PROGRESS — Real multi-AI execution (agent_implement via OpenCode + Ollama)

## Task
Per the user's explicit follow-up: push capability coverage from 60% toward
90%+ by finding a real, safe local/free AI invocation path (not just a
routing recommendation) and wiring it into the existing typed-task bridge
as one `agent.invoke`-style adapter, with real isolated-worktree execution,
verification, fallback/escalation, and self-healing - extending the
existing Collective Brain architecture, not replacing it.

## Why
The previous round's `route_goal` command could only recommend an agent,
not actually run one - "no safe invocation mechanism was found" for
OpenCode/OpenHuman/AnythingLLM. The user asked for a real audit before
accepting that conclusion, and to build the real thing if one exists.

## Current state
- **Real audit before writing anything** (not assumed): Ollama IS installed
  and running locally (`http://127.0.0.1:11434`, 6 real models). OpenCode
  CLI IS installed with **zero paid credentials configured**
  (`opencode providers list` -> 0 credentials) - it can only reach its own
  free hosted models (`opencode/*-free`). AnythingLLM is confirmed **not**
  installed anywhere on this machine (no binary, no AppData config) - no
  adapter built for it, its capability entry stays for routing/
  documentation only. OpenHuman has a config file but its backing service
  (agentmemory on 127.0.0.1:3111) is not running, and OpenHuman itself is a
  workflow/memory orchestrator, not a single-shot task CLI - no safe
  invocation surface found, none built.
- New `lib/agent-adapters.js`: real adapters for the two tools that do have
  a safe surface -
  - `queryOllama()`: local, zero-network-egress Q&A/analysis via a
    non-'thinking' model (see the ollama-thinking-models finding below for
    why the default isn't the largest available model).
  - `implementGoal()`: real code-editing execution via OpenCode CLI's
    non-interactive `run` mode against a free model, in an isolated
    worktree, with `npm run check` verification and fallback across 3 free
    models before returning `needsEscalation:true` (never auto-invokes a
    paid model - no safe recursion/cost-tracking mechanism was built for
    that, matching this whole design's "typed capability, not arbitrary
    execution" principle).
  - `createIsolatedWorktree`/`removeIsolatedWorktree`/`isWorktreeHealthy`/
    `repairWorktreeIfCorrupted`: worktree lifecycle + self-healing
    (corrupted worktree detected via `git status` failing, repaired by
    removing and letting a fresh `create_worktree` replace it).
- **Two real security/reliability bugs found and fixed while building
  this**, both registered in `data/error-prevention-registry.json`:
  1. The first implementation put the task's own `goal` text directly into
     a `spawnSync(...,{shell:true})` argv array (Node's own DEP0190
     warning flagged this) - a real shell-injection surface for a
     remote-influenced argument. Fixed by never putting free-form text in
     argv at all: the goal is written to a temp file and handed to OpenCode
     via `-f <file>` with a fixed literal instruction as the positional
     message - verified this still reads and acts on the file correctly.
  2. `spawnSync`'s own `timeout` option does not reliably kill a Windows
     process tree that goes through a `.cmd` shim (`opencode.cmd` ->
     `opencode.exe`) - reproduced live (an orphaned `opencode.exe` kept
     running minutes past a 90s timeout). Fixed with `runWithTreeKill()`:
     async `spawn` + a manual timer that calls `taskkill /PID <pid> /T /F`
     on expiry and only resolves once the real process exit event fires -
     verified against a genuinely infinite `ping -t` process (killed
     cleanly at the configured timeout, zero orphans).
- New typed commands wired into `scripts/collective-brain-remote-bridge.cjs`
  and `data/collective-brain/remote-task-commands.json`: `create_worktree`,
  `remove_worktree`, `inspect_worktree_diff`, `agent_implement`,
  `agent_autofix` (re-runs `npm run check`, and if it fails, feeds the real
  failure output to `agent_implement` to fix the root cause),
  `prepare_commit_and_pr` (commits + pushes + opens a real PR - gated in
  `collective-brain-policy.json`'s `approvalRequiredOperations` exactly
  like `apply_patch`), `ai_query` (Ollama Q&A). Per-worktree lease
  (`agent-invoke:<hash>`) stops two `agent_implement`/`agent_autofix` calls
  editing the same worktree concurrently.
- Supabase `world_remote_tasks.command` CHECK constraint extended for the 6
  new commands (migration `world_remote_task_bridge_v4_agent_invoke_commands`).
- **39 new/updated regression tests** across `test/agent-adapters.test.js`
  (18, incl. real worktree lifecycle, real corruption detection/repair,
  real argv-injection-safety assertion, model-allowlist rejection, and 2
  live tests against the real Ollama/OpenCode installs - the OpenCode one
  is opt-in only, see below) and 4 new tests in
  `test/collective-brain-remote-bridge.test.js` for the new command
  routing and PR-prep gating. Full suite: 178/179 pass, 1 skipped by design.

## Target state
`agent_implement` is a real, safe, verified typed capability: Browser
ChatGPT can hand it a goal, get a real free-model-executed, verified diff
back (or an honest `needsEscalation` if the free tier couldn't do it), with
zero new secrets and zero shell exposed to the remote side.

## Files / systems involved
- `lib/agent-adapters.js` (new)
- `scripts/collective-brain-remote-bridge.cjs` (6 new command handlers)
- `data/collective-brain/remote-task-commands.json`,
  `data/collective-brain/collective-brain-policy.json`
- `data/error-prevention-registry.json` (3 new entries)
- `test/agent-adapters.test.js` (new), `test/collective-brain-remote-bridge.test.js`

## Known risks
- `agent_implement`'s free-tier models genuinely struggle against this
  repo's full size within a normal timeout budget - see "Errors that must
  not return" and the real E2E result below. This is a capability/latency
  limit, not a safety issue: every failure mode observed (timeout on all 3
  models) resolved cleanly with `needsEscalation:true`, no hang, no
  orphaned process, no false success.
- `prepare_commit_and_pr` reaches the public GitHub repo - gated behind
  `COLLECTIVE_BRAIN_HUMAN_APPROVED=1`, same as `apply_patch`.

## Golden systems that must be preserved
Untouched - no app/game code was actually committed by this task's E2E
test (the free models timed out before producing a mergeable diff; the
attempt worktree was created, exercised, and cleanly removed).

## Errors that must not return
- The goal-text-in-argv shell injection surface (fixed - see above).
- `spawnSync` timeout not killing a Windows `.cmd`-shimmed process tree
  (fixed via `runWithTreeKill` - see above; noted but NOT yet applied to
  the pre-existing `collective-brain-remote-bridge.cjs` helpers merged in
  PR #18/#22, which use the same vulnerable pattern for `npm run <script>`
  - flagged as a real follow-up, not silently left undocumented).
- A large real-repo `agent_implement` call silently reporting success
  without actually verifying, or hanging forever instead of exhausting its
  fallback chain and reporting `needsEscalation` honestly.

## Exact patch / change plan
New `lib/agent-adapters.js` and `test/agent-adapters.test.js`; 6 new
command definitions + policy gate entry; 6 new `executeTask` branches in
the bridge; 1 Supabase migration; 3 new `error-prevention-registry.json`
entries; 4 new tests in the existing bridge test file. No other files
touched.

## Tests to run
- `node --test`: 178/179 PASS, 1 skipped (`AGENT_ADAPTERS_LIVE_OPENCODE_TEST`
  opt-in gate - see "Final evidence" for why this one isn't run
  unattended).
- `node scripts/check-golden-standard.js`: PASS.
- `node scripts/check-desktop-ai-protocol.js`: PASS.
- `node scripts/project-quality-reviewer.js`: blockers=0.
- Full `npm run release:gate`: to run before push.
- Real E2E (see Final evidence): `create_worktree` -> `agent_implement`
  (real goal: add `viewport-fit=cover` to
  `apps/ai3d-voxel-city/index.html`, a real, already-tracked candidate
  issue) -> `inspect_worktree_diff` -> `remove_worktree`, against a real
  full-size World_server worktree, not a throwaway probe.

## Deployment / PR plan
`ai/desktop/agent-invoke-multiai` -> `master`. Merge once this PR's own
checks are green (pre-existing unrelated Playwright red on master,
reconfirmed against master's current HEAD at PR time, acceptable per
established precedent).

## Current progress
Fully implemented, tested (unit + live), and E2E-verified (with an honest
non-success outcome on the full-repo case, and a real success on the
underlying mechanism during development against a throwaway repo - see
Final evidence for both). Not yet committed at the time this entry was
written.

## Next action
Run full `release:gate`, commit, push, open PR, wait for CI, merge. Then
produce the final coverage report per the user's requested format.

## Completion criteria
PR merged; `agent_implement`/`agent_autofix`/`ai_query`/worktree lifecycle
commands genuinely callable and correctly gated; real E2E evidence
(success or honest failure, never simulated) recorded here and in the
final report.

## Final evidence
- **Underlying mechanism proven working** (development-time, throwaway
  single-file repo, multiple runs): `implementGoal()` correctly read and
  edited a file via `opencode/mimo-v2.5-free` in seconds, produced a real
  verified diff, and reported real token/cost accounting
  (`tokens.total:25075, costUsd:0`) via OpenCode's own `--format json`
  step-finish events.
- **Real E2E against the actual, full-size World_server repo** (not a
  throwaway probe): `create_worktree` -> real isolated worktree created
  off `origin/master`. `agent_implement` given the real, already-tracked
  candidate issue (`auto-505f975e75a0` in this same registry file -
  `viewport-fit=cover` missing in `apps/ai3d-voxel-city/index.html`,
  confirmed present, confirmed the correct fix by checking the same
  pattern already used in `apps/voxel-world/index.html` and
  `apps/dark-void-scene/index.html`). Result: all 3 free models
  (`opencode/mimo-v2.5-free`, `opencode/nemotron-3.5-lightning-free`,
  `opencode/ling-3.0-flash-fin-free`) timed out at 280000ms each (~14
  minutes total) against the full repo context. `implementGoal` correctly
  returned `{ok:false, needsEscalation:true, attempts:[...]}` with full
  per-model diagnostics - not a false success, not a hang.
  `inspect_worktree_diff` confirmed a clean, empty diff (no partial/
  corrupted state left behind). `remove_worktree` cleaned up successfully.
  This is registered as `opencode-free-tier-timeout-on-full-repo-context`
  in the error-prevention registry - a genuine capability/latency
  boundary of the current free tier on this hardware against a repo this
  size, reported honestly rather than retried until a lucky success or
  silently claimed as working.
