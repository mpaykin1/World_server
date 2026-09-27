# ChatGPT ↔ Qwen — GitHub collaboration for World_server

The two chat products have no shared conversational memory. **GitHub issues and PRs are the shared, inspectable channel**, with source files and exact SHAs as the authoritative state. ChatGPT's connected GitHub app can create/review issues and PRs; the already merged `world-cloud-ai.yml` launches OpenCode with Qwen preferred and zero-cost fallback. This is not a direct Qwen-chat integration.

## Existing path (reuse; no sixth automation)
1. An authorized owner defines one bounded task in a GitHub issue with its base SHA and file ownership; avoid overlap with canonical issue #80 and live PRs.
2. Owner comments `/worldai <task>` on that issue, or invokes the existing workflow manually. Only an owner comment triggers the issue-comment workflow. Merely opening an issue, a bot comment, or an unmerged PR does **not** launch Qwen.
3. The workflow generates `WORLD_AI_HANDOFF_V1` from `scripts/qwen-handoff.cjs`, reads `QWEN.md`, executes the task in an isolated per-run branch, runs `npm run check`, `desktop-ai:check` and `golden:check`, and creates a candidate PR.
4. The action replies to the issue with `WORLD_AI_RESULT_V1` containing PR, exact SHA, actual model and test summary. ChatGPT can retrieve that issue/PR using its GitHub connector, review the diff and record counterexamples; Qwen can handle a bounded repair in the same review cycle.
5. The existing Builder → Fleet PRE → Ocean → Fleet POST governance still applies. Neither a cloud workflow nor an AI review may merge or assert live player visibility by itself.

## Task format
Pass project passport + one concrete task:
- `BASE_SHA` and existing task/PR owner; relevant code paths; expected inputs/outputs.
- One independently testable acceptance criterion and a failure/counterexample.
- Explicit exclusions (no unrelated UI, duplicate simulator, sixth schedule or schema migration without permission).
- Evidence: focused regression, exact-head CI, device/browser results when graphics or UX is claimed.

## Which agent does what
ChatGPT: architecture and contracts, integration review, user-facing narration, regression counterexamples and issue/PR coordination.
Qwen (when actually selected): bounded WebGL/GLSL, mobile-renderer profiling, deterministic engine patches and independent code-review tasks.
These are assignments, **not** claims that either model is universally superior; preserve existing authorship and compare concrete test evidence.

## Credentials and availability
The existing runner expects GitHub Actions secret `OPENROUTER_API_KEY` (legacy alias `WORLD`). Its ability to run the Qwen free model depends on its live OpenRouter catalog, tool support and rate limits. If the secret is absent or no zero-cost model is available, the runner correctly stops; the owner must configure the secret via GitHub Settings → Secrets and variables → Actions. Do not paste keys in chat/issues. The linked Windows Desktop Commander is optional and may be offline; cloud GitHub work does not need it.

Important: Qwen may not be the model actually executed if fallback occurs. The result records `ACTUAL_MODEL`. The AI agents cannot continue talking in the background purely because this document exists; an owner workflow trigger or separately authorized scheduled system is required.
