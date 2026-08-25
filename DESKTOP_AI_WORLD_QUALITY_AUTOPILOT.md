# DESKTOP AI — WORLD QUALITY AUTOPILOT V6

## Главная задача

Установить и проверить WORLD QUALITY AUTOPILOT V6 поверх текущего `World_server`, не ломая уже работающие системы. V6 добавляет обязательный цикл **Technology Scout → Detail Adapter → Optimization Adapter → Quality Gates → Evidence → Accept/Rollback**.

Ключевое новое постоянное правило: **перед каждым циклом улучшения сначала проверять, какие графические/3D/анимационные технологии реально появились или изменились на сервере/в репозитории, и для каждой реально доступной технологии обеспечить одновременно (1) детализацию/качество и (2) оптимизацию.** Нельзя улучшать только картинку без бюджета производительности и нельзя оптимизировать ценой потери утверждённой графики.

## Снимок технологий, который был обнаружен перед сборкой V6

На master к 2026-08-24 были видны: Three.js/WebGL2; Python/FastAPI AI3D worker; AI3D auto-discovery; CPU reconstruction; Depth Anything; Blender pipeline; TRELLIS.2 adapter/GPU router; Godot voxel bridge; Hunyuan3D routing/quality postprocess; InstantMesh; voxel greedy meshing; World Quality Autopilot. В technology audit также присутствуют MPFB, UniRig, Rigify, Goo Engine и UPBGE как orchestrator-visible / runtime-not-verified. Они **не должны считаться работающими runtime-технологиями**, пока это не подтверждено фактическим runtime evidence.

V6 содержит adapter registry для: `three-webgl2`, `webgpu`, `godot`, `blender`, `cpu-reconstruction`, `depth-anything`, `instantmesh`, `trellis2`, `hunyuan3d`, `voxel-greedy`, `goo-engine`, `upbge`, `unirig`, `rigify`, `mpfb`, `world-quality`.

## Неподлежащие нарушению правила

1. Не работать непосредственно в `master`/`main`.
2. Перед изменениями прочитать `AGENTS.md`, `DESKTOP_AI_INSTALL_AND_VERIFY.md` и эту инструкцию.
3. Перед редактированием проекта обновить `WORK_IN_PROGRESS.md`.
4. Никогда не удалять и не упрощать рабочую графику ради прохождения теста/FPS.
5. Front Exact / approved Golden graphics должны сохраняться.
6. Управление, touch, коллизии, grounding, step-up и spawn не должны регрессировать.
7. Новая графическая runtime-технология не проходит release gate без **detail adapter + optimization adapter**.
8. `declared-only`, документация или наличие названия технологии не являются доказательством работающего runtime.
9. Synthetic/emulated evidence разрешено использовать для проверки контрактов, но оно не даёт production 100%.
10. Не auto-approve новые aesthetic visual baselines. Нужное утверждение пользователя/человека должно быть явно зафиксировано.
11. GPU-пути являются дополнительными. Основной маршрут должен оставаться рабочим без платного GPU. Использовать CPU-first/free-local путь, если качество и время приемлемы.
12. Не делать auto-merge. Winner-only candidate можно подготовить только в AI-ветке и только после всех gates.

## Обязательное правило «не останавливаться»

Desktop AI **не завершает задачу, пока существует хотя бы одна воспроизводимая ошибка в обязательных проверках, которую можно исправить в репозитории**. Цикл обязателен:

`найти ошибку → определить первопричину → исправить минимально → добавить/обновить regression test → повторить затронутый тест → повторить полный gate → проверить, не появились ли новые ошибки`.

Повторять цикл до тех пор, пока все воспроизводимые обязательные ошибки не исправлены. Если остаётся внешний блокер (например, нет физического iPhone, реального rig, credentials/provider), его нельзя маскировать или заменять synthetic proof: записать blocker в `WORK_IN_PROGRESS.md`/отчёт и **не заявлять соответствующую внешнюю проверку как 100%**.

## Порядок внедрения

### 1. Подготовка ветки

```powershell
git checkout master
git pull origin master
git status
git checkout -b ai/desktop/world-quality-autopilot-v6
```

Если ветка V6 уже существует, не создавать вторую с тем же именем: перейти на неё и убедиться, что она основана на актуальном master.

### 2. Сначала проверить, что нового появилось на сервере

До запуска installer:

```powershell
npm run tech:audit
node scripts/discover-ai3d-engines.js
```

Если одна из команд отсутствует — не считать это фатальной ошибкой автоматически: сначала проверить текущий `package.json` и реальные существующие scripts. Сохранить актуальные `TECHNOLOGY_AUDIT.json`, `TECHNOLOGY_RUNTIME_HEALTH.json` и local inventory, если они генерируются проектом.

Отдельно просмотреть:
- `services/ai3d-worker/ai3d/plugins/`
- `apps/`
- `shared/`
- `vendor/`
- `data/technology-orchestrator.json`
- `services/ai3d-worker/third_party/local-inventory.json`
- актуальные открытые PR с графическими технологиями

Любая новая реально доступная графическая технология должна попасть в V6 report. Локальные/remote git refs с названиями графических технологий попадают в candidate-intake, но никогда не считаются runtime до checkout + повторного scout. Отдельно проверить runtime-resilience report на CDN/network-only зависимости и наличие проверенного local vendor. Если scout обнаружит неизвестный graphics package, release блокируется до явного adapter review.

### 3. Установить V6

Из корня `World_server`:

```powershell
node <ПУТЬ_К_ПАПКЕ_V6>\install-world-quality-autopilot.cjs --repo . --verify-full
```

Либо запустить `apply_world_quality_autopilot.bat` из пакета. Installer должен работать транзакционно: при провале обязательной проверки изменения проекта должны быть откатаны, а `WORK_IN_PROGRESS.md` должен явно показывать failure.

### 4. Проверить Technology Scout отдельно

```powershell
npm run quality:world:tech-scout
npm run quality:world:tech-candidates
npm run quality:world:runtime-resilience
npm run quality:world:tech-integrate
npm run quality:world:cpu
npm run quality:world:tech-route
npm run quality:world:tech-drift
npm run quality:world:evidence-provenance
```

Проверить файлы:
- `WORLD_GRAPHICS_TECHNOLOGY_REPORT.json`
- `WORLD_TECHNOLOGY_CANDIDATE_REPORT.json`
- `WORLD_RUNTIME_DEPENDENCY_RESILIENCE_REPORT.json`
- `WORLD_GRAPHICS_TECHNOLOGY_INTEGRATION_REPORT.json`
- `WORLD_GRAPHICS_TECHNOLOGY_DRIFT_REPORT.json`
- `WORLD_CPU_GRAPHICS_OPTIMIZATION_REPORT.json`
- `WORLD_GRAPHICS_QUALITY_ROUTING_REPORT.json`
- `WORLD_EVIDENCE_PROVENANCE_REPORT.json`

Требование: `technologyConnectivityPercent = 100` для реально runtime-detected известных технологий и `blockers = []`. Не добиваться 100 удалением технологии из отчёта или переименованием evidence.

После первой подтверждённой интеграции текущего набора технологий можно зафиксировать lock:

```powershell
npm run quality:world:tech-accept
```

Делать это только после PASS. В следующих версиях новая технология должна показываться drift gate как новая до того, как для неё появятся проверенные detail/optimization adapters.

## Что именно V6 должен применять к технологиям

### Three.js / WebGL2

Детализация: semantic detail zones, hero landmark budget, PBR/material profiles, near-field detail. Оптимизация: Instancing/greedy meshing где подходит, internal-face culling, HLOD, frustum/visibility culling, adaptive DPR, texture/atlas budget, shader cost audit. Проверить удалённые CDN imports; если локальный проверенный vendor уже существует, предпочитать локальный runtime без изменения лицензии/версии вслепую.

### Voxel pipeline

Детализация: hidden-side volume, roof/cornice/window/spire/ground micro-detail при строгом front-projection invariant. Оптимизация: greedy meshing, chunking, HLOD, streaming topology/prefetch, visibility budget, memory budget.

### CPU Reconstruction + Depth Anything

Детализация: depth-aware importance, silhouette-preserving side volume. Оптимизация: small-first depth input, deterministic cache, bounded resolution, NumPy/vectorized work, post mesh optimizer, worker/process parallelism только с контролем памяти.

### Blender

Если реальный Blender runtime найден: использовать как offline quality stage для procedural detail, hidden geometry cleanup, material consolidation, LOD/decimate candidates и bake maps. Любая destructive операция требует копию/отдельный candidate и сравнение до/после.

### Godot

Если Godot runtime действительно доступен: подключить MultiMesh/visibility ranges/mesh LOD/occlusion/baked-lighting contracts; качество hero объектов не снижать вместе с дальними объектами. Прогнать headless + Web export + desktop/mobile smoke для затронутых сцен.

### InstantMesh / TRELLIS.2 / Hunyuan3D

Эти маршруты не считать доступными только потому, что adapter существует. Если runtime доказан — после генерации обязательно mesh-quality optimizer, LOD tiers, texture budget, silhouette/reference check и final playable gate. Если GPU недоступен, маршрут должен корректно уйти в CPU/другой бесплатный fallback, а не выдавать placeholder как success.

### Goo Engine / UPBGE

Пока runtime не доказан — только integration plan. После реального обнаружения: для Goo Engine добавить toon/outline/light detail budget + shader variant/outline distance/material-pass optimization; для UPBGE — Blender procedural detail + scene culling/LOD/batching/texture budget. После этого добавить реальные tests и только затем пометить runtime-integrated.

### UniRig / Rigify / MPFB

Подключать через universal retarget contract. Детализация: semantic bone/deformation/human detail. Оптимизация: deform-bones-only export где допустимо, animation LOD, pose cache, distance budget. Требуется реальный generated/Roblox/Godot rig evidence.

## CPU-first режим

Запустить:

```powershell
npm run quality:world:cpu
```

Проверить, что `paidGpuRequired=false`. Не добавлять платный GPU как обязательную зависимость. При наличии нескольких CPU-ядер использовать контролируемый worker budget, но не создавать больше тяжёлых workers, чем позволяет память/система. Сначала ускорять алгоритм: chunking, caching, dedup, greedy meshing, visibility, LOD, предварительные bake/metadata, затем увеличивать параллелизм.

## Графика и детализация: обязательные проверки

```powershell
npm run quality:world:semantic
npm run quality:world:materials
npm run quality:world:shader-cost
npm run quality:world:visibility
npm run quality:world:streaming
npm run quality:world:multiview
```

Проверить, что:
- front projection не изменился;
- hero/landmark detail protected;
- новые PBR/texture candidates не destructively заменяют Golden assets;
- shader/material cost не превышает budget;
- дальняя детализация снимается раньше hero/detail near field;
- streaming не создаёт дыр/поппинга на критическом маршруте;
- synthetic front invariant не ошибочно засчитан как human aesthetic baseline.

## Анимация

```powershell
npm run quality:world:animation
npm run quality:world:animation-lod
npm run quality:world:retarget
npm run quality:world:replay
```

Проверить feet direction, attack direction, shield orientation/coverage, handgun hand lock, two-hand rifle/machinegun, root motion, foot sliding, jitter. Synthetic rig PASS — только contract evidence. Для production 100 нужен реальный rig playback.

## Полный цикл

```powershell
npm run quality:world
npm run quality:world:full
npm run release:gate
```

Если проект имеет Playwright/golden tests, дополнительно запускать актуальные desktop + mobile проекты из текущего `playwright.config.js`. Не копировать старую команду, если имя spec/project изменилось: сначала прочитать актуальную конфигурацию.

После каждого исправления полный `release:gate` запускается заново.

## Что считать ошибкой

Ошибка — это не только красный test. Исправлять также:
- новый runtime graphics tech без dual adapter;
- неизвестный graphics dependency;
- false-green assertion;
- synthetic evidence, которое ошибочно повышает production score;
- падение FPS/P95/memory budget;
- ухудшение mobile touch;
- инверсия WASD/стрелок после yaw;
- collision/spawn/grounding regression;
- потеря Golden graphics;
- исчезновение hero detail из-за LOD/culling;
- runtime placeholder, выданный как verified graphics/3D;
- CDN/runtime dependency regression, если в проекте уже есть проверенный локальный vendor.

## После PASS

```powershell
git status
git diff --check
git diff
```

Убедиться, что отчёты соответствуют последнему запуску. Затем:

```powershell
git add ...
git commit -m "feat(quality): install World Quality Autopilot V6 technology-aware CPU-first"
git push -u origin ai/desktop/world-quality-autopilot-v6
```

Создать PR в `master`. Не auto-merge. В PR записать: новые технологии, какие detail adapters добавлены, какие optimization adapters добавлены, результаты targeted tests, `quality:world`, `release:gate`, desktop/mobile evidence, external blockers.

## Финальное условие завершения Desktop AI

Задача завершена только когда одновременно:
- все воспроизводимые обязательные ошибки исправлены;
- targeted V6 tests PASS;
- technology connectivity 100% для runtime-detected supported tech;
- technology drift PASS;
- CPU route PASS;
- quality:world PASS;
- release:gate PASS;
- нет регрессии controls/collisions/mobile/approved visuals/performance;
- external evidence честно отделено от synthetic/emulated evidence;
- `WORK_IN_PROGRESS.md` содержит финальные доказательства;
- ветка/PR готовы к проверке.

Если любой пункт не выполнен — продолжать поиск первопричины и исправление. Исключение только для действительно внешних недоступных факторов; их документировать как blocker и не подменять имитацией.
