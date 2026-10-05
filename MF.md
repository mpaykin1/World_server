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

## MF-02 — Trinity Lab

**ID:** `trinity-lab`

**Статус MF:** `must-finish / in-progress`

**Канонический handoff:** `docs/TRINITY_LAB_MF_HANDOFF.md`

Что уже принято пользователем:
- unified Trinity MVP — **SUCCESS**;
- одна canonical semantic scene / layout / camera для KRIEGER, INK и CUBE;
- KRIEGER quality baseline сохранён;
- INK использует Living Watercolor 3D;
- CUBE использует voxel-art adapter;
- deterministic cross-style parity подтверждён.

Текущий checkpoint: `98c9ddd2c0f09474fc2a199d4c640fae6e925314` на `ai/chatgpt/trinity-lab`.

Что обязательно доделать:
- разные локации, возникающие впереди по мере движения;
- bounded streaming/unload старых локаций;
- FIRE и SWITCH оружия;
- несколько semantic WeaponSpec;
- одно оружие в KRIEGER / INK / CUBE без расхождения world state;
- selective deep-black accents в INK;
- mobile/performance и production link certification.

Последний известный candidate URL: `https://deploy-preview-400--world-server.netlify.app/apps/trinity-lab/`.

Это locator, а не live-proof. Перед выдачей пользователю ссылка должна быть заново проверена.

Trinity остаётся в MF до выполнения completion criteria в `data/must-finish.json` и явного закрытия пользователем.
