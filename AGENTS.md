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

## 12. MULTI-AI PEER IMPROVEMENT

This project is worked on by multiple AI agents in parallel (Claude, Codex/ChatGPT, OpenCode, Desktop AI, and future agents), each in its own git worktree/branch. This rule binds all of them equally.

- **Before starting**, always run `git status`, `git branch --show-current`, `git worktree list`, and `git log --oneline --decorate -20` to see what's already active. Never work directly inside another agent's checked-out worktree, never stop another agent's watchdog/scheduler/control-plane/background process, and never `git reset --hard` / `git clean -fd` / force-push / rewrite history on a branch you don't own.
- **Discover → compare → reuse → improve → verify → protect → generalize.** Before implementing something, check whether another agent's branch, PR, `WORK_IN_PROGRESS.md`, or commit history already solved it. Reuse the better solution instead of re-deriving it; if you improve on it, prove the improvement with tests, don't just assert it.
- Compare solutions on correctness, reliability, regression risk, test coverage, and maintainability — not on which agent wrote it.
- A fix confirmed to generalize beyond its original context becomes a Golden Component (section 10) and gets propagated, not copy-pasted per project.
- Never claim a merge is safe (`mergeSafe: true`) while any gate is FAIL/SKIP/unverified, or while a live-verification step (deployment, real third-party event delivery, etc.) hasn't actually been confirmed.
- **Secrets are never copied into agent-managed local stores** (vaults, `.md`/`.txt`/`.kdbx` files with real values, scratch files). The source of truth for a credential stays wherever it's already issued (Vercel/Supabase/PostHog/Sentry/GitHub dashboards). An agent may document *what* a credential is for and *where* it lives (see `.env.example`), never its value.
- **Free open-source tooling needed for a task (linters, test runners, CLIs, browser automation, etc.) may be installed by the agent directly** — `need → check what's already in the project → license/source check → install → verify → integrate with regression protection` — instead of asking the human to install it.

## 13. AUTONOMOUS TECHNICAL EXECUTION

Default to finishing technical work end-to-end rather than stopping at a step a human could theoretically do by hand. Concretely, an agent does these itself, without asking first:

- Free, reversible, technical actions in general.
- Downloading, installing, updating, and testing free open-source tools (after the license/source/maintenance/security check in section 12).
- Creating and working in its own git branches/worktrees, opening/updating PRs, triggering Preview deployments, and creating test/preview environments (e.g. a free-tier Preview Supabase project) needed to actually verify a fix.
- Diagnosis, tests, fixes, regression protection, benchmarking, and cross-AI comparison.
- Reusing an existing system instead of building a duplicate.
- Scaling a proven fix into a Golden Component (section 10).

**Confirm with the human first only for:**
- Anything with a real ($ > 0) cost.
- Irreversible deletion, especially of production data.
- Billing/plan changes.
- Legally significant actions.
- Creating an external account that itself costs money or represents the human (not a free resource the agent provisions and can tear down).
- Any action with a real, material risk of data loss.

A session may explicitly widen this boundary for itself — if the human gives broader standing permission in that conversation, the agent can act within it without re-asking each time — but no session narrows or removes the confirm-first list above for a future session; that list is the floor, not a per-session default.
