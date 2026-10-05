# MF — Must Finish

**MF = Must Finish = проекты World Server, которые пользователь явно потребовал обязательно довести до конца и не потерять между чатами.**

Канонический машинный источник: `data/must-finish.json`.

## Правила MF

1. MF — **не новая автоматизация** и не шестая AKA-задача. Это постоянный приоритетный реестр.
2. Любой новый чат/AI, если пользователь говорит `MF`, `Must Finish`, «обязательно доделать», «что мы должны закончить» или называет один из MF-проектов, обязан открыть этот файл, `data/must-finish.json` и handoff соответствующего проекта.
3. MF-item нельзя удалять, закрывать или переводить в `done` только потому, что существует MVP, PR, зелёный тест или рабочая ссылка.
4. Закрытие требует выполненных completion criteria и явного подтверждения пользователя, что проект можно считать законченным или вывести из MF.
5. Сохранённые URL — locator/recovery data, а не доказательство текущей работоспособности. Перед выдачей пользователю ссылка должна пройти актуальный Verified Link Delivery gate.
6. Явная новая команда пользователя сильнее порядка MF. После текущей задачи MF остаётся списком обязательных незакрытых проектов.

## MF-01 — Gothic Destruction MVP

**ID:** `gothic-destruction-mvp`  
**Статус:** `must-finish / in-progress`  
**Handoff:** `docs/GOTHIC_DESTRUCTION_MVP_HANDOFF.md`

Сохранённый успех:
- процедурная готическая архитектура;
- пушечный удар;
- structural-support collapse;
- независимые voxel rigid bodies;
- пользователь подтвердил: **«камни разлетаются хорошо»**;
- стабильный recovery mirror сохранён в handoff.

Главное оставшееся: довести World Server production certification без регрессии физики разлёта и получить явное owner closure.

## MF-02 — Unified Matter + Voxel Physics / Noita scenes

**ID:** `unified-matter-voxel-runtime`  
**Статус:** `must-finish / in-progress`  
**Handoff:** `docs/UNIFIED_MATTER_VOXEL_MF_HANDOFF.md`  
**Код:** PR #432, branch `ai/chatgpt/matter-voxel-unified-runtime-cloud`

Цель: полностью воспроизводить описанные Noita-подобные последовательные сцены одной общей системой и выполнять те же операции как над 2D pixel cells, так и над 3D voxels.

Сохранённый checkpoint:
- exact head `1ec080f325bfa50847a64edfd7ca55e44394cc9d`;
- CI / Quality Regression / Cloudflare exact-head / Golden Fleet / Science / Independent Fleet / Visual Baseline / Autopilot / Godot preview — **PASS** на этом SHA;
- shared matter, structure support, detached clusters, pressure/fracture, pixel+voxel adapters, sequencer, renderer bridge и Voxel World integration уже закоммичены;
- последний инженерный readiness estimate: **72%** (ориентир, не release gate).

Главное оставшееся: актуализировать PR #432 относительно нового `master`, слить безопасно, затем доказать полный последовательный reference-scene demo, persistence/realtime и high-density/mobile performance.


## MF-03 — Living Light Cat 3D V4

**ID:** `living-light-cat-3d-v4`  
**Статус:** `must-finish / in-progress`  
**Handoff:** `docs/LIVING_LIGHT_CAT_V4_MF_HANDOFF.md`

Сохранённый фундамент:
- V2 уже принят пользователем как SUCCESS;
- V4 продолжает тот же 3D rig/animation baseline, не заменяя его;
- хвост привязан к animated `spine` и имеет action-aware spline motion;
- LIGHT уже умеет directional partial-rim / projected-edge weighting.

Главное оставшееся: добиться визуально **неполной** обводки тела и хвоста, сохранить разную толщину линии, сделать движение хвоста естественно связанным с туловищем и получить явное owner closure.

Канонический locator: `https://world-server.mmmpaykin.workers.dev/apps/living-light-cat-3d-v4/`.

Проект нельзя считать законченным только потому, что V4 merged или ссылка открывается.


## MF-03 — Reference Visual → Game Graphics Compiler

**ID:** `reference-visual-game-graphics`  
**Статус:** `must-finish / in-progress`  
**Handoff:** `docs/REFERENCE_VISUAL_MF_HANDOFF.md`  
**Core:** PR #412 + stacked PRs #423–#430

Цель: дать World Server изображение или видео-референс и получить **новую игровую графику с тем же визуальным языком по сути** — сопоставимой детализацией, светом, материалами, камерой и движением — для voxel/3D/sprite/LIGHT/watercolor lanes.

Сохранённый checkpoint:
- Visual Grammar + lane router;
- CPU raw image/video analyzer;
- temporal motion grammar;
- bounded render→compare→autotune loop;
- reference-derived 2D sprite atlas;
- восстановленный Living Watercolor stack;
- reference material/PBR reconstruction;
- perceptual fidelity;
- последний engineering readiness estimate: **78%** (ориентир, не release gate);
- пользователь **ещё не выносил PASS/FAIL** по завершённости этой системы.

Главное оставшееся: безопасно интегрировать стек в `master`, доказать глубокое semantic vision уровня «собор/арка/мост/окно/персонаж», затем доказать полный raw-video→generated-game→render-back→autotune цикл на реальных 3D и 2D референсах и получить явное owner closure.

---

MF не заменяет `WORK_IN_PROGRESS.md`: WIP описывает текущую работу, а MF хранит **обязательство не бросить проект между чатами**.
