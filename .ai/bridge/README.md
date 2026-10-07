# AI Bridge — ChatGPT ↔ Jules Protocol (.ai/bridge/)

## Purpose
The `.ai/bridge/` directory is the canonical, cloud-first GitHub-based AI coordination bridge for `mpaykin1/World_server` between ChatGPT and Jules (and other cloud/desktop agents).

Communication happens directly through GitHub repo commits, pull requests, and the canonical GitHub Issue named:
**`AI Bridge — ChatGPT ↔ Jules`**

---

## Canonical Shared Files
- `.ai/bridge/README.md` — Bridge architecture and protocol specification (this file).
- `.ai/bridge/state.json` — Current shared checkpoint, active leases, worker status, and last processed IDs.
- `.ai/bridge/tasks.jsonl` — Append-only queue of task definitions and state updates.
- `.ai/bridge/results.jsonl` — Append-only record of execution results, completion reports, and events.

---

## Shared Record Schema
Every task and result entry stored in `tasks.jsonl` or `results.jsonl` MUST contain the following **14 mandatory fields**:

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique task or event ID (e.g. `task_1710000000000_a1b2`) |
| `timestamp` | string | ISO-8601 timestamp (e.g. `2026-09-06T12:00:00.000Z`) |
| `sender` | string | Agent/human posting the record (e.g. `ChatGPT`, `Jules`) |
| `recipient` | string | Target agent or group (e.g. `Jules`, `ChatGPT`, `All`) |
| `type` | string | `task`, `result`, `claim`, `reclaim`, or `status` |
| `priority` | string | Task priority: `critical`, `high`, `normal`, `low` |
| `status` | string | `queued`, `claimed`, `completed`, `blocked`, `failed`, `stale_reclaimed` |
| `summary` | string | Concise summary of the goal, status, or result |
| `branch` | string \| null | Target or active Git branch (e.g. `ai/jules/cloud-bridge-init`) |
| `commit` | string \| null | Commit hash associated with the result or checkpoint |
| `PR` | string \| null | Pull request URL or number (e.g. `https://github.com/mpaykin1/World_server/pull/42`) |
| `tests` | string \| object | Test evidence, pass/fail summary, or verification command output |
| `blockers` | array | List of blocking items or errors (`[]` if none) |
| `next_action` | string | Clear recommendation or next step for recipient agent |

---

## Communication Protocol & Formats

### 1. GitHub Comment Ingress (ChatGPT -> Jules)
Posting a comment in the canonical issue **`AI Bridge — ChatGPT ↔ Jules`** with the block `[AI-BRIDGE TASK]` triggers GitHub Actions (`.github/workflows/ai-bridge-ingress.yml`), which parses the comment and automatically creates a structured child GitHub issue labeled `jules` and `ai-bridge` without needing local machine access or API keys.

**Exact ChatGPT Comment Format:**
```text
[AI-BRIDGE TASK]
task_id: task_1710000000000_a1b2
priority: high
task: Implement feature X with regression tests.
acceptance_criteria: Tests pass via `npm run check`.
```

### 2. Returning Results (Jules -> ChatGPT)
```text
JULES -> CHATGPT
task_id: task_1710000000000_a1b2
status: completed
branch: ai/jules/cloud-bridge-init
commit: 1a2b3c4d5e
PR: https://github.com/mpaykin1/World_server/pull/42
tests: npm run check -> 100% PASS
result: Feature X implemented cleanly with 5 new tests.
next_action: Review PR and merge to master.
```

---

## Execution & Concurrency Guarantees

1. **Idempotency**: Every task ID is executed at most once. Once completed or marked non-retriable, subsequent processing skips the task.
2. **File Leasing / Single Execution**: Claiming tasks acquires a scoped lease in `state.json`. Concurrent agents check leases to avoid duplicate execution.
3. **Automatic Stale-Task Recovery**:
   - Tasks claimed longer than `STALE_THRESHOLD_MS` (default 15 minutes) without completion are automatically reclaimed during `node scripts/ai-bridge.js validate` (and hourly CI runs) and transitioned back to `queued` (or `stale_reclaimed`).
   - Partial failures preserve error logs and retry metadata so subsequent runs can safely resume.
4. **Zero Secrets / Least Privilege**:
   - Ingress workflow runs on standard GitHub `GITHUB_TOKEN` with `issues: write` and `contents: read` permissions. No user secrets are stored or required.
