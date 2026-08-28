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

<!-- WORLD_SERVER_DESKTOP_AI_SESSION_RECOVERY_V1_START -->
## DESKTOP AI SESSION RECOVERY V1.3 — mandatory no-idle auto-recovery protocol

- A Desktop AI chat/session is disposable. Critical task context must live in repository recovery state, not only chat memory.
- At the beginning of every interactive Desktop AI session run `npm run desktop-ai:resume` before editing.
- Independent watchdog runs every ~2 minutes and must classify reality, not UI appearance.
- `LIVE` is allowed only with observable recent progress or an active responsible worker. Required blocking work + no worker beyond the grace period is `ACTION_REQUIRED`, never `LIVE`.
- A durable timer overdue beyond grace is `SCHEDULER_OVERDUE`; watchdog may automatically kick `npm run blockers:tick` through existing locks.
- If `ACTION_REQUIRED` persists and no worker exists, watchdog may launch exactly one non-interactive OpenCode recovery worker via `opencode run`/`opencode2 run` when available.
- Automatic recovery worker must read `AGENTS.md`, `WORK_IN_PROGRESS.md`, `DESKTOP_AI_RESUME.md`, `UNFINISHED_WORK.json`, and Git reality before changing files.
- Do not duplicate a live command, blocker cycle, long-soak, deploy, or OpenCode recovery worker.
- `WAITING_VALID` is legitimate future-timer/long-soak waiting. Optional Android/iOS/remote-CAS may remain waiting and must never be fabricated as PASS.
- `STALLED` means a responsible PID exists but durable progress stopped; diagnose before killing. `DEAD` means responsible work is proven absent/dead and may be checkpointed for recovery.
- Automatic retries for an unchanged blocker fingerprint are bounded. Repeated no-progress becomes `ESCALATION_REQUIRED` instead of an infinite model/token loop.
- Never clear a live lock. Never use SKIP_FULL_VERIFY to claim readiness. Never work directly on `master` and never auto-merge `master`.
- Follow repository branch/commit/push/PR rules in `AGENTS.md`. Preserve existing working systems and regression protections.
- Final readiness still requires real `mergeSafe:true`, required `requires_ai:0`, required gates PASS, Vercel PASS, and real 8h soak certification.
<!-- WORLD_SERVER_DESKTOP_AI_SESSION_RECOVERY_V1_END -->

## 12. AUTONOMOUS AI TEAM OPERATING MODEL — постоянное правило для всех AI

**Распространяется на:** Claude, ChatGPT, Codex, OpenCode, Desktop AI и любые будущие AI-агенты. Не создавать второй дублирующий policy-файл.

### Роль владельца
Владелец: `idea → direction → priorities → subjective approval`
AI-команда: `architecture → implementation → tools → testing → debugging → deployment → monitoring → optimization → regression protection`
Не перекладывать на владельца обычные технические действия, которые AI способен выполнить сам.

### Автономное исполнение
Без дополнительного согласования выполнять **бесплатные, обратимые, технические действия с приемлемым риском**: код, рефакторинг, root-cause, bugfix, regression, тесты, builds, диагностика, оптимизация, security, Preview deployments, branches, worktrees, PR, CI fixes, smoke tests, quality gates, документация, dependency analysis, временные test env, локальные dev DB, автоматизацию. Цикл: `detect → reproduce → root cause → fix → test → regression → deploy → live verify → generalize`. Если следующий шаг доступен AI — продолжать.

### Когда обращаться к владельцу
Только для реально человеческих решений: платная покупка, billing, юридически значимое, необратимое удаление production-данных, уничтожение инфры, высокий риск, принципиальный продуктовый/художественный выбор, внешний платный аккаунт. Обычная сложность — не повод останавливаться.

### Не считать blocker
Отсутствующий бесплатный OSS-инструмент, dependency, worktree, Preview, CI fix, тест, browser/dashboard, test env, поиск другого пути — не blocker. Сначала исчерпать безопасные способы.

### Авто-установка open-source
Если нужен отсутствующий инструмент и он бесплатный, open-source, совместимый, поддерживаемый, с подходящей лицензией и не дублирует систему: `need → search existing → compare → license/security → install → configure → test → integrate`.

### Приоритет переиспользования
1. существующая система `World_server` 2. расширение 3. установленная dependency 4. package manager 5. GitHub release 6. сайт проекта 7. новый компонент. Принцип `reuse → extend → generalize`, а не `duplicate → fork`.

### Разрешённые OSS
CLI, npm/Python, Playwright, linters, scanners, profilers, DB/Vercel/Git/FFmpeg/Blender/Godot/ComfyUI/optimizers, WASM, observability, локальные AI/ML — portable/isolated предпочтительно.

### Проверка источника
Официальный репозиторий, актуальность, license, maintenance, compatibility, security, checksum/signature — не запускать случайные бинарники.

### Обновления, CPU-first, Quality Ratchet, Regression, Knowledge, Golden Components
Обновлять только при доказанной пользе (security/quality/perf/automation/reliability/compatibility/observability) через `isolated test → before/after → regression → integration`. CPU fallback обязателен, GPU не предполагать. Качество не ухудшать ради PASS (`SKIP`, `|| true`, hardcoded PASS, удаление тестов/функциональности/графики — запрещено). Каждый bug — regression protection. Подтверждённые решения — в registry с `problem/root cause/solution/evidence/test/systems/scope/source`.

## 13. MULTI-AI PEER IMPROVEMENT — обязательное правило

Когда работают ≥2 AI, каждый обязан перед новым решением проверить результаты других: commits, branches, worktrees, PR, `WORK_IN_PROGRESS.md`, отчёты, regression tests, quality reports, Golden Components, журнал исправлений.

Сравнивать по: correctness, quality, coverage, reliability, performance, scalability, maintainability, compatibility, regression risk, automation, manual effort, observability, recovery.

Принцип: `discover → compare → reuse best → improve → verify → protect → generalize → propagate`

Если решение другого ИИ лучше — переиспользовать. Если своё лучше — доказать тестами. Если сильные стороны у обоих — улучшенный третий вариант без лишней сложности. Запрещено дублировать систему, если её можно расширить.

Ни один AI не главный — истина = `tests + evidence + measurements + architecture quality` (симметрично для Claude и остальных).

**Автоматическое сравнение (Multi-AI Peer Review Gate):** обнаруживать параллельные ветки, изменённые системы, пересекающиеся решения, сравнивать тесты, находить дубликаты/reusable/conflicts, формировать список лучших, блокировать ухудшение quality metrics. Встраивать в `control plane / quality autopilot / dependency graph / Golden Registry / regression / CI`, не создавать тяжёлую новую подсистему.

Защита от конфликтов: определить `source commit → dependencies → blast radius → перенести минимум → regression → metrics → PR`. Защита от ложных улучшений: нельзя считать лучше из-за меньше строк, отключённых тестов, пониженных thresholds, `SKIP`, hardcoded PASS, удалённой функциональности/графики/покрытия.

## 14. SESSION CONTINUITY + PERSISTENT INCOMPLETE WORK QUEUE

**Прерывание (чат/смена темы/закрытие/перезапуск/смена AI) ≠ отмена задачи.** Работа активна пока не `DONE + verified + regression protected` или `explicitly cancelled by owner`.

Если пользователь прервал новой задачей: безопасно зафиксировать состояние + `Next Action` → выполнить новую → автоматически вернуться к предыдущей → продолжить.

Считать незавершённой если: `mergeSafe=false`, FAIL, blocker, тест, deploy, TODO, PR, patch, live verification, regression, `waiting` которое можно продолжить, `requires_ai`, `Next Action`, `<100%`.

Использовать существующие `WORK_IN_PROGRESS.md` + `backlog/control-plane/registry` как **persistent очередь** всей незавершённой работы (не дублировать). Для каждой задачи: Task ID, Priority, Owner, Branch, Worktree, PR, Current/Last Verified State, PASS/FAIL, Blockers, Next Action, Completion Criteria, `mergeSafe`, progress %, dependencies.

Каждая новая сессия: `AGENTS.md → WORK_IN_PROGRESS.md → unfinished-work → Git/worktrees → PR/CI → deployments → runtime` → `что осталось?` → продолжить с последнего checkpoint (`recover → verify → reuse → continue → improve`).

Задача принадлежит `World_server`, а не чату. После срочной задачи — `resume automatically` без фразы «продолжай». Незавершённая задача исчезает только при `DONE` (implementation + tests + regression + live PASS) или `CANCELLED` владельцем. Приоритет: `P0 production/security/data-loss → blockers → почти готово → активная → quality → optional`, но новая задача не стирает старые (`PAUSED, NOT CANCELLED`).

Перед завершением — записать `что сделано/не сделано`, последний PASS/FAIL, commit/branch/PR/deployment/blocker, **точную следующую команду**.

## 15. STARTUP PROTOCOL + HANDOFF

Каждая новая сессия перед изменением файлов: `read AGENTS.md → read WORK_IN_PROGRESS.md → git status → worktree list → inspect branches/PR/CI → verify real state → continue from Next Action`. Сверить `WORK_IN_PROGRESS.md` с Git/PR/CI/Vercel/tests/runtime — если устарел, обновить. Обязан `Next Action` конкретный (`redeploy PR #12 Preview after env validation...`), не `продолжить работу`.

## 16. AUTO-ENFORCEMENT

Усилить `scripts/check-agent-rules.js`, Control Plane, Quality Autopilot, CI, release gates, Golden Registry для проверки: незавершённая работа зарегистрирована, у каждой есть `Next Action`, `mergeSafe=false` не помечена DONE, FAIL не потерян, задача не исчезла после смены сессии, новая сессия прочитала continuity state.

Пользователь не должен помнить PR/commit/тест — это обязанность AI-команды. Исключение — явное `отмени/не нужно/закрой`.

Принцип: `STARTED → TRACKED → RESUMED AFTER INTERRUPTION → VERIFIED → DONE` — никакая начатая работа не теряется. Объединить с `SESSION CONTINUITY` — новая идея меняет приоритет, но не стирает старую.

<!-- ENFORCEMENT_KEYWORDS: open-source auto-install, safe AI isolation -->

## 17. COMMIT DISCIPLINE — работа существует только если она в Git

Локальная рабочая копия — это кэш, а не хранилище. Диск может исчезнуть (переустановка, сбой, новый компьютер) в любой момент без предупреждения; несохранённая работа в этом случае теряется полностью, независимо от того, сколько тестов она прошла локально.

**Правило:** после любого набора изменений, которые проходят `npm run check` (или релевантный целевой тест) и не ломают существующие gate'ы — сразу `git add` + `git commit` на текущей AI-ветке, не дожидаясь «полной готовности» фичи. Коммит дешёвый и обратимый; потерянная работа — нет.

- Не копить незакоммиченные изменения часами/днями. Если правка держится в рабочем дереве дольше одной logical-unit работы (один исправленный баг, одна подсистема, один прошедший тест) — коммитить немедленно.
- Крупная незавершённая функциональность коммитится инкрементально (WIP-коммиты на AI-ветке — нормально), а не одним гигантским коммитом в конце.
- Перед любым риском для рабочего дерева (`git checkout/reset/clean`, переустановка окружения, длинный автономный прогон) — сначала закоммитить или застэшить всё, что представляет ценность.
- Никогда не коммитить секреты (`WORLD_SERVER_SECRETS/`, `.env*`), тяжёлые regenerable-кэши (`.cache/`, `.world-server-state/`) или посторонние worktree-копии — они в `.gitignore`; см. раздел ниже про размер репозитория.
- `git push` на AI-ветку (не `master`) после коммита — тоже часть той же дисциплины: коммит без push всё ещё теряется вместе с диском.
- Это правило дополняет, а не заменяет `SESSION CONTINUITY` (14) — коммит фиксирует прогресс в Git, `WORK_IN_PROGRESS.md`/reports фиксируют *почему* и *что дальше*.

### Обязательные чекпоинты

- Никогда не держать большой объём ценной работы только локально — если её нет одновременно в Git и на `origin`, её не существует с точки зрения проекта.
- Перед любым рискованным изменением (`git reset/checkout/clean`, массовый рефакторинг, обновление зависимостей/тулчейна, переустановка окружения/ОС/Claude) — сначала `checkpoint commit + push` того, что уже проверено, потом рискованное действие.
- После каждого законченного логического этапа (баг исправлен + тест прошёл, подсистема установлена + smoke-test PASS) — `commit + push` сразу, не откладывая на «позже соберу одним коммитом».
- При длительной автономной работе — периодические WIP/checkpoint-коммиты на AI-ветке, а не один финальный коммит в конце сессии.
- Незавершённую/рискованную работу хранить закоммиченной в отдельной AI-ветке (не в рабочем дереве и не в stash), чтобы она пережила потерю диска.
- Перед известными точками разрыва (переустановка компьютера, обновление Claude Code/Windows/инструментов) — обязателен полный checkpoint commit + push непосредственно перед действием.
- Каждая сессия обязана эффективно проверять, не накопились ли давно незакоммиченные ценные изменения (`git status` с содержательным diff, не только report-шум), и если да — сделать checkpoint-коммит раньше, чем продолжать новую работу. Это проверяется `scripts/check-agent-rules.js` как часть `AUTO-ENFORCEMENT` (16).
- Если объём незакоммиченных изменений становится большим (десятки+ файлов реального кода/скриптов, не только регенерируемые reports) — не копить дальше, а немедленно создать safe checkpoint-коммит.

<!-- GAME_MOTION_POLICY_V2:START -->
## Game Motion / Frame Timeline policy V2
- Reuse existing WorldQualityAutopilot; never create a duplicate animation quality governor.
- Every game/world change: run `npm run animation:audit && npm run animation:plan`. Implement all meaningful P0/P1 animation opportunities unless runtime evidence shows a performance/gameplay regression.
- Character locomotion cadence must follow real speed/distance (LocomotionClock or native equivalent) to reduce foot sliding. Do not fake walking while physics/root is stationary.
- Use MotionGraph/state-machine for multi-state characters/mechanisms, central MotionScheduler for secondary motion, and distance/visibility LOD.
- Visual-only motion must animate visual descendants, not authoritative collision roots. Physical doors/platforms must keep animation and collision synchronized.
- Prefer native/procedural/skeletal animation. Frame timeline/APNG/WebP/sprite sequences are for exact pre-rendered motion, complex effects, reversible inspection/exploded states, or when native motion is not practical.
- Preserve user-required APNG format.
- Register runtime animation adapters with `WorldQualityAutopilot.registerAnimationAdapter`; SAFE tier must retain gameplay-critical motion and reduce only secondary effects.
- Use deterministic procedural noise when replay/sync consistency matters.
- Before major animation work run `npm run animation:oss:check`. Useful compatible OSS updates: test on a branch, verify license/changelog, run bootstrap + animation gate + full release gate. Never auto-merge untested upstream updates.
- For GLB/glTF, use isolated glTF-Transform/Meshopt tooling conservatively and verify animations/rigs before and after optimization.
- Measure frame sequences with analyze_sequence.py; repair exposure flicker/seams/interpolation only when metrics/runtime observation justify it.
- Save successful patterns and root-cause fixes through `npm run animation:knowledge` and existing server regression/quality knowledge systems. Deduplicate.
- Fix root cause and add regression protection. Do not use SKIP to hide patch failures. Iterate until all relevant tests pass.
- Never claim 100% without real desktop + mobile/runtime evidence for affected games.
<!-- GAME_MOTION_POLICY_V2:END -->
