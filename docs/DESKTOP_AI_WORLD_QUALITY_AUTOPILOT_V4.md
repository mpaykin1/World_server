# V4.1 WINDOWS VERIFY HOTFIX

**Обязательное изменение:** предыдущий V4 падал на Windows с `spawnSync npm.cmd EINVAL`. В V4.1 installer запускает полный npm gate через `cmd.exe`, а не напрямую через `npm.cmd`. Держать установочный пакет вне `World_server`, чтобы rollback/cleanup проекта не мог удалить ZIP. После неудачного V4 запуска сначала проверить `git status`; если изменён только `WORK_IN_PROGRESS.md` от этого неудачного запуска, восстановить его и повторить установку.

# DESKTOP AI — WORLD QUALITY AUTOPILOT V4

## Mission
Install and verify `WORLD_QUALITY_AUTOPILOT_V4` in `World_server` without breaking existing graphics, controls, collisions, mobile behavior, Golden components, AI3D delivery rules or release gates.

## Non-negotiable rules
1. Read root `AGENTS.md`, `DESKTOP_AI_INSTALL_AND_VERIFY.md` and current `WORK_IN_PROGRESS.md` before editing.
2. Never work directly on `master`/`main`. Create `ai/desktop/world-quality-autopilot-v4` from the latest clean `master`.
3. Never delete or simplify working graphics to make tests pass.
4. Never auto-approve a visual baseline.
5. Never auto-merge. The system may prepare a winner-only PR only after all gates pass.
6. If controls/collisions/mobile/visual/performance regress, reject or roll back the candidate.

## What V4 installs
- Semantic multi-scale voxel detail enhancer with exact front-projection invariant.
- Material intent classifier + deterministic procedural PBR candidate synthesizer.
- Texture-memory / virtual-atlas budgets per device tier.
- GPU/FPS/frame-P95/long-task/memory/device-pressure controller.
- Sustained FPS-decay thermal-pressure proxy.
- Conservative sector/frustum/HLOD visibility plan.
- Animation semantic validator + universal retarget/root-motion/two-hand contract.
- Visual baseline candidate capture + explicit-only promotion guard.
- Physical-device evidence gate.
- Production feedback learner that cannot directly mutate code.
- Candidate lab + cost/quality scheduler.
- Tamper-evident evidence ledger.

## Installation
From PowerShell in the extracted V4 folder:

```powershell
.\apply_world_quality_autopilot.ps1 -Repo "C:\Users\user\Desktop\World_server"
```

Or directly:

```powershell
node .\install-world-quality-autopilot.cjs --repo "C:\Users\user\Desktop\World_server" --verify-full
```

If the repository is clean and currently on `master`, the installer must create/use the AI branch. Do not use `--no-branch` for production installation.

## Exact verification sequence
Run from the repository root:

```powershell
npm run quality:world:materials
npm run quality:world:visibility
npm run quality:world:retarget
npm run quality:world:runtime
npm run quality:world:devices
npm run quality:world:candidates
npm run quality:world:feedback
npm run quality:world
node --test test/world-quality-autopilot.test.js
npm run release:gate
```

Expected targeted V4 test result: **12/12 PASS**.

## Mandatory playable checks
### Desktop
- Open `apps/ai3d-voxel-city` and `apps/voxel-world` through the preview deployment.
- Verify W/Up = forward relative to camera; S/Down = backward; A/D and arrows are not inverted.
- Verify mouse look has yaw/pitch only and never rolls/flips.
- Verify Space jumps in world Y and does not zoom the scene.
- Verify spawn is grounded and walls/floor/step-up behave correctly.

### Mobile
Use real iPhone/Android when provider is configured. Until then, emulation is useful but does **not** count as 100% physical-device evidence.
- Left touch control moves relative to camera.
- Right look control rotates camera without page scroll/zoom.
- Jump works vertically.
- Buttons are reachable inside safe-area insets.
- No black screen, stuck loading screen or accidental browser gestures.
- Record sustained FPS, frame P95, memory/crashes and thermal/pressure behavior.

## Visual verification
1. Run baseline candidate capture.
2. Compare Front Exact before/after: the front voxel projection must be unchanged.
3. Inspect orbit/playable view for added side/back architectural volume and PBR behavior.
4. Existing approved visual baselines must not regress.
5. New baseline may only be promoted after explicit human approval:

```powershell
npm run quality:world:baseline:promote -- --approve <candidate-id>
```

Never invent an approval ID.

## Runtime evidence files that must exist after verification
- `WORLD_QUALITY_AUTOPILOT_REPORT.json`
- `WORLD_QUALITY_AUTOPILOT_PLAN.json`
- `WORLD_QUALITY_AUTOPILOT_STATUS.json`
- `WORLD_RUNTIME_QUALITY_REPORT.json`
- `WORLD_DEVICE_PROFILE_MATRIX.json`
- `WORLD_ANIMATION_SEMANTIC_REPORT.json`
- `WORLD_RETARGET_CONTRACT_REPORT.json`
- `WORLD_SEMANTIC_DETAIL_REPORT.json`
- `WORLD_MATERIAL_SYNTHESIS_REPORT.json`
- `WORLD_VISIBILITY_OPTIMIZER_REPORT.json`
- `WORLD_CANDIDATE_LAB_REPORT.json`
- `WORLD_QUALITY_SCHEDULER_REPORT.json`
- `WORLD_FEEDBACK_LEARNER_REPORT.json`
- `WORLD_VISUAL_BASELINE_CANDIDATES.json`
- `WORLD_QUALITY_EVIDENCE_LEDGER.json`

## How to interpret readiness
The V4 structural target without external evidence is **98%**. Do not write 100% unless all three evidence gaps are actually resolved:
1. approved multi-view visual baselines;
2. real rig runtime evidence mapped to the retarget contract;
3. physical iOS + Android provider evidence.

## Candidate evolution
Only on an AI branch:

```powershell
npm run quality:world:evolve
```

This may generate/review candidates but must not bypass existing risk, regression, Golden, visual, control, collision or device gates.

## Commit / PR
Only after full verification:

```powershell
git status
git diff
npm run release:gate
git add -A
git commit -m "feat(quality): install World Quality Autopilot V4"
git push -u origin ai/desktop/world-quality-autopilot-v4
gh pr create --base master --head ai/desktop/world-quality-autopilot-v4 --title "feat(quality): World Quality Autopilot V4" --body-file WORK_IN_PROGRESS.md
```

Do not merge automatically. Verify the Vercel preview on desktop and mobile first.

## Failure procedure
If any gate fails:
- do not deploy;
- do not hide the failure;
- preserve logs/reports;
- update `WORK_IN_PROGRESS.md` with the failure and exact next action;
- fix the smallest responsible subsystem;
- add regression coverage for a confirmed bug;
- rerun targeted tests and full `release:gate`.
