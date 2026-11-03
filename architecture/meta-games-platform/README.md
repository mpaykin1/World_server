# META GAMES PLATFORM

Первый рабочий модуль: проверяемый каталог реальных игровых источников из `meta6` без выдачи неподтверждённых лицензий.

`node architecture/meta-games-platform/catalog.mjs validate` — проверка корректности путей, SHA и прав.
`node architecture/meta-games-platform/catalog.mjs games` — найденные игры.
`node architecture/meta-games-platform/catalog.mjs inspect observer-v7` — структура источника конкретной игры.
`node architecture/meta-games-platform/catalog.mjs eligible-assets` — **только** разрешённые к распространению компоненты (пока пусто).
`node architecture/meta-games-platform/catalog.mjs review-candidates` — обнаруженные компоненты с неподтверждёнными правами (не экспортируются).

Источник игровых метаданных: [meta6/SOURCE_INDEX.md](https://github.com/mpaykin1/meta6/blob/main/SOURCE_INDEX.md) и [meta6/game-source-index.json](https://github.com/mpaykin1/meta6/blob/main/game-source-index.json).
Семь движков остаются в `architecture/engines/`, не дублируются. Не менять принятые игры. Не публиковать сторонние ассеты без проверки прав.

**Новым чатам и пяти автозадачам:** сначала [CONTINUATION.md](CONTINUATION.md), затем [NEXT_TASK.md](NEXT_TASK.md).
