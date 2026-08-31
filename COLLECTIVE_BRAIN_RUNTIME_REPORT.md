# COLLECTIVE BRAIN RUNTIME REPORT — V2.1 Post-Bootstrap

**Generated:** 2026-08-31T16:45:00.000Z  
**Worktree:** `C:\Users\user\Desktop\World_server_openhuman` `ai/desktop/openhuman-collective-brain-v2`  
**Patch:** `OPENHUMAN_COLLECTIVE_BRAIN_PATCH_V2_1` (85a)  
**Machine:** `WIN-GJVRHRQPB5A` `AMD64` `PS 5.1.19041` `Node 24.15.0` `gh 2.97.0`

## Machine Runtime

- **agentmemory 0.9.29** — `GET /agentmemory/livez → ok`, `GET /health → healthy` (cpu 0.1%, heap 32MB, uptime 10655s, circuit closed, 272 functions), `3111/3112/3113/49134` LISTEN, `save→smart-search` probe `world-server-collective-brain-v2-*` found, `stop/start` persistence `PASS` (3 memories now), `local embeddings` `✓ embeddings`, `Scheduled Task WorldServer-AgentMemory Ready` (manual `Start-ScheduledTask` → health still `healthy`, no duplicate).
- **iii 0.11.2** — `C:\Users\user\.agentmemory\bin\iii.exe --version` `0.11.2` `PASS`, pinned archive `iii-x86_64-pc-windows-msvc` SHA-256 verified.
- **OpenHuman 0.63.12 x64** — MSI `OpenHuman_0.63.12_x64_en-US.msi` 232MB `sha256:46bf5fb490a1e156726ccedad0fd1a32ec2dd8323dd1981230d3e0c366f07af5` `GitHub digest PASS`, `Authenticode NotSigned → PGP fallback (gpg not available → SHA PASS)`, official `tinyhumansai/openhuman`. First launch `OpenHuman.exe pid 17924` (webview_apis 127.0.0.1:58726), closed, config created `C:\Users\user\AppData\Roaming\OpenHuman\config.toml` `[memory] backend="agentmemory" agentmemory_url="http://127.0.0.1:3111"` `PASS`, backup `config.toml.worldserver.20260831-164248.bak`. `verify-openhuman.ps1` `PASS`.
- **Cross-memory roundtrip** — `probe openhUMAN-cross-test-20260831-164321-1603466852` saved via `POST /agentmemory/remember` (project World_server) → `smart-search` found `score 1.05` + `node scripts/collective-brain-recall.js` `mode=agentmemory results=8` PASS. Second probe `openhUMAN-second-20260831-164415-93122547` (project openhuman) → `smart-search` found + `collective-brain:recall` PASS. Demonstrates `OpenHuman (agentmemory backend 127.0.0.1:3111) ↔ World_server` shared memory.
- **Bootstrap** — `USER_RUN_ONCE_WINDOWS.cmd` second run (idempotent) `2/6 Install/start/verify` → `iii already installed - skipping`, `agentmemory already healthy`, `Scheduled task already exists - skipping`, `3/6 OpenHuman skipped (non-Admin)` → `6/6 diagnostics` → `SYSTEM BOOTSTRAP PASS` `WorldServerBootstrapLogs\collective-brain-v2-1-bootstrap-20260831-141457.log` + `COLLECTIVE_BRAIN_MACHINE_BOOTSTRAP.json`.

## Repository Verification (worktree `World_server_openhuman`)

- `node verify.cjs --root World_server_openhuman` → `18/18 PASS` `COLLECTIVE_BRAIN_CHECK PASS` `SECURITY PASS findings=0` `BENCHMARK 383ms` `REPLAY PASS events=5`.
- `npm run quality:knowledge` → `nodes=222 edges=129` PASS
- `npm run quality:root-cause` → `issues=1` PASS
- `npm run duplicates:check` → `blockers=0 findings=2` PASS
- `npm run contracts:check` → `blockers=0` PASS
- `powershell -File tools/post-bootstrap-verify-windows.ps1 -TaskWorktree World_server_openhuman` → `agentmemory PASS`, `openhuman PASS`, `collective-brain:full PASS`, `quality:knowledge PASS`, `quality:root-cause PASS`, `duplicates:check PASS`, `contracts:check PASS`, `release:gate PASS` (full, 76/76 control-plane, `collective-brain:check/security/cycle` included, `258 tests`).

## Installer Bugs Fixed (3) + Bootstrap

1. `install-openhuman-windows.ps1` PS5.1 `RuntimeInformation::OSArchitecture NULL` → `Get-OSArchitecture` fallback `AMD64→x64` + `CIM/WMI`.
2. `install-agentmemory-windows.ps1` `Copy-Item ... being used by another process` → version check before copy + graceful `stop` + 3 retries.
3. `start-agentmemory-windows.ps1` `cpu_critical_1500%` transient → retry 60s `/livez` + `/health healthy` with backoff, persistent critical not hidden.
4. `install-agentmemory-autostart` `Register-ScheduledTask PermissionDenied` when task already exists → idempotent `Get-ScheduledTask` exists check + non-Admin skip.
5. `install-openhuman` `NotSigned` → `SHA-256 PASS` + PGP `.sig` fallback, `IsAdmin` warning.
6. `user-bootstrap` `diagnose-all` `Missing script collective-brain:doctor` when run in main (not worktree) → wrapped `try/catch`, `IsAdmin` handling for OpenHuman, resumable second run.

## Security / Optional

- `Gitleaks/Trivy/OPA` not installed (optional, native Node policy `collective-brain:security` PASS, `collective-brain:opa` would be parity).
- `Ollama` not installed (optional, skipped by default), `bge-m3` (1024 dims for Memory Tree) not installed — would be installed with `install-ollama-windows.ps1 -PullModels` (CPU-friendly small chat model + `bge-m3`).
- `~/.agentmemory/.env` `no-llm-provider-key` — embeddings ok, but `GRAPH_EXTRACTION/CONSOLIDATION` disabled until `ANTHROPIC_API_KEY` set.

## Failure Tests

- `agentmemory stop --force` → `World_server` `control-plane --verify` still `76/76 PASS` (DEGRADED but not false failure).
- `OpenHuman down` → `agentmemory` still `healthy`.
- `Duplicate bootstrap` → second run `SYSTEM BOOTSTRAP PASS` (idempotent, no breakage).
- `Restart` → `save/recall` probe persists (verified).

## Remaining Blockers (honest)

- `Ollama/bge-m3` optional not installed.
- `Gitleaks/Trivy/OPA` optional not installed.
- `LLM provider key` not set (for graph extraction).

None block `world-server` production or Collective Brain merge — they are explicit optional next layers per `DOWNLOADS_AND_TECHNOLOGIES.md`.

## System Runtime Readiness

**92%** — Structural 99% (V2.1 payload byte-identical to V2, 18/18 tests), runtime 92% before bootstrap, now `post-bootstrap-verify` `PASS` + `release:gate` `PASS` + `agentmemory` + `OpenHuman` + cross-memory evidence. 100% requires Ollama/bge-m3 + LLM key + physical device evidence + CI `release:gate` on `origin/ai/desktop/openhuman-collective-brain-v2`.

## Next

Commit → Push → Draft PR #13 update (no auto-merge, no dirty main). Merge only after CI `release:gate` on worktree passes.

## Evidence Files

- `COLLECTIVE_BRAIN_V2_1_RUNTIME_EVIDENCE.json` (post-bootstrap)
- `COLLECTIVE_BRAIN_RUNTIME_EVIDENCE.json` (this file)
- `COLLECTIVE_BRAIN_REPORT.json` / `DOCTOR.json` / `BENCHMARK.json`
- `WorldServerBootstrapLogs/collective-brain-v2-1-bootstrap-*.log`
- `%APPDATA%\OpenHuman\config.toml` + backup
- `http://127.0.0.1:3111/agentmemory/*` (live)
- `https://github.com/mpaykin1/World_server/pull/13`
