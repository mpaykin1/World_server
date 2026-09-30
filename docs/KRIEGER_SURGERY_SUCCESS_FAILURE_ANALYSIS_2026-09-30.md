# Krieger Surgery Lab — success/failure analysis after physical iPhone

**Дата:** 2026-09-30  
**Основание:** пользовательская проверка на physical iPhone после публикации Krieger Surgery Lab  
**Статус:** PARTIAL SUCCESS + IMPORTANT FAILURE

## Что было успехом

Surgery Lab впервые доказал несколько вещей одновременно:

1. мы меняем **настоящий native Krieger KOp**, а не рисуем mock поверх canvas;
2. сохраняется настоящий C++/WASM renderer path;
3. `WeaponOptics` и `WeaponShot` остаются bound;
4. FIRE доходит до реального `KKriegerGame::FireShot`;
5. ammo реально меняется;
6. portrait master viewport работает на полном вертикальном экране;
7. public build после публикации повторно проверялся browser smoke test.

Это важный переход от «можем запускать Krieger» к «можем вмешиваться в его internal operator graph без разрушения всей системы».

## Что было неудачей

На physical iPhone пользователь не увидел практически никакой очевидной разницы между ORIGINAL и MODIFIED.

Автоматический тест видел:

- около 10% changed pixels в области оружия;
- локальный framebuffer delta;
- изменение scale/translate нативного KOp 219.

Но человек на реальном телефоне визуально воспринимал обе версии одинаково.

### Главный вывод

**Pixel-diff PASS не равен human-visible graphics control.**

Мы доказали техническую управляемость одного operator, но не доказали достаточную силу графического изменения.

## Почему тест дал ложное ощущение успеха

Test gate отвечал на вопрос:

> «Изменилась ли картинка статистически?»

Пользовательский критерий был другой:

> «Очевидно ли, что мы реально можем перестроить графику Krieger?»

Небольшая локальная деформация оружия могла пройти diff threshold, оставаясь практически незаметной на физическом экране.

Это тот же класс ошибки, что раньше был с black-screen coverage:

- метрика технически истинна;
- но она измеряет более слабое свойство, чем пользовательский success criterion.

## Новая иерархия доказательств

Для Krieger graphics-control:

1. **physical iPhone user-visible result** — высший уровень;
2. public browser framebuffer evidence;
3. native runtime telemetry;
4. source-level operator provenance;
5. synthetic local test.

Нижний уровень не может отменить провал верхнего.

## Новый обязательный визуальный gate

Для следующего MVP ORIGINAL / REBUILT должны отличаться настолько, что:

- разницу видно без zoom;
- пользователь не должен искать изменённый элемент;
- разница заметна за 1–2 секунды;
- изменяется существенная часть архитектуры сцены, а не несколько пикселей;
- тест сравнивает не только weapon region, но и architecture region/full frame;
- automated diff threshold должен быть заведомо большим;
- после CI PASS нужна проверка на physical iPhone.

## Второй обнаруженный regression — page dragging

В том же physical-iPhone тесте вернулась проблема: всю игровую страницу можно тянуть вверх/вниз.

Это делает управление камерой нестабильным, потому что gesture конкурирует с browser scroll/rubber-band.

Причина: прежний portrait shell фиксировал `#wrap`, но не делал достаточно жёсткий document-level lock для iOS/Telegram visual viewport.

Исправление и обязательный стандарт:

- [FIXED_GAME_VIEWPORT_CONTRACT_RU.md](FIXED_GAME_VIEWPORT_CONTRACT_RU.md)
- `shared/fixed-game-viewport.js`

## Новый MVP: Location Rebuild, а не Micro Surgery

Следующий experiment меняет масштаб задачи.

Вместо одного KOp оружия:

```
one optics transform
```

нужно менять большой набор **native Scene_Transform operators настоящей локации**.

Цель:

```
ORIGINAL
-> same native KX/material/bitmap/renderer pipeline
-> deterministic mutation of many location Scene_Transform KOps
-> REBUILT location
```

При этом нельзя:

- заменить сцену JS/WebGL mock;
- очистить MeshJobs/EffectJobs;
- заменить материалы одноцветными;
- потерять оружие;
- потерять FIRE;
- потерять procedural textures/normals;
- потерять portrait/fixed viewport behavior.

## Success criterion нового MVP

Новый MVP считается успешным только если одновременно:

1. location visually changes on a large scale;
2. native KOp telemetry proves many location transforms were touched;
3. architecture-region framebuffer diff проходит высокий threshold;
4. weapon remains visible;
5. FIRE remains native;
6. page cannot scroll/rubber-band;
7. public exact-bytes gate PASS;
8. public browser re-proof PASS;
9. physical iPhone confirms the difference is obvious and page is fixed.

## Переносимый инженерный вывод

Мы должны перестать оптимизировать тесты под «что легче доказать автоматически».

Сначала формулируется **человеческий критерий успеха**, затем автоматика должна быть достаточно строгой, чтобы плохой человеческий результат не мог пройти.

Для graphics research это означает:

```
human-visible objective
-> source-level provenance
-> internal telemetry
-> strong visual delta gate
-> physical-device confirmation
```

а не наоборот.
