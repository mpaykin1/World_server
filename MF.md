# MF — MUST FINISH

**MF** = список проектов World Server, которые пользователь явно приказал обязательно довести до законченного состояния.

Это корневой discovery-файл. Любой новый чат/AI, который видит слова **MF**, **Must Finish**, **must finish**, **обязательно доделать** или название проекта из списка ниже, должен открыть этот файл и машинный реестр `data/must-finish.json` прежде чем придумывать новый план или новый MVP.

## Правила MF

1. Проект остаётся в MF, пока пользователь явно не подтвердит, что его можно считать законченным или убрать из списка.
2. Внутренний тест, CI PASS, структурный gate или высокий процент **не заменяют пользовательское визуальное/поведенческое подтверждение**, если оно требуется проектом.
3. Нельзя начинать дубль проекта с нуля, если в MF уже указаны канонические пути, handoff и рабочая публичная версия.
4. При продолжении сначала восстановить последний committed state и известные SUCCESS / FAILURE, затем работать дальше.
5. Существующие пользовательски одобренные эталоны не ломать ради исправления незавершённой части.

## Активные MF-проекты

### MF-001 — Living Watercolor 3D / Illustration Worker

**Статус:** MUST FINISH — visual acceptance pending.

**Цель:** довести Living Watercolor 3D до состояния, где анимированный офисный работник визуально соответствует принятому пользователем эскизу, сохраняя принятые акварельные эталоны и всю библиотеку KayKit-анимаций.

**Канонический код World Server:**
- `apps/living-watercolor-3d/`
- `shared/graphics/living-watercolor-3d.js`
- `shared/graphics/living-watercolor-generators.js`
- `shared/graphics/living-watercolor-reference-gate.js`
- `shared/graphics/illustration-character-kaykit.js`
- `shared/graphics/illustration-character-shell.js`
- `shared/graphics/illustration-character-reference-gate.js`
- `shared/graphics/illustration-mass-modeler.js`

**Канонический handoff:** `docs/LIVING_WATERCOLOR_3D_HANDOFF_2026-10-05.md`

**Публичный MVP:** `https://mpaykin1.github.io/scratch-chain-reaction/living-watercolor-3d/?object=worker`

**Зафиксированные успехи:**
- дом, дерево, электростанция — пользовательские эталоны;
- Illustration-First вулкан и дым вулкана — пользовательские эталоны;
- KayKit motion transfer — успех;
- 139 source clips / 132 unique motions должны сохраняться.

**Незавершённое:**
- внешний вид работника ещё не подтверждён пользователем как успех;
- необходимо сохранить цельность torso→pelvis→legs;
- голова должна читаться как большой цельный овальный рисованный mass;
- пиджак должен быть заметно темнее светлой рубашки;
- галстук, пиджак и портфель должны читаться мгновенно;
- окончательный visual shell должен пройти пользовательское сравнение с эскизом без регрессии анимаций.

**Критерий выхода из MF:** пользователь явно принимает финальную рисовку работника как успех; анимации и эталонные объекты не регрессируют; финальная рабочая версия и evidence зафиксированы в World Server.

---
Машинный источник истины: `data/must-finish.json`.
