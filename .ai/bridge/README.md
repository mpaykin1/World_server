# AI Bridge — Universal World_server Agent Protocol (.ai/bridge/)

## Purpose
The `.ai/bridge/` directory is the **single canonical, cloud-first AI coordination bridge** for `mpaykin1/World_server` between ChatGPT, Jules, other browser/cloud agents, Codex, approved desktop agents, and future AI systems.

Do not create a second orchestration stack just because a new AI provider is introduced.

Communication happens through GitHub repo commits, pull requests, bridge queue files, and the canonical GitHub Issue:
**`AI Bridge — ChatGPT ↔ Jules` (#55)**.

The issue name is retained for backward compatibility; its scope is now universal and includes any onboarded World_server AI.

---

## Canonical Shared Files
- `.ai/bridge/README.md` — Bridge architecture and protocol specification (this file).
- `.ai/bridge/state.json` — Current shared checkpoint, active leases, worker status, and last processed IDs.
- `.ai/bridge/tasks.jsonl` — Append-only queue of task definitions and state updates.
- `.ai/bridge/results.jsonl` — Append-only record of execution results, completion reports, and events.
- `.ai/connection-manifest.json` — connection/capability expectations for newly joining agents.
- `docs/AI_ONBOARDING_AND_CONNECTIONS.md` — human-readable onboarding flow.
- `NEW_AI_BOOTSTRAP_PROMPT.md` — reusable bootstrap instruction for a new account/provider.

---

## New-Agent Handshake
Before claiming implementation work, a newly connected AI must verify its actual capabilities and post or prepare this message for issue #55:

```text
[AI-BRIDGE HELLO]
agent_name: <human-readable name>
provider: <provider/company>
model_or_product: <product/model if known>
github_access: read | write | none
write_capabilities: <branches/PR/issues/etc>
available_connections: <comma-separated VERIFIED providers>
missing_required_connections: <none or list>
limitations: <important restrictions>
ready_for_tasks: yes | no
```

Rules:
1. Never claim inherited access from another ChatGPT/account.
2. Never paste or request raw credentials if a provider OAuth/Connect flow exists.
3. A capability is available only after a real read/write verification appropriate to the task.
4. Optional provider connections do not block unrelated work.
5. GitHub + this bridge are the preferred common denominator for cross-provider AI communication.

---

## Shared Record Schema
Every task and result entry stored in `tasks.jsonl` or `results.jsonl` MUST contain the following **14 mandatory fields**:

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique task or event ID (e.g. `task_1710000000000_a1b2`) |
| `timestamp` | string | ISO-8601 timestamp |
| `sender` | string | Agent/human posting the record |
| `recipient` | string | Target agent or group (`All` is allowed) |
| `type` | string | `task`, `result`, `claim`, `reclaim`, or `status` |
| `priority` | string | `critical`, `high`, `normal`, `low` |
| `status` | string | `queued`, `claimed`, `completed`, `blocked`, `failed`, `stale_reclaimed` |
| `summary` | string | Concise goal, status, or result |
| `branch` | string \| null | Target or active Git branch |
| `commit` | string \| null | Associated commit hash |
| `PR` | string \| null | Pull request URL or number |
| `tests` | string \| object | Test/evidence summary |
| `blockers` | array | Blocking items (`[]` if none) |
| `next_action` | string | Clear next step for recipient |

Additional metadata may be attached by compatible agents, but the mandatory schema above must remain backward compatible.

---

## Communication Protocol & Formats

### 1. Structured task ingress
Posting a comment in canonical issue #55 with the block `[AI-BRIDGE TASK]` triggers the existing GitHub Actions ingress path and creates a structured child issue for supported workers without requiring local-machine access or raw user secrets.

```text
[AI-BRIDGE TASK]
task_id: task_1710000000000_a1b2
priority: high
task: Implement feature X with regression tests.
acceptance_criteria: Tests pass via the affected quality gates.
```

Legacy Jules-targeted behavior remains supported. New agents should use `recipient`/task text to make ownership explicit and must respect current leases/ownership before starting.

### 2. Returning results
```text
<AGENT> -> WORLD_SERVER_BRIDGE
task_id: task_1710000000000_a1b2
status: completed
branch: ai/<agent>/<task>
commit: <sha>
PR: <url-or-number>
tests: <verified evidence>
result: <concise implementation result>
next_action: <review/integrate/verify/etc>
```

### 3. Peer message
For coordination that is not an implementation task, agents may post a concise issue #55 message:

```text
[AI-BRIDGE MESSAGE]
from: <agent>
to: <agent | All>
subject: <short subject>
message: <actionable information>
evidence: <PR/SHA/run/url if applicable>
```

Use peer messages for capability discovery, review requests, blocker handoffs, or asking another agent for a bounded check. Do not use them to bypass branch/PR/test gates.

---

## Execution & Concurrency Guarantees

1. **Idempotency**: Every task ID is executed at most once. Completed/non-retriable tasks are skipped on reprocessing.
2. **File Leasing / Single Execution**: Claiming tasks acquires a scoped lease in `state.json`. Agents check leases/current ownership to avoid duplicate execution.
3. **Automatic Stale-Task Recovery**: tasks claimed beyond the configured stale threshold without completion can be reclaimed by the existing validation/recovery flow; partial failures preserve evidence and retry metadata.
4. **Zero Secrets / Least Privilege**: bridge operation should rely on provider-managed credentials and standard GitHub permissions. Raw secrets must never be stored in bridge files, prompts, comments, or PRs.
5. **Cloud-first**: do not require the user's PC for normal bridge operation.
6. **Single orchestration stack**: reuse `scripts/master-coordinator.cjs`, bridge files, GitHub issues/PRs and existing fleet automation. A newly connected AI is a worker/peer in the same system, not a reason to fork the system.
7. **Evidence over self-report**: agent claims such as “connected”, “tested”, “deployed”, or “ready” require evidence appropriate to that claim.

---

## How ChatGPT and another browser AI communicate
They do not need access to each other's private chat history. Both read/write durable shared state through this bridge. ChatGPT can send tasks or messages to the bridge; the browser AI can respond with branches, PRs, issue messages and results; ChatGPT can then review, test, integrate or send follow-up work through the same channel.

This design works across different AI providers and different user accounts as long as each participating agent has independently authorized access to the required shared surfaces.
