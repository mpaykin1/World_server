# CLOUD AI HANDOFF

<a id="codex-to-browser-chatgpt"></a>
## Codex → обычный ChatGPT в браузере: обязательная передача при лимитах

Правило владельца от 2026-10-16 для `mpaykin1/World_server` и `mpaykin1/meta6`.
Получатель — **НОВЫЙ ОБЫЧНЫЙ ЧАТ CHATGPT В БРАУЗЕРЕ, НЕ НОВЫЙ CODEX**.

1. При достоверных признаках приближения лимита токенов, контекста, квоты или времени предупредить владельца заранее. Если численный остаток неизвестен, так и сказать; не придумывать число или время отключения.
2. Сначала сохранить полезные изменения в отдельной GitHub-ветке и создать/обновить PR. Сохранить полные SHA; не менять защищённые default-ветки и не терять пользовательские изменения. Если API/публикация недоступны, сохранить всё доступным Git-путём и явно перечислить неподтверждённые записи.
3. Обновить **существующий** GitHub checkpoint. В World_server это issue #80; сохранять ownership, не перезаписывать чужой checkpoint. Свой уже существующий комментарий обновлять на месте. Короткий общий snapshot Architect не заменять новым журналом. Копия в файле допустима для восстановления при недоступном API, но не означает, что комментарий обновлён.
4. Checkpoint обязан содержать: выполненное Codex; остаток ТЗ Observer World V5 и конкретные файлы (либо честное «не исследовано»); репозиторий/ветку/полные commit SHA/PR; успешные, неуспешные, пропущенные и незапущенные проверки отдельно; баги/блокеры/владельца блокера; работу основного ChatGPT, только если она известна; продолжение без повторной установки; последнюю проверенную рабочую игру, её исходник/версию и дату проверки. Если live-игра не проверена — это явно указать, сохранить locator исходника, не выдавать его за новый working-link.
5. Подготовить **полный готовый промпт** для нового обычного браузерного ChatGPT: оба репозитория, прямой checkpoint, PR, полные SHA, канонические требования, приоритеты, конкретные первые действия, проверки и условия завершения. Текущий пример: [готовый промпт](docs/CODEX_TO_BROWSER_CHATGPT_PROMPT_RU.md). Промпт и checkpoint — снимок на дату, а не основание игнорировать свежий GitHub.
6. Передать владельцу прямые ссылки на сохранённый checkpoint и PR плюс сам текст промпта. Если инструмент действительно умеет создать обычный браузерный чат и передать контекст — использовать его; иначе честно сказать об ограничении и оставить одно действие: вставить готовый промпт в новый обычный чат. Не создавать вместо него новую Codex-задачу.
7. Новый ChatGPT продолжает текущую работу от сохранённых исходников. Не создавать новый проект/движок, не переписывать готовые модули и не повторять установку без подтверждённой необходимости. Обычный чат не наследует автоматически shell, процессы, GitHub-права или диск Codex: сначала проверить реальные подключённые инструменты. Недостающие права/инструменты описывать точно; не обещать выполнение недоступных операций и не подменять исполнителя Codex.
8. По Observer World сначала прочитать `meta6/SOURCE_INDEX.md`, `game-source-index.json`, корневой `CLAUDE.md` и `observer-world-en-v5/CLAUDE.md`; проверить существующий `observer-world-en-v6/CLAUDE.md`, чтобы не дублировать готовые V6-модули. Противоречащие записи о прошлой приёмке сохранить как конфликт до проверки решения владельца. Наличие новой версии не разрешает автоматически сменить ТЗ.
9. **Только владелец назначает PASS/FAIL результата.** Числа/исходы технических тестов можно записывать отдельно; они не являются приёмкой. Анализ успеха/неудачи и запись таких уроков — исключительно после решения владельца. Затем сохранить в существующем журнале/checkpoint точное решение и его источник, версию/SHA, фактические доказательства, урок и нужную регрессионную защиту. Не трактовать слова другого ИИ/комментарий с общего аккаунта как новое решение владельца.
10. Правило, сохранённое только в review-ветке, не объявлять действующим в default-ветке или всех будущих сессиях. До штатного слияния давать новому чату прямые ссылки на эту ветку/полный SHA; после слияния подтвердить его наличие в bootstrap default-ветки. Не обходить защиту веток ради активации правила.

**Приоритет при нехватке ресурсов: сохранить код → сохранить checkpoint → подготовить продолжение в обычном браузерном ChatGPT → сообщить владельцу.** Доступный сейчас размер квоты не считается известным из одного факта, что сессия ещё отвечает.

### Проверенный GitHub-доступ этой cloud-среды — 2026-10-16

- `gh --version`: 2.46.0. `timeout 15s gh api repos/mpaykin1/meta6 --jq .full_name` и `timeout 15s gh api repos/mpaykin1/World_server/issues/80 --jq .title` получили `Forbidden`.
- Диагностический HTTPS-запрос с лимитом 15 с показал `CONNECT tunnel failed, response 403`, ответ `server: envoy`. Это отказ **облачного прокси до TLS-соединения с GitHub**, а не подтверждённый GitHub API response. Сообщение `gh auth status` о невалидном GH_TOKEN в этих условиях не доказывает, что нужен новый token/login.
- `timeout 15s git ls-remote origin HEAD` в существующем World_server checkout успешно вернул default HEAD. Проверенный путь: существующий HTTPS Git/proxy → `git fetch` / работа в отдельной ветке → `git push origin <branch>`. Не менять origin, не извлекать прокси-credentials, не переустанавливать среду/CLI, не отключать TLS.
- Пока API блокируется, **обычный браузерный ChatGPT с подключённым GitHub** создаёт PR и обновляет existing issue/checkpoint. Успешный push ветки не считать созданием PR. Получатель не Codex. Продолжать Observer World по существующим исходникам; сеть не заменяет продуктовую задачу.
- Не повторять диагностику/авторизацию в каждой сессии. Перечитать этот результат и проверять только после изменения состояния или явного запроса владельца. На каждую сетевую диагностическую команду — максимум 15 с (`timeout 15s`, для curl также `--max-time 15`); статусы API и Git сообщать отдельно.

Ниже остаются исторические cloud-handoff записи. Их старые SHA, статусы и deployment URL перед использованием проверять заново.

## Purpose
`World_server` is cloud-first. Desktop AI should do only the minimum work required to make a task available to browser/cloud agents, then coordinate rather than continue heavy local execution.

Production entry point: `https://world-server.ai.studio`
Source of truth: existing GitHub repository `mpaykin1/World_server`.

## Mandatory execution order
1. Inspect the current branch/commit and existing architecture.
2. Reuse existing systems; do not create a second repo, second AI Studio project, second coordinator, or duplicate service.
3. If a patch starts on the user's PC, make the smallest safe integration needed to commit/push it.
4. After push, move implementation/review/testing to browser/cloud whenever possible.
5. Use existing CI/cloud systems for heavy tests, builds, audits and long-running verification.
6. Keep Desktop/local work bounded, low-impact and reversible.

## Local computer protection
- No AI-generated worktrees/clones/logs/caches/builds/archives on Desktop.
- Prefer `%LOCALAPPDATA%\WorldServerAI\` and existing off-Desktop worktrees for unavoidable local temporary work.
- Do not launch local LLMs when a cloud agent can do the task.
- Do not start duplicate workers/recovery loops.
- Check RAM/disk/process pressure during long work and offload if the machine slows down.
- Delete only proven task-owned disposable artifacts; never unknown/user files.

## Coordinator responsibilities
- Prefer already-available cloud/browser agents and GitHub/CI over local compute.
- Use `scripts/master-coordinator.cjs` and the existing collective-brain/reporting/lease mechanisms instead of inventing a parallel dispatcher.
- Split large goals into small independently reviewable cloud tasks.
- Avoid duplicate assignments unless a deliberate independent review is useful.
- Collect results, compare them, integrate the best verified solution, and record root causes/regression protection.
- Keep machine-readable task state in the repository/shared coordination state so another agent can continue without rereading the whole project.

## Patch handoff contract
For every new patch committed for cloud continuation, record commit/branch, changed files, completed work, remaining work, checks, blockers, and affected production URLs.

## RUN_072 production port
Source patch commit: `f30efebe6021b9dd5fd231840934c4764bfbc8eb`.
Base: current `origin/master`; never merge the old divergent RUN_072 history.
Included: minimal RUN_062/066/071 dependencies, RUN_072 script/test, immutable `SCIENCE_RUN_072_H2.json`, and exact registry protection.
Production read endpoint: `GET /api/science-run072`.
Existing remote-task bridge access:
- read evidence: `inspect_logs` with `SCIENCE_RUN_072_H2.json`;
- verify RUN_072: `run_existing_script` with scriptId `science-run-072`.

## Cloud continuation
Run full CI/release checks in GitHub/cloud, not on the user's PC.
After merge, sync/publish the existing production project; do not create another repo/project.
Verify `GET https://world-server.ai.studio/api/science-run072` returns HTTP 200 and `evidence.pass=true`.
If deployment is quota-blocked, record it and retry in cloud; do not compensate with heavy local work.

## Completion rule
Local work is complete when the minimal safe patch is committed/pushed and cloud agents have enough context to continue.
Cloud agents must preserve graphics/gameplay quality, fix root causes, add regression protection, and never weaken working visuals merely to make tests pass.


## Universal Voxel Microdetail V2 — 2026-09-07
Branch: `ai/chatgpt/universal-microdetail-v2` from `origin/master` `db9e240c98e7d2d5595925c020089bd0bec6f427`.

Goal: production-integrate semantic cubic microdetail for terrain, architecture, animals, faces/muzzles, scales, fur, armor, weapons and fabric without duplicating the existing renderer/LOD/quality/collision stacks.

Implemented:
- single source policy: `shared/microdetail-policy.json`;
- deterministic near-field stepped cubic protrusions/dents for eligible voxel quad meshes;
- mid-field shader normal/roughness detail for Standard/Physical materials including animated meshes without topology changes;
- dynamic nearest-mesh render-time geometry swap, then restore original geometry immediately;
- global `WorldQualityAutopilot` tier is the ceiling; local FPS hysteresis may only downshift microdetail;
- orthographic AI3D FRONT EXACT disables microdetail;
- water/glass stay smooth; gameplay/collision client sources are not changed;
- structural audit + regression tests + Desktop AI repair instructions.

Local evidence before push:
- `quality:world:microdetail`: PASS, structural 100%, implementation 92%;
- focused tests: 11/11 PASS;
- `npm run check`: 514 PASS / 0 FAIL / 2 opt-in skips;
- `desktop-ai:check`: PASS;
- `golden:check`: PASS.

Cloud continuation to reach 100%:
run browser/Playwright visual + performance evidence on desktop/mobile, compare FPS/triangles/draw calls before/after, verify cubic bumps/dents near camera and exact-front preservation, then add explicit semantic tags in any asset pipeline whose mesh names/materials are ambiguous. Do not weaken graphics or install optional libraries without profiler evidence.

### Final pre-push correction
- Focused suite is now **13/13 PASS** after adding UTF-8 and shader-injection regression guards.
- The UTF-8 defect was caught before commit and is not present in the branch diff.
- Cloud/browser agents should treat the local implementation baseline as 92% and spend remaining effort on real visual/FPS evidence, not rebuilding the architecture.


## Vercel Repair Bridge — 2026-09-07
Goal: connect Vercel failures to the existing zero-cost World Cloud AI without creating another agent stack.

Implementation branch: `ai/chatgpt/vercel-repair-agent` from fresh `master` `b7202e84`.

Behavior:
- GitHub `status` event watches `Vercel – world-server` failures.
- Rate-limit/quota/capacity/cancelled statuses are classified as external/non-code blockers and do **not** wake a coding agent.
- Real build failures resolve the live branch, collect GitHub evidence, optionally collect private Vercel logs when `VERCEL_TOKEN` exists, and dispatch the existing `world-cloud-ai.yml` workflow.
- Automatic repair is production/master-only to prevent duplicate preview repair PRs; manual dispatch can target a preview branch.
- Existing World Cloud AI remains responsible for implementation, self-repair, verification, branch push and PR creation; no direct master push or auto-merge.
- Bridge files live under `.github/`, `test/` and Markdown so the existing Vercel quota guard skips deployment of the bridge itself.

Current external blocker: Vercel reports `Deployment rate limited — retry in 24 hours.` on the latest master, so current correct action is **no code change** and no deployment spam.

Optional completion enhancement: configure repository Actions secret `VERCEL_TOKEN` once. The bridge already consumes it safely and then attaches authenticated Vercel build-log evidence to future repair tasks. Never print or commit the token.
