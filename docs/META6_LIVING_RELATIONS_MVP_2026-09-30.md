# Meta6 — Living Relations MVP

**Дата:** 30 сентября 2026  
**Статус:** отдельный новый MVP, Meta5 не изменялась  
**Живая версия:** https://mpaykin1.github.io/meta6/  
**Репозиторий:** https://github.com/mpaykin1/meta6  
**Meta6 commit:** `32ab5e3295b98779a9cb72bd9abdcb185718bf03`  
**World Server preserved app:** `apps/chain-reaction-meta6-living-relations/index.html`

Meta6 создана поверх успешной идеи Meta5, но в отдельном репозитории, чтобы не ломать предыдущий рабочий MVP.

## Что добавлено

Главная новая система — **видимые связи между объектами**.

Теперь совместимые постройки, размещённые рядом, автоматически создают relation-object в world-state:

    object A
    + object B
    + distance <= relation range
    -> relation discovered
    -> one-time causal resource effect
    -> persistent animated visual link
    -> relation appears in local report

Связь — это не текстовая подсказка и не скрытое изменение цифр. Она имеет отдельный визуальный renderer.

## Шесть главных взаимодействий MVP

### 1. Лес ↔ Город

Видимо:
- соединяющая тропа;
- движущиеся точки потока;
- подпись «люди + древесина».

Игровой смысл:
- город начинает использовать лес;
- связь добавляет небольшой экологический/социальный бонус.

### 2. Вулкан → Город

Видимо:
- пунктир опасности;
- поток пепла;
- красное свечение города;
- подпись «пепел / эвакуация».

Игровой смысл:
- город получает отрицательное влияние;
- надежда и население могут уменьшаться.

### 3. Энергия → Город

Видимо:
- энергетическая линия;
- быстро движущиеся световые импульсы;
- подпись «электричество».

Игровой смысл:
- дополнительная энергия/надежда.

### 4. Река → Поля

Видимо:
- синяя линия орошения;
- движущиеся водяные импульсы;
- ответвления каналов к полям;
- подпись «орошение».

Игровой смысл:
- продовольственный бонус.

### 5. Дорога ↔ Город

Видимо:
- дорожный коннектор;
- движущийся транспорт;
- подпись «транспорт».

Игровой смысл:
- улучшение связности и надежды.

### 6. Огонь → Лес

Видимо:
- поток искр;
- красное свечение;
- дым над лесом;
- подпись «огонь распространяется».

Игровой смысл:
- падение экологии/еды/надежды.

## Дополнительные связи, уже заложенные в Meta6

Система уже поддерживает несколько дополнительных combinations:

- река ↔ лес;
- поля → рынок;
- мост ↔ река;
- дождь → огонь.

Это показывает, что relation-engine не зашит под одну пару, а является расширяемым registry.

## Почему эта архитектура важна

До Meta6 объект существовал в основном как отдельная сущность:

    построил город
    построил лес

Теперь появляется дополнительный слой:

    город
      ↕ relation
    лес

То есть мир начинает хранить не только сущности, но и **отношения между сущностями**.

Это важный шаг к настоящей «Цепной реакции».

## Relation data model

Каждая связь хранит:

- `id`;
- `a` / `b` — object IDs;
- `type`;
- `label`;
- `born`.

Связь создаётся только один раз для одной пары object IDs.

Registry:

    relationKey(kindA, kindB)
    -> interactionSpecs[key]
    -> type + label + effect

Это позволяет добавлять новые пары без переписывания input, camera или base object rendering.

## Visual relation vocabulary

В Meta6 использованы повторно применимые визуальные паттерны:

- line;
- dashed line;
- flow dots;
- pulses;
- glow;
- smoke;
- branching channels;
- midpoint label.

Следующие взаимодействия должны строиться из этого словаря или расширять его, а не создавать отдельную хаотичную систему для каждой пары.

## Action deck: исправлена ошибка Meta5

Meta5 ожидала использования всех пяти карточек:

    if (used.size === 5) nextDeck()

Это ломало ощущение непрерывного развития.

Meta6 использует другой contract:

    5 active cards
    -> consume one
    -> replace exactly that slot
    -> choose logical successor
    -> again 5 active cards

После города, например, первым successor может стать Дом.

В тесте:

    before:
    city | forest | volcano | energy | idea

    after city:
    home | forest | volcano | energy | idea

И все пять карточек остаются enabled.

## Logical successor layer

В Meta6 добавлен `successorMap`.

Примеры:

    city -> home / market / school / road / energy
    forest -> water / garden / river / community / farm
    idea -> school / community / workshop / garden / home
    river -> bridge / farm / city / water / forest
    fire -> water / rain / community / road / forest

Это пока deterministic selector, но он уже выполняет пользовательский contract: следующий вариант является логическим продолжением, а не просто очередным индексом каталога.

## Исправление «Идея не нажимается»

В Meta6 action cards используют `pointerup` как единый touch/mouse activation path.

Browser mobile E2E с настоящим CDP touch event доказал:

    touch 人 Идея
    -> active=true
    -> message changes to selected Idea
    -> world tap
    -> forecast modal opens
    -> live AI request completes
    -> provider response received

В конкретной проверке `Идея` дошла до live AI через Gemini с `executed:false`.

Это лучше предыдущей Meta5 ситуации, где пользователь сообщал, что «Идея» визуально не нажимается.

Физический iPhone всё ещё должен быть финальным acceptance proof, но browser touch path теперь воспроизводимо работает.

## Live AI сохранён

Meta6 продолжает использовать:

https://world-server.mmmpaykin.workers.dev/api/chain-ai

и `mode=predict_action`.

В E2E:

- Idea -> live AI terminal state, provider Gemini;
- City -> live AI, provider Groq;
- `executed:false`;
- only YES mutates world.

То есть relation-engine не заменил и не обошёл AI gate.

## Browser evidence

Проверено на мобильном viewport 390×844:

- Meta6 loaded;
- `Meta6Debug` available;
- AI providers online;
- real touch selects Idea;
- Idea active state visible;
- Idea modal opens;
- live AI reaches terminal response;
- City live AI succeeds;
- City YES creates exactly one object;
- City slot immediately changes to Home;
- exactly five action buttons remain enabled;
- city + forest creates `forest-city`;
- all six primary relation types created successfully;
- local report contains living relation;
- document scroll remains zero.

Observed relation types:

    forest-city
    volcano-city
    energy-city
    river-farm
    road-city
    fire-forest

## Visual evidence

Screenshot from the test showed:

- procedural city;
- procedural forest;
- glyph `門` over city;
- glyph `木` over forest;
- people in world-space;
- visible animated connector between forest and city;
- midpoint relation label «люди + древесина»;
- five live action cards at bottom;
- AI badge.

## Important limitations

This remains an MVP.

- Relation matching is currently distance-based.
- Most relation resource effects are one-time discovery effects.
- There is no road/pathfinding graph yet.
- Moving dots/carts are visual proxies, not individual persistent logistics entities.
- Fire does not yet physically propagate tree-by-tree.
- Volcano ash does not yet affect a terrain field over time.
- Interaction AI is not yet generating relation recipes dynamically.
- Final physical-iPhone verification remains required.

These are next layers, not reasons to rewrite the current working MVP.

## Reuse rule

Do not start the next version from scratch.

Preserve:

- Meta6 camera/input;
- exact world-space placement;
- live AI gate;
- procedural object renderers;
- small glyph labels;
- continuous 5-slot deck;
- successor map;
- relation registry;
- relation data model;
- relation visual vocabulary;
- local report.

Then deepen interactions:

    visual proxy
    -> persistent flow entity
    -> path/network
    -> delayed consequence
    -> new spawned object
    -> multi-step chain reaction

## Main lesson

Meta6 proves a critical transition:

**objects are no longer isolated decorations.**

The player can now see:

**object A → animated relation → object B → resource/behavior consequence.**

That visible causal bridge is the foundation for the next generation of Chain Reaction gameplay.


## Связанные документы для продолжения

Для следующего агента этот файл не является единственной точкой входа. Читать вместе с:

- `docs/CHAIN_REACTION_AI_HANDOFF_INDEX_RU.md` — центральный индекс и порядок чтения;
- `docs/META6_TECHNICAL_ARCHITECTURE_RU.md` — state/input/AI/object/relation/deck architecture;
- `docs/META6_AI_LESSONS_RU.md` — короткие правила, что переиспользовать и каких ошибок не повторять;
- `docs/META6_REGRESSION_PROTOCOL_RU.md` — обязательные проверки и следующий multi-step chain slice.

Если дальнейшая реализация расходится с этими документами, она должна явно объяснить, какой proven invariant изменяется и почему.
