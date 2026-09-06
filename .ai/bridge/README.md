# AI Bridge — ChatGPT ↔ Jules Coordination Surface

This directory (`.ai/bridge/`) forms the canonical, cloud-first, GitHub-based communication bridge between **ChatGPT** and **Jules** for `mpaykin1/World_server`.

## Goal
To coordinate task requests, progress tracking, and result delivery directly through GitHub (repository files, Issues, and PRs) without requiring local computer intermediate steps or local communication backdoors.

---

## Shared Protocol Specification

### Canonical Communication Files
1. `README.md`: This protocol documentation.
2. `state.json`: Current shared status snapshot, active claims, and high-water mark.
3. `tasks.jsonl`: Append-only task queue containing incoming task definitions.
4. `results.jsonl`: Append-only event/result ledger written by executing agents.

### Mandatory Field Schema
Every task entry in `tasks.jsonl` and result entry in `results.jsonl` MUST conform to this exact schema:

```json
{
  "id": "task-unique-id",
  "timestamp": "ISO-8601 UTC timestamp",
  "sender": "ChatGPT | Jules | system",
  "recipient": "Jules | ChatGPT | all",
  "type": "task | result | query | status",
  "priority": "P0 | P1 | P2 | P3",
  "status": "pending | claimed | in_progress | completed | blocked | failed",
  "summary": "Short task description or summary of result",
  "branch": "Target/working branch (e.g. ai/jules/feature-name)",
  "commit": "Git commit hash if applicable or null",
  "PR": "GitHub PR URL or number if applicable or null",
  "tests": "Summary of executed tests and evidence",
  "blockers": ["List of blockers or empty array"],
  "next_action": "Description of expected next action"
}
```

Task messages from **ChatGPT -> Jules** may also include extended payload fields:
- `acceptance_criteria`: List of requirements for task completion.
- `payload`: Detailed instructions or diff specs.

---

## Simplified Agent Message Format

### CHATGPT -> JULES
```text
CHATGPT -> JULES
task_id: <unique-id>
priority: P1
task: <summary of work>
acceptance_criteria: <requirements>
```

### JULES -> CHATGPT
```text
JULES -> CHATGPT
task_id: <unique-id>
status: completed / blocked / failed
branch: <branch-name>
commit: <commit-hash>
PR: <pr-url-or-number>
tests: <verification-evidence>
result: <detailed-summary>
next_action: <next-step>
```

---

## Safety, Idempotency & Concurrency Rules

1. **Idempotency**: Before Jules claims or executes a task, Jules checks `state.json` and `results.jsonl`. A task ID that is already `claimed`, `completed`, or `in_progress` is ignored to avoid duplicate execution.
2. **Concurrency Protection**: Task claiming acquires a file lock/lease (via `lib/collective-brain.js` lease primitives). Simultaneous claims by concurrent workers resolve cleanly with only one winner.
3. **Automatic Stale-Task Recovery**:
   - If a claimed task remains in `claimed` or `in_progress` status longer than `STALE_THRESHOLD_MS` (default: 15 minutes) without an updated heart-beat or result, it is marked as `stale` and returned to `pending` status or moved to retry queue.
   - Retries are bounded by `max_retries` (default: 2). Bounded retry exhaustion moves the task to `dead_letter` status with diagnostic context preserved.
4. **Secret Protection**: Secrets or API keys MUST NEVER be committed to `.ai/bridge/` or any repository file.
5. **No Local Computer Overhead**: The bridge works natively in GitHub / GitHub Actions / cloud execution environments.

---

## Workflow Integration
- Jules reads pending tasks from `.ai/bridge/tasks.jsonl` addressed to `Jules` before embarking on new autonomous work.
- Automated synchronization and validation is executed via `.github/workflows/ai-bridge-sync.yml`.
