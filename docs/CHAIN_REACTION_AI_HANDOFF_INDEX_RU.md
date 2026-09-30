# Chain Reaction / Meta4 → Meta6 — главный handoff для AI-агентов

**Назначение:** это центральная точка входа для любого нового чата/агента, который продолжает разработку «Цепной реакции» / Meta4–Meta6 в World Server.

**Актуально на:** 30 сентября 2026

## 0. Прочитать в этом порядке

1. `docs/CHAIN_REACTION_GAME_DESIGN_RU.md`
2. `docs/CHAIN_REACTION_MOBILE_VIEWPORT_CONTRACT_RU.md`
3. `docs/META4_SUCCESS_STAGE_2026-09-30.md`
4. `docs/PROCEDURAL_KRIEGER_MVP_SUCCESS_2026-09-30.md`
5. `docs/META5_LIVE_AI_MERGE_SUCCESS_2026-09-30.md`
6. `docs/META5_USER_FEEDBACK_SUCCESS_FAILURES_2026-09-30.md`
7. `docs/META6_LIVING_RELATIONS_MVP_2026-09-30.md`
8. `docs/META6_TECHNICAL_ARCHITECTURE_RU.md`
9. `docs/META6_AI_LESSONS_RU.md`
10. `docs/META6_REGRESSION_PROTOCOL_RU.md`

Не начинать с нуля, пока эти документы не прочитаны.\n\nЕсли нужен готовый короткий контекст для нового чата: `docs/CHAIN_REACTION_NEW_CHAT_BOOTSTRAP_RU.md`.

---

# 1. Коротко: что мы строим

Пользователь строит игру/движок, где:

- иероглифы являются компактным языком действий;
- игрок двигается по бесконечному миру;
- выбирает действие;
- выбирает точку в мире;
- живой AI прогнозирует последствия;
- игрок подтверждает или отменяет;
- после YES появляется графический объект;
- маленький иероглиф остаётся над объектом;
- люди/ресурсы/окружение реагируют;
- объекты начинают взаимодействовать друг с другом;
- отношения между объектами видны на экране;
- игра постоянно предлагает следующие логические действия.

Ключевая формула:

    glyph
    -> spatial choice
    -> live AI forecast
    -> confirmation
    -> graphical object
    -> visible relation
    -> observable consequence
    -> next logical choice

---

# 2. Живые эталонные версии

## Meta4 — spatial/causal baseline

Живая версия:

https://mpaykin1.github.io/meta4/

Сохранять как regression reference.

Meta4 доказала:
- fixed mobile viewport;
- world-space/screen-space;
- viewport-local placement;
- миграцию жителей;
- viewport-local report;
- бесконечный pan;
- glyph deck.

Не переписывать Meta4 ради новой функциональности.

## Meta5 — live AI + graphics baseline

Живая версия:

https://mpaykin1.github.io/meta5/

Meta5 доказала:
- procedural graphical objects;
- small glyph label above object;
- live `/api/chain-ai`;
- `mode=predict_action`;
- NO no-mutation;
- YES one object;
- сохранение pan/pinch/tap.

В Meta5 пользователь обнаружил:
- `Идея` могла не проходить interaction path на физическом устройстве;
- карточки обновлялись только после расходования всей пятёрки.

Эти проблемы подробно зафиксированы в:
`docs/META5_USER_FEEDBACK_SUCCESS_FAILURES_2026-09-30.md`.

## Meta6 — current experimental integration baseline

Живая версия:

https://mpaykin1.github.io/meta6/

Meta6 создана отдельно и **не изменяет Meta5**.

Meta6 добавила:
- persistent relation objects;
- animated visible interactions;
- continuous per-slot action replenishment;
- logical successor selection;
- улучшенный touch activation для карточек;
- сохранён live AI gate.

Meta6 repo:
https://github.com/mpaykin1/meta6

Meta6 exact implementation commit:
`32ab5e3295b98779a9cb72bd9abdcb185718bf03`

World Server preserve/learning merge:
`8d09d350310100cf14f6cc8c88cda22627f08b84`

PR:
https://github.com/mpaykin1/World_server/pull/377

---

# 3. Что пользователь уже подтвердил как хороший UX

Это не гипотезы.

Пользователь положительно оценил:

- удобное движение по пространству;
- появление графических элементов после действий;
- систему иероглифов;
- новую Meta5/Meta6 direction в целом;
- visible object interactions как правильный следующий шаг.

Нельзя ухудшать эти свойства ради «чистой архитектуры».

---

# 4. Неприкосновенные invariants

Следующие правила считаются каноническими:

## Input / viewport

- page не скроллится во время игры;
- canvas owns pan/pinch;
- HUD screen-space;
- world entities world-space;
- tap и drag различаются;
- pinch не должен сдвигать world-point под пальцами;
- новые объекты размещаются в выбранной world-space точке.

## AI

- keys только server-side;
- только разрешённые бесплатные provider lanes;
- AI prediction-only;
- `executed:false`;
- AI никогда не мутирует мир;
- до YES нет world mutation;
- NO = 0 mutations;
- YES = ровно 1 primary action;
- при AI error показывать error/retry, не фальшивый локальный прогноз.

## Graphics

- действие должно иметь видимый графический результат;
- иероглиф не заменяет графический объект;
- маленький glyph остаётся над объектом;
- interaction должен быть виден, а не существовать только в stats.

## Action deck

Новый canonical loop:

    5 live choices
    -> consume one
    -> replace exactly that slot
    -> choose logical successor
    -> again 5 live choices

Не возвращаться к batch replacement after 5.

## Relations

Объекты должны иметь не только state, но и relation state:

    object A
    -> relation
    -> object B

Связь должна:
- быть persistent;
- иметь type;
- иметь visible renderer;
- влиять на simulation;
- попадать в local report.

---

# 5. Первый proven relation set

Meta6 подтверждает следующие relation types:

- `forest-city`
- `volcano-city`
- `energy-city`
- `river-farm`
- `road-city`
- `fire-forest`

Дополнительно заложены:
- `river-forest`
- `farm-market`
- `bridge-river`
- `rain-fire`

---

# 6. Канонический визуальный язык связей

Не делать уникальную одноразовую систему для каждой пары.

Переиспользовать primitives:

- line;
- dashed line;
- moving flow dots;
- pulses;
- glow;
- smoke;
- branching channels;
- midpoint label;
- migrating people;
- transport proxy.

Дальше расширять:
- carts;
- boats;
- power arcs;
- spreading fire;
- ash field;
- water field;
- road/path graph;
- building transformation;
- spawned secondary objects.

---

# 7. Что НЕ считать доказанным

Не переоценивать MVP.

Meta6 пока не доказывает:

- полноценную logistics simulation;
- persistent individual cargo units;
- настоящий road graph/pathfinding;
- physical fire propagation tree-by-tree;
- terrain field simulation;
- authoritative shared persistent world for Meta6;
- AI-generated relation recipes;
- final physical iPhone acceptance for every flow;
- .kkrieger renderer usage.

Meta6 relation animation — хороший visual-causal MVP, но не финальная simulation.

---

# 8. Главная ошибка, которую нельзя повторять

Не путать:

**«есть цифры, которые меняются»**

с

**«игрок видит причинную связь»**.

Правильный стандарт:

    cause
    -> visible bridge
    -> visible behavior
    -> state effect

Например:

    forest + city
    -> trail/flow
    -> people/resources visibly move
    -> city/eco state changes

---

# 9. Главный next step

Не делать Meta7 с нуля.

Следующий вертикальный шаг:

1. сохранить Meta6 camera/input;
2. сохранить live AI gate;
3. сохранить continuous deck;
4. сохранить relation registry;
5. углубить relations from visual proxy to persistent simulation;
6. добавить delayed/multi-step chain reactions;
7. сделать interactions способными порождать новые secondary objects;
8. затем синхронизировать Meta6 state с authoritative World Server persistence;
9. физический iPhone acceptance.

---

# 10. Быстрый checklist для нового AI

Перед изменениями ответить себе:

- Я прочитал Meta4/5/6 handoff?
- Я точно не ломаю прошлые рабочие версии?
- Я использую отдельную ветку?
- Я сохраняю NO/YES gate?
- Я сохраняю world-space coordinates?
- Я не заменяю live AI локальной заглушкой?
- Я не превращаю interaction обратно в скрытые цифры?
- Я не возвращаю batch deck?
- Я добавил regression test?
- Я могу показать пользователю живую ссылку и exact SHA?

Если хотя бы на один вопрос ответ «нет» — сначала исправить процесс.

---

# 11. Source-of-truth

Для gameplay direction:
`docs/CHAIN_REACTION_GAME_DESIGN_RU.md`

Для mobile spatial rules:
`docs/CHAIN_REACTION_MOBILE_VIEWPORT_CONTRACT_RU.md`

Для current relation architecture:
`docs/META6_TECHNICAL_ARCHITECTURE_RU.md`

Для правил обучения AI:
`docs/META6_AI_LESSONS_RU.md`

Для проверок:
`docs/META6_REGRESSION_PROTOCOL_RU.md`

Для работающего кода:
`apps/chain-reaction-meta6-living-relations/index.html`

Для live experimental build:
https://mpaykin1.github.io/meta6/


# 12. Machine-readable manifest

Для агентов, которым нужен быстрый структурированный context без парсинга всех markdown-файлов:

`data/chain-reaction-handoff.json`

Manifest содержит live URLs, exact commits, proven invariants, relation types, known limits, required reading, agent rules и next vertical slice. Markdown-документы остаются source-of-truth для деталей; JSON — быстрый индекс для автоматизированных агентов.


# 13. Delivery failure to learn from

Обязательный release-process разбор:

`docs/DELIVERY_FAILURE_GITHUB_PAGES_404_2026-09-30.md`

Главное правило: repository file existence не доказывает live deployment. Публичная ссылка считается готовой только после deployment success + HTTP 200 + expected marker.


# 14. AI availability failure and fallback contract

Обязательные документы после Meta6 EN failure:

- `docs/META6_EN_AI_UNAVAILABLE_FAILURE_2026-09-30.md`
- `docs/CHAIN_REACTION_AI_FALLBACK_CONTRACT_RU.md`
- `data/chain-reaction-prepared-fallback-en.json`

Новый канон: **gameplay works without AI; live AI upgrades the forecast when available**. Provider failure не должен превращать forecast modal в тупик.
