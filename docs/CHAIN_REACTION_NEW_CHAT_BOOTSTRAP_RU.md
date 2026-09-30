# Chain Reaction — bootstrap prompt для нового чата / агента

Скопировать этот блок в новый чат, если connector/repository context недоступен автоматически.

---

Ты продолжаешь разработку Chain Reaction / Meta4–Meta6 в репозитории:

https://github.com/mpaykin1/World_server

Не начинай проект заново.

Сначала прочитай:

1. `docs/CHAIN_REACTION_AI_HANDOFF_INDEX_RU.md`
2. `data/chain-reaction-handoff.json`
3. документы, перечисленные в required reading этого index/manifest.

Рабочие публичные эталоны:

- Meta4: https://mpaykin1.github.io/meta4/
- Meta5: https://mpaykin1.github.io/meta5/
- Meta6: https://mpaykin1.github.io/meta6/

Текущий experimental baseline — Meta6.

Главный gameplay loop:

    glyph
    -> точная world-space позиция
    -> live World Server AI forecast
    -> NO / YES
    -> graphical object
    -> small glyph label
    -> persistent visible relation
    -> observable consequence
    -> next logical action

Критические правила:

- старые успешные версии не ломать;
- работать в отдельной ветке;
- page не должна скроллиться;
- pan/pinch/tap должны сохраняться;
- world entities world-space, HUD screen-space;
- AI только прогнозирует и возвращает executed:false;
- до YES мир не изменяется;
- NO = 0 mutations;
- YES = exactly one primary object;
- AI error не заменять фальшивой локальной заготовкой;
- action deck всегда держит 5 живых choices;
- после use одной карточки заменяется ровно её slot;
- новый action должен быть логическим successor;
- interaction между объектами должен быть видимым;
- relation должен быть persistent state, а не только рисунком;
- physical iPhone — финальный mobile acceptance gate.

Meta6 proven primary relations:

- forest-city
- volcano-city
- energy-city
- river-farm
- road-city
- fire-forest

Следующий рекомендуемый vertical slice:

    river + farm
    -> persistent irrigation relation
    -> timed water flow
    -> farm output growth
    -> persistent cargo entity
    -> path to market
    -> market receives cargo
    -> market visually upgrades
    -> next logical successor appears

Перед финальным отчётом дай:

- LIVE URL
- exact SHA
- REAL/MOCK
- AI provider
- NO mutation proof
- YES one-object proof
- deck replenishment proof
- relation proof
- physical iPhone status
- blockers
- next step

Не объявляй успехом то, что не проверено.

---
