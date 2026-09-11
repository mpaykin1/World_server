# ChatGPT -> World_server Control Contract

This file is a canonical bootstrap contract for any new authorized ChatGPT/AI conversation working on World_server. Read it from the current default branch before starting project-changing work.

## Fresh-chat rule

Do not rely on private memory from an older chat. Discover current project state from `AI_START_HERE.md`, `.ai/project-context-index.json`, this file, current default branch, current open PRs, and canonical issue #80/task ledger.

## Manual Fast Lane

When the user clearly asks to change/fix/add/build something now, classify the work as `MANUAL_FAST_LANE`.

The active chat owns the task end-to-end until exactly one of these terminal states:

- `LIVE_VERIFIED`
- `USER_ACTION_REQUIRED` because a real owner-only action cannot be performed by available authorized tools

These are NOT terminal states: PR created, CI pending, CI failed, merge conflict, merged, deploy pending, deployed, preview ready, tool write succeeded, blocker diagnosed, root cause found, report written.

Required flow:

`implementation -> focused regression -> required CI -> independent Fleet evidence -> safe integration -> deploy/update target -> exact deployed revision verification -> user-facing result`

After every write/state transition, if terminal state is still NO, continue with the next action instead of stopping with a progress report.

## Link Completion Loop

If the user asks to change the project and give/send/show a link so they can test or see the result, activate:

`OUTPUT_REQUIRED=VERIFIED_LINK_ONLY`
`LINK_COMPLETION_LOOP=ON`

The requested output is a working verified link, not a status report.

### Blocker is work

Treat every resolvable blocker as the next subtask:

- CI failure -> diagnose root cause -> fix on the SAME owned PR -> regression test -> rerun exact-head checks
- stale base / merge conflict -> safely refresh the SAME PR -> resolve -> rerun
- deploy failure -> inspect logs/config/source boundary -> smallest fix -> redeploy
- stale/expired preview -> resolve/create a current deployment, preferring stable canonical target
- wrong alias/path/routing -> repair -> redeploy -> verify
- 404/5xx/auth/host error -> reproduce -> root cause -> fix -> verify
- app loads but requested change is absent -> find SHA/deployment mismatch or functional failure -> continue until requested delta is visible
- browser smoke failure -> fix runtime/UI/viewport/control issue; HTTP 200 alone is insufficient
- exact SHA mismatch -> repair handoff/deployment provenance -> reverify
- one tool/agent path fails -> use another already-authorized safe path if available

A blocker is NOT a valid reason to end with an explanation if available tools can still resolve it.

### Link terminal predicate

`LIVE_VERIFIED_LINK_READY` requires ALL of:

- exact requested change is present
- exact deployed SHA/revision is known
- user-facing URL freshly re-resolved and checked immediately before delivery; evidence normally <=120 seconds old
- HTTP 2xx
- no host/auth/error markers such as `Site not found`, `Page not found`, `Vercel Login`, `404: NOT_FOUND`, `DEPLOYMENT_NOT_FOUND`
- application-ready predicate passes
- real browser smoke passes on the exact URL
- requested acceptance criteria pass
- for mobile-facing game work, applicable viewport/control behavior passes

Only then may the chat send the link.

### User-action exception

`USER_ACTION_REQUIRED` is allowed only when completion truly requires an owner-only action unavailable to authorized tools, such as OAuth consent, payment/plan upgrade, UAC/hardware interaction, legal/account approval, or a missing secret/credential only the owner can supply.

In that case give exactly one concrete action. After the user performs it, resume the same task from the saved checkpoint and continue toward the verified link.

## No-report escape guard

If `LINK_COMPLETION_LOOP=ON` and `TERMINAL_STATE=NO`, do not end the turn with a progress/root-cause/status report in place of the requested link. Persist detailed progress in issue #80/PR comments and continue working.

If a prior chat violated this, record/recognize `LINK_COMPLETION_REGRESSION`, restore the latest checkpoint, and resume `NEXT_ACTION` on the SAME task/PR.

## Server hard delivery law — canonical Netlify link

Machine-readable policy: `data/manual-delivery-policy.json`.

For any World_server request whose requested result includes a link, the canonical production origin is `https://world-server.netlify.app`; the canonical world hub is `https://world-server.netlify.app/apps/voxel-world/`. New local worlds must be discoverable from that hub's Golden Worlds inventory.

While a blocker is resolvable by any already-authorized local/cloud/browser path, **a progress report, blocker report, root-cause report, PR URL, deployment URL that has not passed the live gate, or dead/stale URL is forbidden as the final user-facing result.** Continue the same task instead.

Before sending the final URL, run the executable gate against the exact canonical URL, for games using desktop + mobile browser verification and the app-specific ready global/inventory id where available, for example:

`npm run delivery:verify -- https://world-server.netlify.app/apps/<world>/ --game --ready-global=<READY_GLOBAL> --inventory-id=<world>`

The final evidence must be fresh (<=120 seconds), HTTP 2xx, free of known host/error markers, browser-rendered, visually non-empty for games, and present in the Golden inventory. If the user has explicitly authorized end-to-end completion, a Manual Fast Lane may merge after required CI plus independent review and then deploy to the canonical Netlify site without asking again.

## Same-task ownership

One logical implementation task -> one active owned implementation PR.

Builder fixes implementation/build/deploy-support blockers on that same PR. Fleet independently validates the exact SHA. Ocean integrates. Release independently verifies the exact integrated SHA. Do not create competing implementation PRs merely for review/testing.

## Verified Link Delivery hard gate

Never send a test, preview, production, deployment, artifact, download, or playable-world URL unless that exact URL has been freshly verified immediately before the user-facing message.

Prefer a stable canonical/production alias after safe integration. Ephemeral deploy previews are internal evidence and should not be the final terminal link unless there is no stable authorized target and the preview itself is freshly verified and explicitly appropriate for testing.

## Canonical resumable checkpoint

Persist active manual link tasks in issue #80 in a form equivalent to:

`[MANUAL_FAST_LANE][LINK_COMPLETION] TASK; OUTPUT_REQUIRED=VERIFIED_LINK_ONLY; LINK_COMPLETION_LOOP=ON; OWNER; PR; HEAD_SHA; CURRENT_DEFAULT_SHA; DEPLOY_TARGET; LAST_COMPLETED_STEP; CURRENT_BLOCKER; BLOCKER_CLASS; AUTO_REPAIR_AVAILABLE=YES|NO; NEXT_ACTION; TERMINAL_STATE=NO|LIVE_VERIFIED|USER_ACTION_REQUIRED; VERIFIED_URL; VERIFIED_AT; EVIDENCE_AGE; BROWSER_ACCEPTANCE; REQUESTED_DELTA_VISIBLE; ROLLBACK_LKG; violation_count.`

A fresh authorized chat must discover the latest nonterminal checkpoint and resume it before creating overlapping implementation work.

## Safety

Preserve LKG/rollback, branch protection, exact SHA propagation, Zero-Chaos, and stage independence. Never fabricate PASS, deployment, agent work, verification, or a working link.