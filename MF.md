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

---

MF не заменяет `WORK_IN_PROGRESS.md`: WIP описывает текущую работу, а MF хранит **обязательство не бросить проект между чатами**.
