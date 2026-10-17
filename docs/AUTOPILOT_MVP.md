# Autopilot lease MVP

Prototype library: lib/autopilot-lease.js.

Supports exclusive time-limited claims, expired lease recovery, evidence handoff, and owner-only PASS/FAIL decisions.

Not a running coordinator. Shared atomic storage, agent dispatch, end-to-end testing and deployment are not implemented.

Next: add tests, transactional persistence, local test runner and audited agent dispatch. Do not bypass AGENTS.md. Only the owner determines PASS/FAIL.