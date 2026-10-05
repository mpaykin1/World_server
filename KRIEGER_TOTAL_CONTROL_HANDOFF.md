# KRIEGER TOTAL CONTROL — fresh-chat handoff

Canonical active PR: https://github.com/mpaykin1/World_server/pull/469

## Resume here

- Branch: `ai/chatgpt/krieger-max-deltak-20261005`
- Fleet-returned Builder head: `1eec25756ad09b7b7778c22344a612fcebba941c`
- PR #469 merged master base for the repair: `9fe9ec71b8ea08d4d0a0c8a896868d55758de9f0`
- Pinned upstream: `MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`
- Owner SUCCESS/FAILURE verdict: **UNSET**
- Do not create a replacement KRIEGER implementation. PR #469 is already merged; continue only with the focused Fleet-repair follow-up from this branch.

## Canonical control sources

- Evidence ledger: `data/krieger-total-control-evidence-ledger.json`
- Evidence summary: `docs/krieger-total-control/EVIDENCE_SUMMARY.md`
- Knowledge graph: `data/krieger-knowledge-graph.json`
- Knowledge graph contract: `docs/krieger-total-control/KNOWLEDGE_GRAPH.md`
- Capability map: `data/krieger-capability-map.json`
- Native authoring/compiler: `tools/krieger-total-control/`
- Browser proof: `tools/krieger-total-control/run-browser-visual-proof.sh`
- WASM proof: `tools/krieger-total-control/run-wasm-runtime-proof.sh`
- Bounded runner: `scripts/run-supervisor.cjs`

## Current Builder repair

Fleet PRE on PR #469 reproduced three blockers: descendant processes survived supervisor timeout/stall, the browser delta was not sufficiently causal, and the canonical ledger/handoff/capability/knowledge artifacts were absent from the candidate.

The current repair keeps the same architecture and PR:
1. Run Supervisor owns and terminates the process tree (POSIX process group; Windows `taskkill /T /F`) and has real descendant-survival regressions for both STALLED and TIMEOUT.
2. Browser proof uses the original KX as capability-OFF, captures an immediate same-session A/A pair to measure noise, then requires the authored signal to exceed that A/A noise floor while preserving the existing >=85 noticeability gate.
3. Canonical evidence/knowledge/capability files are restored from repository history instead of inventing a parallel ledger.

## Evidence rule

K remains fail-closed. Only `CONTROL_PROVEN` nodes count. Source presence, unit tests, or a technical browser PASS do not authorize a K increase by themselves. Exact-head executable artifacts are required, and owner SUCCESS/FAILURE learning may be recorded only after the owner explicitly says PASS or FAIL.

Next action: run exact-head GitHub CI/Fleet PRE on the repaired PR #469 head, inspect retained browser/WASM artifacts, then present the candidate to the owner without self-declaring success.
