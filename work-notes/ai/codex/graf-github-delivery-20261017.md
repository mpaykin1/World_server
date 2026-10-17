# WORK IN PROGRESS — ai/codex/graf-github-delivery-20261017

> Updated 2026-10-17T07:23:09.407Z. Mandatory Desktop AI task context.

## Task
GRAF GitHub delivery: проверка возможностей и Git outbox proof

## Why
Owner asks which restrictions and infrastructure prevent reliable GitHub work, and authorizes necessary new components. A proxy outage must preserve code and pending operations instead of blocking all development.

## Current state
Base: 9422d5730be1bd5803a0258be65ea5f469cfd60e. Git fetch/push works; GitHub API, existing Worker and Cloud Run URLs receive Envoy CONNECT 403 before TLS. Saved network configuration already includes api.github.com. No deployment credentials available. Existing durable SQLite queue, remote bridge and coordinator are present. No gameplay/quality baseline changes intended.

## Target state
A documented capability audit and a small offline proof: Git carries an immutable request, the existing queue retains it, and a reconciler safely resumes PR creation after an uncertain API result. Production transport remains explicitly unverified.

## Files / systems involved
- New delivery protocol module, focused isolated tests, reliability design/evidence document, task notes; scoped AGENTS/desktop instructions only.
- Existing queue, coordinator, Worker, App permissions and deployment are inspected, not modified or activated.

## Known risks
- Duplicate writes after timeout; stale branch SHA; arbitrary commands/URLs from manifests; mistaking local fake API evidence for live service health.
- Full existing remote-bridge tests mutate shared state/worktrees; do not run them on this checkout. No full release claim.

## Golden systems that must be preserved
- Controls
- Collisions
- Mobile support
- Compact UI/HUD
- Release certification
- Protected errors
- Approved Golden assets/components

## Errors that must not return
- Preserve collective-brain-secret-leak, collective-brain-prompt-injection-memory, remote-bridge-worker-token-auth, vercel-quota-exhausted-by-non-runtime-deploys.

## Exact patch / change plan
1. Audit existing infrastructure and supported cloud configuration; bounded network probes.
2. Add strict pinned-SHA PR operation protocol, with injected adapter and reconciliation; no live executor yet.
3. Prove Git -> existing SQLite queue -> fake API recovery in temporary repositories/databases.
4. Document deployment choices, required App/hosting setup and policy exceptions; retain protections.
5. Run targeted tests and safe structural gates, commit/push separate branch, attempt draft PR once.

## Tests to run
- Focused Node protocol and offline integration tests; no network, no canonical state/worktree mutations.
- Existing queue duplicate enqueue/claim/restart recovery with isolated temp cwd and DB.
- Syntax, architecture, MF, IndieWorlds, desktop protocol, diff checks.
- Full npm run check/release:gate not claimed: existing adapter tests have canonical repository side effects. Reinstall is unnecessary and prohibited by the owner.

## Deployment / PR plan
ai/codex/graf-github-delivery-20261017 -> push -> draft PR if API permits; otherwise ready browser ChatGPT handoff. No merge, deployment, credentials or DB changes. Claude review and owner decision remain pending.

## Current progress
Read-only infrastructure/bridge audits complete. Root session preflight and local recall complete. Task-note generator initially failed on a Windows default path; rerun with existing LOCALAPPDATA=/tmp/world-server-ai succeeded without installation. Strict PR-only protocol and isolated Git/SQLite proof implemented. Same-company adversarial review caught repo coercion; fixed with regression. Live App/runner remains unconfigured.

## Next action
Publish tested branch and attempt draft PR once; if proxy still blocks API, browser ChatGPT creates it from the saved branch. Next implementation step after that is independently proving executor API egress/storage, not reinstalling Codex.

## Completion criteria
- No accepted metric decreases.
- Focused verification evidence and limitations recorded accurately.
- No game files changed; no existing service or quality protection disabled.
- No claim that the cloud proxy is repaired, the live bridge is deployed or duplicates are impossible.
- No Golden promotion or success/failure learning before owner decision.
- Final evidence recorded.

## Final evidence
- Node targeted suite: 20/20 tests passed, no skips (18 protocol + 2 temp Git/SQLite integration).
- check:fast: Syntax OK, 88 JS files; architecture: 3 changed code files; MF and IndieWorlds checks passed.
- Quality impact: 8 changed files, no existing affected apps; Desktop protocol and diff checks passed. Generated reports restored to their original bytes after inspection.
- Fresh network evidence: docs/evidence/graf-github-delivery-20261017.json (2026-10-17 07:27 UTC), all 3 HTTP routes CONNECT 403/Envoy before TLS, gh API blocked, Git ls-remote succeeded.
- docs/GRAF_GITHUB_DELIVERY.md contains capability matrix, adapter API, limitations, exact continuation prompt and concrete launch prerequisites.
- No installs, service creation, deploy, DB migration, secret/access changes, merge or owner verdict. Full release gate and Claude review remain pending.
- Code/evidence commit: 47fe90fc309845a6ed5b54a35156ec61c2f63cf9. Pushed successfully to origin/ai/codex/graf-github-delivery-20261017. Follow-up checkpoint commit is documentation only.
- Draft PR creation and issue #524 comment each attempted once with 15-second limit; both returned `Post https://api.github.com/graphql: Forbidden`. Neither PR nor comment was published by these attempts. Browser ChatGPT should first look for an existing PR by head/base and create one if absent.
- Local tests are not GitHub Actions. No deployed bridge exists yet; independent runtime egress/storage and App setup remain the first live actions.
