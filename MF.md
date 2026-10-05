# MF — Must Finish

**MF = Must Finish = проекты World Server, которые пользователь явно потребовал обязательно довести до конца и не потерять между чатами.**

Канонический машинный источник: `data/must-finish.json`.

## Правила MF

1. MF — **не новая автоматизация** и не шестая AKA-задача. Это постоянный приоритетный реестр.
2. Любой новый чат/AI, если пользователь говорит `MF`, `Must Finish`, «обязательно доделать», «что мы должны закончить», обязан открыть этот файл и `data/must-finish.json`.
3. MF-item нельзя удалять, закрывать или переводить в `done` только потому, что есть рабочий MVP, PR или зелёный тест.
4. Закрытие требует:
   - выполнены машинные completion criteria;
   - сохранён regression protection;
   - есть стабильный канонический источник/деплой;
   - пользователь явно подтвердил, что проект можно считать законченным или вывести из MF.
5. Если ссылка в MF старая, она является **locator**, а не доказательством работоспособности. Перед выдачей пользователю ссылка обязана пройти текущий Verified Link Delivery gate.
6. Явная новая команда пользователя сильнее порядка MF. После текущей задачи MF используется как список обязательных незакрытых проектов.

## MF-01 — Gothic Destruction MVP

**ID:** `gothic-destruction-mvp`  
**Статус MF:** `must-finish / in-progress`  
**Канонический handoff:** `docs/GOTHIC_DESTRUCTION_MVP_HANDOFF.md`

Что уже успешно:
- процедурная готическая башня и виадук;
- пушечный выстрел;
- structural-support damage/collapse;
- независимые Rapier voxel rigid bodies;
- пользователь подтвердил физику разлёта: **«камни разлетаются хорошо»**;
- графический HUD сокращён до мира + прицела + FIRE;
- восстановлен стабильный GitHub Pages mirror после исчезновения временного Workers preview.

Последний известный стабильный mirror:

`https://mpaykin1.github.io/scratch-chain-reaction/apps/gothic-destruction-mvp/`

**Важно:** перед повторной отправкой пользователю URL нужно снова live-проверить; MF хранит адрес для восстановления контекста, а не заменяет delivery gate.

Проект остаётся в MF, пока не выполнены оставшиеся критерии в `data/must-finish.json` и пользователь явно не закроет его.

## MF-02 — Unified Matter + Voxel Physics / Noita scenes

**ID:** `unified-matter-voxel-runtime`  
**Статус MF:** `must-finish / in-progress`  
**Канонический handoff:** `docs/UNIFIED_MATTER_VOXEL_MF_HANDOFF.md`  
**Код:** PR #432, branch `ai/chatgpt/matter-voxel-unified-runtime-cloud`

Цель: полностью воспроизводить описанные Noita-подобные последовательные сцены одной общей системой и выполнять те же операции как над 2D pixel cells, так и над 3D voxels.

Сохранённый checkpoint:
- exact head `1ec080f325bfa50847a64edfd7ca55e44394cc9d`;
- CI / Quality Regression / Cloudflare exact-head / Golden Fleet / Science / Independent Fleet / Visual Baseline / Autopilot / Godot preview — **PASS** на этом SHA;
- shared matter, structure support, detached clusters, pressure/fracture, pixel+voxel adapters, sequencer, renderer bridge и Voxel World integration уже закоммичены;
- последний инженерный readiness estimate: **72%** (ориентир, не release gate).

Главное оставшееся: актуализировать PR #432 относительно нового `master`, слить безопасно, затем доказать полный последовательный reference-scene demo, persistence/realtime и high-density/mobile performance.

Проект остаётся в MF, пока не выполнены критерии из `data/must-finish.json` и пользователь явно не закроет его.

## MF-03 — Living Watercolor 3D / Illustration Worker

**ID:** `living-watercolor-3d`  
**Статус MF:** `must-finish / in-progress`  
**Канонический handoff:** `docs/LIVING_WATERCOLOR_3D_HANDOFF.md`  
**Код:** branch `ai/chatgpt/living-watercolor-3d`, preserved head `4f73c56fbd7fb5893876b38bd50db2c60cf31505`

Сохранённые успехи:
- house / tree / power-plant benchmarks;
- Illustration-First volcano + volcano smoke;
- KayKit motion transfer;
- 139 source clips / 132 unique motions.

Главное незавершённое: финальная рисовка работника ещё не принята пользователем. Нужно сохранить цельное torso→pelvis→legs, большой овальный head shell, пиджак заметно темнее рубашки, читаемые чёрный галстук и портфель, не ломая анимации и эталонные объекты.

Recovery locator:

`https://mpaykin1.github.io/scratch-chain-reaction/living-watercolor-3d/?object=worker`

**Важно:** stored URL не является live proof. Проект остаётся в MF до явного пользовательского принятия финальной рисовки и owner closure.

