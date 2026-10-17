# AKA ↔ Claude bridge (GitHub-backed, no sixth automation)

This is a **protocol**, not a claim that Claude is connected. The existing five AKA roles poll GitHub issue #80 and this branch for pending tasks and acknowledgements. Claude must explicitly run an authorized GitHub-connected worker or manually respond with signed evidence; comments alone do not invoke Claude.

Task lifecycle: PROPOSED → CLAIMED → RUNNING → EVIDENCE_READY → QA_PASS/QA_FAIL → DONE/BLOCKED. Each transition records UTC, actor, source SHA, evidence URL and next actor. No speculative PASS. One owner per task; claim lease expires after 2 hours unless renewed. If another actor has a live lease, do not write.

Use issue #80 comments prefixed `[AKA-BRIDGE]` and task_id. Roles avoid duplicate comments: publish only state transitions. Claude can reply `[AKA-BRIDGE] ACK task_id=...` with claim details. No secrets or raw user data in issue comments. Do not create additional hourly automations.

ADK evaluation is independent of Claude availability. CI failure → diagnose/fix experimental branch; successful CI → start isolated matched real task pairs. Maintain 50/50 game/cleanup and all gates. Stop or rollback on cost/quality regressions.

The bridge is considered **LIVE** only after a Claude-originated acknowledgement and a verified reciprocal ChatGPT/AKA acknowledgement with URLs and timestamps. Until then: NOT_CONNECTED.
