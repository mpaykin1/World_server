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



## MF-03 — Living Light Cat 3D V4

**ID:** `living-light-cat-3d-v4`  
**Статус MF:** `must-finish / in-progress`  
**Канонический handoff:** `docs/LIVING_LIGHT_CAT_V4_MF_HANDOFF.md`

Сохранённый фундамент:
- V2 принят пользователем как SUCCESS и остаётся анимационным эталоном;
- V4 сохраняет реальный 3D rig/motion;
- хвост уже привязан к animated `spine`;
- хвост имеет action-aware spline motion;
- LIGHT поддерживает directional/projected-edge weighting.

Что обязательно доделать:
- тело не должно быть обведено целиком;
- толщина линии должна заметно меняться от света;
- хвост должен двигаться вместе с туловищем и плавно менять положение;
- хвост тоже не должен быть обведён целиком;
- не регрессировать V2-анимации и мобильную подачу;
- получить явное подтверждение владельца перед закрытием MF.

Locator: `https://world-server.mmmpaykin.workers.dev/apps/living-light-cat-3d-v4/`

Ссылка в MF — locator, а не live-proof; перед выдачей пользователю нужна свежая проверка.
