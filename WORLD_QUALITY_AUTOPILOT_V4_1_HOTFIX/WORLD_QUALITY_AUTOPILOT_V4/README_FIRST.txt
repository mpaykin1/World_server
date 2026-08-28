WORLD QUALITY AUTOPILOT V4.1 — WINDOWS VERIFY HOTFIX

ВАЖНО: держать этот пакет ВНЕ папки World_server.

1. Read DESKTOP_AI_WORLD_QUALITY_AUTOPILOT.md and WINDOWS_VERIFY_HOTFIX.md.
2. Keep World_server master protected; remain on ai/desktop/world-quality-autopilot-v4 or another AI branch.
3. Previous Windows `spawnSync npm.cmd EINVAL` is fixed: full verify uses cmd.exe -> npm on Windows.
4. If failed V4 left only WORK_IN_PROGRESS.md dirty, inspect git status; restore that failed-install-only WIP before retry.
5. Run installer with explicit --repo and --verify-full.
6. Run targeted V4 tests and full release gate; do not deploy on any regression.
7. Do not claim 100% without approved visual baselines + real rig evidence + physical iOS/Android evidence.
