# Agent Health & Recovery — shared playbook (2026-10-17)

Scope: **diagnose** local/cloud agent availability and unblock GitHub Actions, while preserving existing AKA automations. This document is a dispatch board, **not** proof that an agent has been started.

## Canonical coordination
- Infrastructure and agent reports: https://github.com/mpaykin1/World_server/issues/524
- Broken CI: https://github.com/mpaykin1/World_server/pull/525
- Evolution standard: https://github.com/mpaykin1/meta6/blob/main/evolve.md
- Owner-only PASS/FAIL. No blind merge, no bypass of required checks, no paid API, no new sixth AKA task.

## Current confirmed evidence
- PR #525 head d6b6a2c6ab42e1121cf832e732bca32822967c95: GitHub Actions jobs fail with no steps; logs 404 BlobNotFound.
- Claude compared runs: #519 success earlier 2026-10-16, #520/#521/#523/#525 failed later. This points to a shared CI infrastructure issue, not necessarily code.
- Remote Desktop Commander WIN-GJVRHRQPB5A is online but monthly tool quota is exhausted. **Do not retry/reconnect.** Other agent availability UNVERIFIED.
- Claude reproduced HybridLOD edge defects: negative dt, priority 0, invalid FOV/viewport, budgetScale 0; fixing code alone will not fix pre-step CI.

## Non-overlapping agent lanes
| Owner | Task | Evidence |
|---|---|---|
| Claude | HybridLOD edge-case fixes in its own #525 branch after owner approval; test with Node 22/24; no merge | Tests + SHA |
| Terminal Codex (existing authorized session) | Read-only Windows agent inventory, process/service health, network/TLS/GitHub CLI diagnostics | Redacted machine report |
| OpenCode | Independent local module tests + reproducible CI baseline, only if actually available | Test commands, exit codes |
| OpenHuman | GUI checks of GitHub Actions settings/usage/runner availability, only if existing authorized access | Redacted settings evidence |
| Agent Zero | Coordinate sequential light probes; avoid resource contention, only if running | Per-agent PASS/FAIL/UNVERIFIED |
| AnythingLLM | Classify redacted logs/errors into runner vs network vs permissions vs model quotas; no secrets | Evidence-based hypotheses |
| Ollama/free local models | Optional independent review if installed and healthy; no downloads unless approved | Model/version and review |
| ChatGPT GitHub connector | Audit PR/run metadata, independently review patches, consolidate in #524 | GitHub links |

## Read-only Windows probe for an already authorized local terminal
Run commands independently, each with a short timeout; do not print tokens/passwords:
```powershell
Get-Command opencode,ollama,gh,git,node -ErrorAction SilentlyContinue | Select-Object Name,Source
Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match 'opencode|openhuman|agent|anything|ollama|codex' } | Select-Object ProcessName,Id,CPU
git --version
node --version
gh --version
opencode --version
ollama --version
```
Missing commands are NOT proof that a GUI app/service is missing. Check only known documented service endpoints, with no credential output. Do not run `opencode models` if it may invoke paid endpoints. Avoid `auth list` unless output is carefully redacted.

## Triage decision tree
1. Does a process start? If no, local installation/path/runtime issue.
2. Can it access a known free local model? If no, model/provider/quota issue; do not use paid APIs.
3. Does HTTPS to GitHub succeed with proper TLS? If no, DNS/proxy/CA/network; **never disable TLS verification**.
4. Does GitHub API return 403? Distinguish token permissions/rate limit/proxy path restriction.
5. Does Actions job have steps? If no, investigate Actions policy, runner provisioning, account usage/quota/billing and incident status; do not change workflows blindly.
6. Do logs exist? If no, capture job/run IDs and timestamp; compare a master run and separate PR.
7. If steps execute, diagnose test/build errors independently; retain exact-head gates.

## Reporting protocol
For each agent publish: name, availability (PASS/FAIL/UNVERIFIED), access route, version, last check timestamp, exact non-secret error, next owner/action. Keep one consolidated report in #524; no repeated comments on #525. Do not claim agent started merely because this instruction exists.

## Safety and execution
- No new agent installation, background process, service startup, self-hosted runner, credential change, billing enablement, or secret access without explicit owner permission.
- No changes to existing workflows or required gates without demonstrated cause and separate reviewed PR.
- Do not touch unrelated files, branches, or other agents' work. Preserve 50% graphics/50% server cleanup and clean desktop.
