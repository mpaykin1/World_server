# Meta5 — объединённый glyph + procedural graphics + live AI MVP

**Дата:** 30 сентября 2026  
**Статус:** USER-VISIBLE SUCCESS / отдельная новая версия  
**Живая версия:** https://mpaykin1.github.io/meta5/  
**Репозиторий:** https://github.com/mpaykin1/meta5  
**Meta5 exact commit:** `eecb8d6b368760e5a01b61bac114be4aceedf1ae`  
**World Server AI merge:** `284dc4eba8d127b218ae7998a05a4bafc156a151`

## Что было объединено

Meta5 специально создана как отдельная версия, чтобы не менять успешные Meta4 и procedural MVP.

Из Meta4 сохранены:
- система иероглифов и карточек;
- смена пятёрок действий;
- причинные ресурсы/жители;
- локальный отчёт;
- NO/YES gate перед изменением мира.

Из procedural MVP сохранены и усилены:
- удобный one-finger pan;
- pinch-to-zoom с сохранением world-point под пальцами;
- tap-to-place в точное место;
- процедурный фон только по видимым cells;
- заметные графические объекты и анимации.

Новый слой:
- над каждым построенным графическим объектом рисуется маленький иероглиф действия;
- прогнозы больше не берутся из заранее написанного `forecastFor()`;
- клиент обращается к живому World Server `/api/chain-ai`.

## Новый backend contract

Чтобы не ломать существующий `mode=predict_build`, в World Server добавлен отдельный backwards-compatible режим:

    mode = predict_action

Он принимает только фиксированный allowlist Meta4 из 25 glyph-actions, фильтрует world context, принимает bounded counts объектов в текущем viewport и возвращает существующую qualitative prediction schema:

    summary
    immediate[]
    later[]
    risks[]
    surprise
    confidence
    executed:false

AI остаётся только советчиком. Он не мутирует world-state.

Критический порядок:

    select glyph
    -> tap world location
    -> snapshot current state + visible-area counts
    -> live AI prediction
    -> NO / YES
    -> NO: 0 mutations
    -> YES: exactly 1 object at selected world coordinates

## Живой AI evidence

Production endpoint:

https://world-server.mmmpaykin.workers.dev/api/chain-ai

Реальный POST с `mode=predict_action`, action=`river` прошёл в production:

- provider: `groq`
- `executed:false`
- response latency in direct smoke: about 0.76 s
- returned real qualitative prediction

Meta5 browser E2E на viewport 390×844 также получил:

    LIVE AI · groq · executed=false

То есть клиентская модалка действительно получила ответ production AI, а не встроенный текст.

## Mobile browser evidence

Проверено через реальный Chromium browser session с touch emulation на 390×844:

- Meta5 загружается и экспортирует debug state;
- AI status: 3 configured providers online;
- one-finger pan меняет camera coordinates;
- document scroll остаётся 0;
- HUD screen-space position остаётся неизменной;
- pinch изменил zoom 1.00 -> 1.75;
- после AI-прогноза перед YES объектов было 0;
- NO оставил объектов 0;
- повторный live AI forecast прошёл через Groq;
- YES создал ровно один `city`;
- созданный город оказался внутри текущего playable viewport;
- карточка города после использования стала disabled;
- локальный report содержит город.

Фактическая browser screenshot дополнительно показала:
- процедурный город с объёмными зданиями и светящимися окнами;
- маленький `門` над городом;
- жителей в world-space;
- фиксированный HUD;
- glyph deck внизу;
- badge `AI: groq`.

## Почему объединение получилось

Ключевой принцип — иероглиф не заменяет графический объект.

Теперь цепочка выглядит так:

    glyph meaning
    -> exact world coordinate
    -> live AI forecast
    -> player confirmation
    -> procedural graphical object
    -> small glyph label above object
    -> causal residents/resources/report

Иероглиф остаётся компактным языком интерфейса, а мир получает визуально наблюдаемые последствия.

## Graphics lane

Унаследованы/переписаны procedural renderers для:
- city;
- forest;
- volcano;
- energy station;
- farm;
- river.

Дополнительно Meta5 рисует отдельные procedural forms для воды, гор, дороги, рынка, ветра, моста, идеи, сада, солнца/ночи/облаков/дождя, огня, общины и building-family объектов.

Используются дешёвые Canvas primitives:
- pseudo-isometric boxes;
- cylinders;
- polygons/lines;
- ground ellipses;
- glow;
- smoke;
- animated water/fire/wind/weather.

Это остаётся lightweight lane, а не доказательством использования оригинального .kkrieger renderer.

## Что нельзя потерять дальше

1. Не менять Meta4 и прошлый procedural MVP при развитии Meta5.
2. Pan должен двигать world/camera, а не страницу.
3. Pinch должен сохранять world-point под центром жеста.
4. Tap после выбора glyph задаёт точную world-space позицию.
5. До ответа AI и YES world-state не меняется.
6. На AI error нельзя подменять ответ заранее написанным forecast; показывать честную ошибку и Retry.
7. YES создаёт один объект.
8. Над объектом сохраняется маленький glyph.
9. Графический объект должен быть заметным и отличимым.
10. Local report продолжает зависеть от текущего viewport.
11. AI keys остаются только на сервере.
12. Только бесплатные allowlisted provider lanes.

## Следующий разумный шаг

Не начинать Meta6 с нуля.

Развивать Meta5 по вертикали:
- сохранять текущий camera/input;
- расширять procedural graphics detail;
- передавать AI более богатый, но bounded spatial context;
- связывать AI prediction с authoritative World Server world state;
- затем заменить локальную simulation state на общий world_id/revision persistence;
- отдельно проверить физический iPhone.

Главный reusable success:

**glyph UI + precise spatial input + animated graphics + live server AI работают как одна цепочка, при этом старые успешные версии не затронуты.**
