# Правила работы AI-агентов в World_server

> Этот файл — постоянные правила для **всех AI-агентов** (Codex, OpenCode, и любых других). Нарушение правил считается ошибкой выполнения.

## 1. Ветки и защита `master`

- `master` — защищённая стабильная ветка. Прямой `push` в `master` **запрещён**.
- Каждая задача выполняется в **новой отдельной ветке**:
  - Формат для AI: `ai/<agent>/<task>` (например, `ai/codex/voxel-fix`, `ai/opencode/catalog-feature`)
  - Допустим также `opencode/<task>` для OpenCode-сессий
- Перед началом работы **обязательно**:
  ```powershell
  git checkout master
  git pull origin master
  git checkout -b ai/<agent>/<task>
  # или: git checkout -b opencode/<task>
  ```
- Никогда не удалять существующие рабочие функции без необходимости. Не упрощать работающую логику ради «красоты».

## 2. Принципы изменений

- Изменения должны быть **минимально разрушительными** и **совместимыми** с существующей архитектурой.
- Перед изменением архитектуры сначала **анализировать зависимости** (`api/`, `apps/`, `shared/`, `lib/`, `supabase/migrations`, `vercel.json`).
- Сохранять **обратную совместимость**: маршруты `/api/apps`, `/api/register`, `/api/login`, `/api/me`, `/api/logout`, `/api/voxel`, события `chat:*`, `survival:*`, `sharabass:*`, интерфейс `MiniSocket` и `shared/common.js`.
- Если задача большая — разбивать на **независимые проверяемые части** (отдельные PR/ветки).

## 3. Безопасность

- **Не хранить секреты / API keys в репозитории.** `.env`, `.env.*` уже в `.gitignore`. Использовать `.env.example` и переменные окружения Vercel/Supabase.
- Проверяемые ключи: `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, токены. Сканирование секретов выполняется в CI.

## 4. Качество: тесты и диагностика

- После изменений **запустить все доступные тесты**:
  ```powershell
  npm run check
  # внутри: node scripts/check-js.js && node --test
  ```
  Проверяет синтаксис `server.js`, `shared/common.js`, `api/*.js`, `lib/*.js`, `apps/*/client.js` и запускает `test/auth.test.js`, `test/game-rules.test.js`, `test/voxel-rules.test.js`.
- Проверить `git diff` и `git status` перед коммитом.
- При ошибках тестов **PR не merge**.
- При возможности **улучшать автоматизацию тестирования и диагностики**.

## 5. Коммит → Push → Pull Request (обязательно)

1. `git diff` — проверить изменения
2. `git commit -m "<type>: <описание>"`
3. `git push -u origin ai/<agent>/<task>` (или `opencode/<task>`)
4. **Всегда создавать Pull Request в `master`** (через `gh pr create` или GitHub UI). Никогда не `merge` автоматически без ревью.

### Шаблон описания PR

В каждом PR указывать:

- **Что изменено** — кратко по пунктам
- **Какие файлы** — список затронутых файлов
- **Какие тесты выполнены** — вывод `npm run check` / `node --test`
- **Известные проблемы** — что не покрыто, ограничения

Пример:
```
## Что изменено
- Добавлен AGENTS.md с правилами
- Добавлен CI для проверки правил

## Файлы
- AGENTS.md
- .github/workflows/ci.yml
- .github/workflows/agent-rules.yml

## Тесты
- npm run check — OK (Syntax OK: N files, 12 tests passed)

## Известные проблемы
- Нет
```

## 6. Автоматическая проверка правил в CI

Правила, проверяемые автоматически (см. `.github/workflows/`):

- `AGENTS.md` существует в корне
- `npm run check` проходит (синтаксис + все тесты)
- Секреты не попали в коммит (`.env` отсутствует, нет `SUPABASE_SECRET_KEY=` в коде, кроме `.env.example` и `AGENTS.md`)
- Базовая проверка ветки и PR (источник ≠ `master`, цель = `master`)
- Защита `master` настраивается в GitHub → Settings → Branches → Branch protection rule для `master` (Require pull request, Require status checks `check`).

Локальная быстрая проверка тех же правил:

```powershell
node scripts/check-agent-rules.js
```

## 7. AI3D — walkable и 1в1 к референсу

- **Результат AI3D всегда — walkable сцена, а не GLB-рельеф.** Для города/улицы/ландшафта: `WASD` + мышь, пол/стены/отдельные здания. Для персонажа: персонаж внутри мира с управлением. `apps/voxel-world` — образец.
- **1 в 1 к референсу:** силуэт, структура, цвет, ключевые объекты (собор, мосты) — метрики только из `ai3d-verifier` (`image3d_correspondence` с `renderSha256`), не на словах.
- **Запрет:** `HEIGHTFIELD-DOMINANT`/`BILLBOARD_LIKE` выдавать как `VERIFIED 100` Image→3D. Такие — `UNTESTED` или `0%`.
- Подробно: `docs/AI3D_WALKABLE_REQUIREMENTS.md`, разбор провалов: `docs/AI3D_FAILURE_ANALYSIS.md`.

## 8. Контакты и эскалация

- Если правило мешает выполнить задачу — описать причину в PR и запросить исключение, не нарушать скрытно.
- Сохранять историю и совместимость данных в `supabase/migrations` и `data/` (только для истории).

---
*Версия: 1.1 — добавлены AI3D walkable/1в1 правила (`docs/AI3D_WALKABLE_REQUIREMENTS.md`), зафиксированы в `opencode/ai3d-full-integration`.*

## 9. FINAL DELIVERY GATE — обязательная форма результата AI3D

- Основная ссылка пользователю всегда ведёт прямо в **playable 3D scene**, не в debug/viewer.
- Для города/мира обязательны: `WASD` + стрелки + mouse-look + collisions + grounding + player spawn + отдельные архитектурные массы.
- Для персонажа: управляемый персонаж внутри 3D-мира; отдельный GLB/FBX viewer запрещён как final.
- `apps/ai3d-reference-test/` — только `DIAGNOSTIC ONLY`, его URL запрещено подавать как финальный.
- `model.glb`, OrbitControls, clay render, screenshot, heightfield, relief, billboard — только artifacts/debug.
- Цель: `Render(playableScene, referenceCamera)` максимально близок к исходному reference, предпочтительно 1:1 насколько технически возможно.
- Корневой `ai3d-final-delivery.json` остаётся `NOT_READY_FOR_FINAL_DELIVERY`, пока hard gate не подтверждает готовую сцену.
- READY требует `scene-delivery.json`, VERIFIED visual metrics и `VERIFIED_VOLUMETRIC`.
- `node scripts/check-ai3d-delivery-policy.js` — hard CI gate. Его нельзя обходить `|| true` или `continue-on-error`.
- Если сцена не прошла gate, ответ агентом: `NOT READY FOR FINAL DELIVERY`, а не выдача diagnostic viewer.



## 10. WORLD SERVER GOLDEN STANDARD — запрет сломанных релизов

- Публичная выдача игр работает по **deny-by-default**: приложение не появляется в `/api/apps` и каталоге, пока оно не имеет `status: certified` в `data/app-release-registry.json`.
- Финальную ссылку пользователю запрещено давать, пока не прошли `npm run golden:check` и Playwright на desktop + mobile.
- Минимальный контракт playable-мира: правильные camera-relative W/S/A/D и стрелки, mouse-look, touch movement/look, spawn на поверхности, grounding, wall collision, step-up по лестнице/ступени, отсутствие проваливания, непустой render.
- Запрещены self-reported ready-флаги как единственное доказательство. Нужен поведенческий тест.
- Любая найденная хорошая общая функция сначала переносится в Golden Component Registry, затем переиспользуется всеми совместимыми играми. Копии логики с разными знаками/формулами запрещены.
- Рабочая графика не удаляется и не упрощается ради прохождения тестов. Исправляется runtime/physics/input, а визуальный слой сохраняется.
- Diagnostic/tool/quarantine приложения не должны показываться в публичном игровом каталоге.
- Любая конструкция вида `.toBeTruthy;` / `.toBeFalsy;` без вызова считается ложным зелёным тестом и блокирует CI.


## 11. DESKTOP AI — mandatory work instruction

### 11.0 WORKTREE HYGIENE — HARD RULE FOR EVERY AI

- Never create `World_server_*` copies, numbered Desktop folders, or temporary checkout folders on Desktop.
- Reuse the canonical checkout and at most one owned off-Desktop worktree for the active task.
- Put logs, screenshots, scratch files and temporary reports only in the current checkout's ignored `work/` directory. Delete them before finishing.
- If deletion is unsafe, move the artifact to the single `Desktop/DELETE_MANUALLY_AFTER_AI_SESSION/` folder and record why. Never scatter manual-cleanup folders.
- Before creating a worktree, inspect existing ownership and reuse an existing one. Before ending, commit useful source changes, remove the owned worktree and verify Desktop contains no new `World_server_*` copies.
- This rule applies equally to Codex, OpenCode, OpenHuman, ChatGPT, recovery workers, coordinators and retries. Violating it is a task failure.

For every task, patch, repair, upgrade, deployment or quality-improvement run:

- Read `DESKTOP_AI_INSTALL_AND_VERIFY.md` first.
- Create/update `WORK_IN_PROGRESS.md` before editing project files.
- The work MD must state: what we are doing, why, current state, target state, where the project is going, affected systems, risks, exact patch plan, required tests, what to do with the patch, current progress, next action, completion criteria and final evidence.
- A patch without an updated `WORK_IN_PROGRESS.md` is invalid.
- Do not declare completion while `Final evidence` is incomplete.
- Do not work directly on `master`.
- Do not merge/deploy if any accepted quality metric regresses.
- Confirmed fixes must become regression protection.
- Approved reusable successes must become exact Golden Components and be propagated to compatible projects.


## 12. CLOUD-FIRST / LOW-IMPACT AI EXECUTION — mandatory

This rule applies to every current and future AI agent working on `World_server`.

- **Browser/cloud first.** If a task can be done in GitHub, CI, Vercel, Google AI Studio, browser ChatGPT, cloud Codex, Claude/cloud agents, or another existing remote system, do it there instead of on the user's PC.
- Local/Desktop execution is allowed only for steps that cannot reasonably be completed in browser/cloud, or for the smallest safe bridge needed to publish work to the cloud.
- Desktop Codex/Claude/OpenCode should act primarily as **coordinator/orchestrator**: commit/push minimal bridge changes, assign work to available cloud/browser agents, collect results, review, and integrate.
- Reuse `scripts/master-coordinator.cjs`, the existing collective-brain/lease/reporting systems, GitHub and existing cloud infrastructure. Do not create a second orchestration stack.
- Do not launch local models, large builds, full test suites, load/soak tests, multiple heavy agents or repeated recovery loops when a cloud equivalent is available.
- Before any heavy local action, ask: `Can this run in browser/cloud?` If YES, delegate it.
- Computer health is part of correctness: avoid duplicate workers, runaway Node/Python/PowerShell processes, local-model RAM pressure, unnecessary watchers, large caches/logs, and disk churn.
- During long sessions, periodically verify free RAM/disk, active AI processes, worktrees and Desktop hygiene. If the machine slows down, stop adding local load, identify the cause, offload work, and clean only proven session-owned temporary artifacts.
- Never delete unknown/user files or kill processes that are not proven to belong to the current AI task.
- Do not create AI worktrees, clones, archives, logs, caches, `node_modules`, builds or scratch data on Desktop. Temporary AI data belongs under `%LOCALAPPDATA%\WorldServerAI\` or another existing off-Desktop ignored location.
- Do not let temporary artifacts accumulate until session end: remove proven disposable session-owned data as soon as it is no longer needed.
- The preferred handoff is: `minimal local change -> commit -> push -> CLOUD_AI_HANDOFF.md -> cloud/browser continuation`.
- A local agent must not continue heavy implementation after the work is safely available to cloud agents unless the remaining step is impossible remotely.
- Any confirmed clutter/performance regression must get a root-cause fix plus regression protection, not just one-time cleanup.
- Cloud/browser agents must preserve existing architecture, use `World_server` as the single source of truth, and avoid duplicate repositories/projects/services.


## 13. MANUAL-ACTION & DEPLOYMENT CONFIDENCE GATE — HARD RULE

This rule is mandatory for every current and future AI agent and coordinator.

- Before asking the user to click, publish, deploy, sync, force-push, delete, unpublish, reconnect, recreate, enter credentials, enable billing, or perform any other consequential manual action, the agent must reach **>=95% confidence** that the exact proposed action is correct for the exact target.
- Confidence must be based on **at least two independent current evidence sources**. For an external platform, at least one source must be authoritative/current platform documentation or an authenticated platform state read. A guess from names, timestamps, UI ordering, memory, or an old handoff is never sufficient.
- Prove the exact target identity first: repository, branch/SHA, app/workspace ID, public URL, service/slot/project when applicable. If duplicated names exist, names alone are insufficient.
- Always distinguish **repository-integrated** from **live-deployed**. A patch is not "installed in production" until the live target proves the expected behavior/version through a route, build SHA, deployment metadata, or equivalent runtime evidence.
- If confidence is below 95%, continue investigating and **do not instruct the user to act**. State what is known/unknown instead of guessing.
- Existing published production is **update-in-place by default**. Never delete/unpublish/recreate an existing app/service/project merely to deliver an update.
- For Google AI Studio Starter Tier, preserve the existing published app slot and overwrite/update that slot. Do not manually delete the backing Cloud Run service to replace it.
- Never use AI Studio `Force push` from a stale/uncertain workspace into canonical `master`. Canonical source is `mpaykin1/World_server` `master`; external workspaces pull/sync from canonical source unless a separately reviewed flow explicitly says otherwise.
- Never create duplicate repositories, AI Studio apps, Cloud Run services, slots, or deployment systems when the intended target already exists.
- A destructive exception requires all three: authoritative evidence that in-place update is impossible; a verified rollback + public-URL preservation plan; and explicit user approval for that destructive action.
- After a deployment/update, independently probe the canonical public URL and the capability-specific endpoint/behavior before declaring success.
- Machine-readable source of this rule: `data/deployment-safety-policy.json`. CI enforcement: `node scripts/check-agent-rules.js`.
- Canonical production target for this project is `https://world-server.ai.studio`; never substitute another host when verifying or updating production unless the user explicitly changes the canonical target.
