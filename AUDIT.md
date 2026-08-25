# WORLD SERVER — GOLDEN STANDARD AUDIT

## Найденные системные причины

1. **Каталог был allow-by-accident.** `api/apps.js` публиковал любую папку `apps/*`, если там есть `index.html`. Поэтому diagnostic, недоделанные и несертифицированные приложения автоматически становились пользовательскими мирами.
2. **CI давал ложный зелёный результат.** В `e2e/ai3d-voxel-city-autoplay.spec.js` было `toBeTruthy` без `()`. Такой assert не выполняется. Collision-тест не доказывал, что стена реально блокирует проход.
3. **Playwright проверял только Desktop Chrome.** Mobile-профиля не было, поэтому отсутствие touch-контроля не могло заблокировать релиз.
4. **Одна и та же ошибка направления повторялась в нескольких клиентах.** В first-person Three.js использовалась неверная формула camera-relative forward; в каталоге `right` был фактически screen-left и D/A были инвертированы.
5. **Ступени не являлись частью collision-контракта.** Voxel collision умел остановиться о куб, но не имел стандартного step-up до одного блока.
6. **Готовность частично self-reported.** Runtime мог объявить `collisions:true`, не доказав поведение.
7. **Нет deny-by-default release registry.** Сломанный проект не карантинировался автоматически.

## Статус приложений после политики

- `voxel-world` — целевой certified после прохождения hard gate.
- `ai3d-voxel-city` — целевой certified после прохождения hard gate.
- `survival` — quarantine: в текущем master нет сертифицированной collision-логики; mobile runtime добавляется, но публичная выдача закрыта до проверки.
- `world-sharabass` — quarantine: touch есть, но collision не сертифицирован.
- `ai3d-reference-test` — diagnostic only.
- `ai-3d`, `chat` — tools, не игровые миры.
- `catalog` — system hub, не игровой мир.

## Что пакет меняет

- deny-by-default `/api/apps`;
- единый release registry;
- единый input/mobile runtime;
- исправляет направление в Voxel World, AI3D Voxel City и 3D Catalog;
- добавляет step-up для voxel collision;
- добавляет прямые кнопки выбора мира в каталог;
- добавляет mobile Playwright project;
- исправляет ложный assert;
- добавляет hard source gate и постоянные правила для AI-агентов;
- добавляет Golden Component Registry для будущего автоматического продвижения удачных функций/ассетов.

## Важно

Конкретный понравившийся витраж из отдельного Vercel-проекта нельзя честно импортировать, пока исходник этого проекта недоступен через подключённый Vercel/GitHub. Механизм promotion уже предусмотрен: после получения источника он регистрируется один раз и становится обязательным для всех миров, которые объявляют `windows=true`.


## V3 additions
Persistent scorecard, seeded anti-regression registry, FIX_CONFIRMED workflow, Golden promotion workflow, generated QUALITY_REPORT and CI governance gate are included. Production installation remains blocked by GitHub integration HTTP 403.


## V4 no-regression audit
Added an accepted-baseline quality floor. The gate blocks any per-metric drop even if the overall average improves, any tracked technology drop, growth in unresolved release blockers, reappearance of protected errors, silent Golden canonical replacement, certified capability removal, or removal of a critical regression test. A separate GitHub workflow and a Vercel build gate are included.


## V5 improvements
Known persistent overlays in catalog, Voxel World and AI3D Voxel City are migrated into the shared Golden UI drawer. Camera-relative movement and stair-step logic gain shared canonical modules. New tests cover canonical yaw directions, wall blocking, <=1.05 step-up, mobile touch movement, menu touch target size, packed system UI and visible non-blurred render canvases. Added whole-project reviewer and technology evidence audit.


## V6 additions
- Evidence-driven scoring model with weighted controls.
- Device matrix: desktop Chromium, Pixel 7, iPhone 13 emulation, tablet Chromium.
- Swept/substep collision helper and tunneling unit test.
- Duplicate-system and cross-app contract reviewers.
- Automatic capture of new release-blocking failures into error-registry candidates.
- Visual regression baseline harness (no fake screenshot baselines).
- Technology runtime-health separates adapter presence from actual runnable integration.


## V7 autonomous growth additions
- Ranked quality backlog uses impact × confidence × reuse ÷ effort.
- Automatic plan converts quality gaps into acceptance-tested tasks.
- Trend monitor detects stagnation and regression.
- Test-gap synthesizer exposes missing behavioral coverage.
- Per-app quality matrix identifies the weakest project first.
- Promotion candidate only appears when regression and reviewer gates pass.
- Full auto-quality cycle orchestrates measurement and planning without silently modifying the accepted quality floor.


## V8 quality automation audit
Implemented every previously proposed automation category in source form: safe auto-fix, auto-PR, canary/promotion/rollback, telemetry, performance budgets, HUD visual audit, Golden Asset Bot, real-device integration hook, auto-bisect, technology orchestrator, visual candidate approval, mutation testing and stability runs.

Additional repo audit found `services/ai3d-worker/ai3d/plugins/instantmesh.py` already existed in master but its `run()` path always produced a placeholder instead of invoking real InstantMesh inference. V8 replaces that behavior with the official `run.py` CLI path and removes the runner's placeholder-success selection.


## V9 audit
- Randomized control/collision invariant tests added.
- Impact graph maps canonical shared systems to all dependent games before a patch is accepted.
- User-confirmed fixes automatically become protected errors; small deterministic transforms can become reviewed AutoFix recipes.
- Generated code is never trusted: model output is a unified diff, path-limited, and verified in an isolated Vercel Sandbox microVM before PR/canary.
- Progressive rolling release uses explicit quality checkpoints at 1%, 10%, and 50%; failure aborts the rollout.
- GPU routing prefers healthy workers by priority, free VRAM, queue depth and latency, with failover.
- Perceptual screenshot gating still requires explicitly approved baselines; aesthetics are not self-certified.


## V10
Every major V9 next-step category now has executable code or an explicit external adapter. AI visual critique cannot approve baselines; patch candidates cannot win without sandbox verification; runtime technology percentages remain below 100 until actual execution succeeds.

- Added an explicit self-test proving `protected error -> generated regression test` end to end.


## V10.1 Desktop AI protocol
Added a canonical Desktop AI installation/verification guide, mandatory per-task `WORK_IN_PROGRESS.md`, machine-readable policy, task initializer and release-gate enforcement. The gate fails when project files change without updating the work MD, or when the work MD remains an UNSET template during active work.


## V11 CPU-only autopilot audit

- GPU scheduling is forbidden at policy, database-claim and worker-result levels.
- Paid compute is fixed to zero.
- Supabase queue uses `FOR UPDATE SKIP LOCKED` through `claim_quality_autopilot_job`.
- Night scheduler learns success priors and expected deltas from the last 30 days of verified events before scheduling new work.
- Three repeated unsuccessful deterministic actions become `never-retry`.
- Cross-project transfer only recommends historically positive patterns.
- The desktop worker refuses dirty worktrees, checks CPU load, creates a temporary candidate branch, runs the full release gate, emits a patch, then resets/removes the candidate branch.
- Production is not edited by the local night worker.


## V12 CPU Evolution audit

- Genetic optimizer is explicitly CPU-only and writes a candidate profile, never production settings.
- SSIM runs on CPU and requires an approved reference to be meaningful.
- Local code generation is optional and uses llama.cpp `-ngl 0`; no paid provider is required.
- CPU patch tournament never auto-applies a generated diff.
- Incremental tests reduce wasted nightly CPU but do not replace the full release gate.
- Texture and mesh factories are non-destructive.
- Failure/Success KBs are learned only from verified improvement memory.
- Adaptive budget increases work only when CPU load is low and keeps paid cost at zero.
- Desktop AI strict completion is blocked by remaining fixable errors or failed mandatory reports.


## V13 self-calibrating CPU audit

- Visual Ensemble is CPU-only and cannot self-approve aesthetics.
- Test Cache keys include command, runtime and exact selected input bytes.
- Genetic optimization now checkpoints after each generation and resumes safely.
- Bayesian ranking is advisory and cannot bypass release gates.
- Multi-file Golden Patterns require explicit approval and preserve exact hashes.
- Similarity scanning is non-destructive.
- Collision simplification preserves original meshes and emits separate candidates.
- Hardware profiles affect performance candidates only, not gameplay contracts.
- Self-calibration writes a candidate budget factor and requires real history.
- Strict Desktop AI completion now requires both clean fix-loop evidence and completed final evidence in `WORK_IN_PROGRESS.md`.
