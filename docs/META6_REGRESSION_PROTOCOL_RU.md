# Meta6 — regression protocol и следующий вертикальный slice

Этот документ — обязательный checklist перед публикацией следующей версии.

## A. Mobile viewport

На 390×844 и физическом iPhone:

- [ ] document scroll = 0
- [ ] HUD не двигается при pan
- [ ] one-finger drag двигает world
- [ ] pinch меняет zoom
- [ ] pinch anchor drift визуально незаметен
- [ ] UI не выходит за экран
- [ ] bottom action deck доступен

## B. Action selection

Для каждой первой карточки:

- [ ] card touch/click регистрируется
- [ ] active state виден
- [ ] message подтверждает selection
- [ ] drag после selection не строит
- [ ] tap в playable area открывает forecast

Обязательно отдельно проверить:
- [ ] Idea / 人

## C. Live AI

- [ ] request идёт в production endpoint
- [ ] response содержит provider
- [ ] executed=false
- [ ] loading visible immediately
- [ ] NO = 0 mutations
- [ ] Retry after failure does not mutate
- [ ] YES = exactly 1 primary object
- [ ] secrets отсутствуют в client

## D. Deck

После каждого из 10 последовательных YES:

- [ ] ровно 5 action cards
- [ ] все 5 enabled
- [ ] заменён только consumed slot
- [ ] остальные 4 не меняются
- [ ] successor логически связан
- [ ] consumed card не возвращается немедленно без причины

## E. Placement

После большого pan:

- [ ] object появляется в tapped position
- [ ] screen-space point соответствует world transform
- [ ] report видит object в текущей области
- [ ] старые offscreen objects не мешают local report

## F. Graphics

Для каждого base action:

- [ ] visible graphical object
- [ ] small glyph above object
- [ ] type visually distinguishable
- [ ] animation does not stop during pan
- [ ] object remains stable in world-space

## G. Relations

Обязательные pairs:

- [ ] forest + city => forest-city
- [ ] volcano + city => volcano-city
- [ ] energy + city => energy-city
- [ ] river + farm => river-farm
- [ ] road + city => road-city
- [ ] fire + forest => fire-forest

Для каждой:
- [ ] relation created once
- [ ] relation persists
- [ ] visible animation
- [ ] relation label/visual semantics understandable
- [ ] resource/behavior effect happens
- [ ] relation appears in local report
- [ ] no duplicate relation for same object pair

## H. Performance

At minimum test:
- [ ] 25 objects
- [ ] 25 relations
- [ ] 50 people
- [ ] continuous 60-second pan/zoom
- [ ] no runaway memory growth
- [ ] no console errors
- [ ] no major frame stalls on target iPhone

## I. Next vertical slice — recommended

Goal: one real multi-step chain.

Recommended chain:

    river + farm
    -> irrigation relation
    -> timed water flow
    -> farm production grows
    -> cargo entity spawns
    -> cargo travels
    -> market receives cargo
    -> market visually upgrades
    -> new action successor appears

### Minimum technical requirements

1. relation has persistent state:
   - intensity
   - capacity
   - lastTick
2. simulation tick updates relation.
3. cargo is a persistent entity, not a dot shader proxy.
4. path between source and destination exists.
5. arrival event changes destination state.
6. visual transformation is obvious.
7. report explains the chain locally.
8. save/reload preserves the chain if persistence is introduced.

## J. Failure handling

If a regression appears:
- do not patch blindly;
- record exact version;
- record device;
- record steps;
- record screenshot/video if possible;
- determine whether bug is input / state / AI / graphics / relation / report;
- add a regression test before closing.

## K. Release evidence block

Every future handoff should include:

    LIVE:
    REPO:
    EXACT SHA:
    DEVICE:
    AI PROVIDER:
    REAL/MOCK:
    NO mutation proof:
    YES one-object proof:
    deck replenishment proof:
    relation proof:
    known blockers:
    next step:


## L. Public delivery gate

Перед отправкой пользователю любой новой публичной ссылки:

- [ ] source commit существует;
- [ ] hosting deployment завершён с success;
- [ ] public URL отвечает HTTP 200;
- [ ] response содержит version-specific marker;
- [ ] baseline URL старой рабочей версии по-прежнему работает;
- [ ] после последнего cosmetic/fix commit live proof повторён;
- [ ] если deployment queued/running/cancelled — не писать «готово» и не называть ссылку рабочей.

Canonical failure analysis: `docs/DELIVERY_FAILURE_GITHUB_PAGES_404_2026-09-30.md`.


## M. AI fallback / offline resilience

Обязательно проверить:

- [ ] prepared forecast отображается сразу до live AI response;
- [ ] prepared development ideas отображаются;
- [ ] live AI success заменяет prepared forecast;
- [ ] network failure оставляет prepared fallback;
- [ ] timeout оставляет prepared fallback;
- [ ] wrong-language/unsupported-locale response оставляет prepared fallback;
- [ ] fallback явно помечен PREPARED FALLBACK;
- [ ] Retry Live AI доступен;
- [ ] YES остаётся enabled при fallback;
- [ ] NO = 0 mutations при fallback;
- [ ] YES = exactly 1 primary action при fallback;
- [ ] поздний stale AI response не перезаписывает закрытый/новый forecast modal.

Source data: `data/chain-reaction-prepared-fallback-en.json`.
Failure analysis: `docs/META6_EN_AI_UNAVAILABLE_FAILURE_2026-09-30.md`.


## N. Multilingual live-AI parity

Для каждого поддерживаемого языка:

- [ ] client отправляет locale;
- [ ] backend prompt/normalizer поддерживает locale;
- [ ] response возвращает effective `language`;
- [ ] production Worker содержит изменение;
- [ ] production smoke возвращает live provider + `executed:false`;
- [ ] default/старый locale не регрессирует;
- [ ] fallback остаётся доступным, но не засчитывается как live AI success.
