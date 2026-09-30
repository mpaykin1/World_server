# .kkrieger — разбор неудачного прототипа и постоянные уроки

Дата инцидента: 2026-09-29  
Статус: **CONFIRMED FAILURE → ROOT CAUSE ANALYZED → REGRESSION PROTECTED**  
Связанный PR: #356  
Класс ошибки: visual fidelity / rendering-class substitution

## Что хотел пользователь

Пользователь просил не «FPS в духе Krieger», а автономный HTML с **максимальным сходством с настоящим .kkrieger во всех аспектах**. Это означает, что ключевые свойства исходного рендера являются частью задачи, а не необязательной детализацией:

- настоящий perspective 3D;
- depth-tested 3D environment;
- объёмное 3D-оружие;
- объёмные 3D-монстры;
- процедурные meshes/materials;
- освещение, реально влияющее на геометрию/материалы;
- частицы/вспышки, работающие внутри 3D-сцены;
- автономная упаковка без потери этих свойств.

## Что я сделал неправильно

Первый автономный прототип заменил технологический класс оригинала более простым:

| Аспект | Оригинальный .kkrieger | Неудачный прототип |
| --- | --- | --- |
| Мир | полигональная depth-tested 3D-сцена | 2.5D raycaster |
| Оружие | настоящий 3D mesh | canvas/HUD-рисунок |
| Монстры | объёмные 3D модели | 96×96 billboard sprites |
| Освещение | scene-reactive light/material response | screen-space gradients/darkening |
| Детали | процедурные mesh/material pipelines | упрощённые текстуры и полосы raycaster |
| Разрешение | полноценный render target | 640×360 с увеличением на экран |
| Проверка качества | должна быть side-by-side против референса | проверены в основном запуск/JS/no-crash |
| Критерий успеха | технологическое и визуальное соответствие | «похоже по атмосфере» |

Главная ошибка: **я подменил задачу**. Вместо прямого порта/использования доступного open-source Krieger browser stack я быстро собрал самостоятельную имитацию. Это было удобно для получения автономного файла, но несовместимо с требованием максимального сходства.

## Корневые причины

### 1. Оптимизация не той величины

Я оптимизировал скорость получения одного HTML и маленький runtime раньше, чем подтвердил, что выбранная технология вообще способна выразить референс.

Правильный порядок:

`reference capabilities → renderer class → dimensional fidelity → behavior → autonomous packaging → visual polish`

Ошибочный порядок:

`autonomous HTML → простой renderer → стилизация под reference → self-score`

### 2. Не было hard gate на размерность

До этой ошибки в World Server существовали volumetric/walkable правила для AI3D, но не было универсального правила:

> Если референс настоящий 3D, финал не может быть raycaster/billboard/2D overlay.

Из-за отсутствия такого gate функционально рабочий результат мог ошибочно пройти как «визуально близкий».

### 3. Функциональный smoke был принят за fidelity evidence

Работают управление, стрельба, HUD и нет JS errors — это доказательство работоспособности, **не сходства**.

Для визуального результата обязательны два независимых вопроса:

1. Он действительно работает?
2. Он визуально/технологически соответствует референсу?

PASS по первому не компенсирует FAIL по второму.

### 4. Оружие было вынесено из 3D-сцены

Canvas/HUD weapon невозможно заставить вести себя как настоящий Krieger mesh:

- нет depth;
- нет объёмной геометрии;
- нет корректной перспективы каждой детали;
- нет настоящего material response;
- свет мира не может корректно менять поверхность оружия.

Значит дальнейшая полировка этого подхода была тупиковой.

### 5. Billboard-монстры уничтожили объём

Billboard всегда смотрит на камеру и не имеет собственной глубины. Он не может корректно:

- поворачиваться;
- проходить через разные световые зоны;
- давать читаемый объём;
- иметь настоящий skeleton/articulation;
- совпадать с Krieger при смене ракурса.

Это не «недостаток детализации», а неправильный класс представления.

### 6. Fake lighting вместо scene lighting

Screen-space glow может имитировать яркость, но не способен воспроизвести:

- свет на разных гранях колонны;
- отражение вспышки на оружии;
- изменение материала по нормали;
- затенение и depth interaction;
- локальное освещение соседних поверхностей.

Поэтому добавление большего числа оранжевых градиентов не приблизило бы результат к Krieger.

### 7. Низкое внутреннее разрешение усилило визуальный разрыв

Рендер 640×360, растянутый на большой экран, дополнительно убрал микродетали и сделал поверхность «крупнопиксельной». Нельзя компенсировать неверную геометрию повышением разрешения, но искусственное понижение разрешения ещё сильнее ухудшило сравнение.

### 8. Преждевременная оценка сходства

Я не должен был называть такой результат высоко похожим или прошедшим >85% без свежего side-by-side кадра и без проверки renderer class.

**Правило:** self-score никогда не может отменить hard structural mismatch.

### 9. Я не использовал самый сильный доступный исходный путь

На момент задачи уже существовал открытый `MasonDye/kkrieger-wasm`, который переносит настоящий .kkrieger/werkkzeug3 pipeline в WebAssembly/WebGL2.

Вместо того чтобы использовать его как источник истины, первая версия была написана как самостоятельный прототип. Для задачи «максимальное сходство» это была архитектурная ошибка.

## Что было исправлено

Исправленный путь:

`.kkrieger / werkkzeug3 source`
→ `kkrieger-wasm`
→ `Emscripten`
→ `WebAssembly`
→ `WebGL2`
→ оригинальные procedural mesh/material/game systems
→ embedded KX data
→ `SINGLE_FILE`
→ автономный HTML.

Pinned upstream:

`MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`

Исправленная сборка World Server:

- `artifacts/kkrieger/kkrieger_autonomous_fixed.html`
- `artifacts/kkrieger/kkrieger_smoke.png`
- `artifacts/kkrieger/kkrieger_smoke.json`

Статический аудит требует ноль внешних runtime wasm/data/script зависимостей.

Browser smoke ждёт окончания процедурной генерации и **реального playable root**, а не считает loading screen доказательством игры.

## Постоянные правила для всех следующих чатов/агентов

### Dimensional gate идёт первым

Если reference class = volumetric 3D:

- raycaster = BLOCKED FINAL;
- billboard enemy = BLOCKED FINAL;
- HUD/canvas weapon = BLOCKED FINAL;
- flat sprite weapon = BLOCKED FINAL;
- heightfield/relief substitute = BLOCKED FINAL;
- screen-space-only lighting = BLOCKED FINAL.

Неважно, насколько красиво это выглядит.

### Capability equivalence раньше эстетики

Перед реализацией нужно выписать свойства референса:

`geometry / depth / animation / material response / lighting / particles / camera / resolution`

И доказать, что выбранный renderer может выразить каждое из них.

Если хотя бы ключевой capability отсутствует, renderer нужно менять, а не «дополировывать».

### Side-by-side обязателен

Перед словами «готово», «максимально похоже» или «>=85%»:

1. свежий кадр кандидата;
2. approved reference рядом;
3. отдельная проверка dimensional fidelity;
4. отдельная проверка visual similarity;
5. behavioral browser smoke.

Нельзя округлять 84.9 до 85.

### Автономность не важнее fidelity

Один HTML — это packaging constraint, а не разрешение на упрощение renderer.

Сначала сохраняется rendering class, затем WASM/data встраиваются в один файл.

### Ошибка должна превращаться в защиту

Эта неудача теперь защищена:

- `data/reference-fidelity-policy.json`
- `lib/reference-fidelity-policy.js`
- `scripts/check-reference-fidelity-policy.js`
- `test/reference-fidelity-policy.test.js`
- `docs/REFERENCE_DIMENSIONAL_FIDELITY.md`
- `data/error-prevention-registry.json`
- `npm run fidelity:check`
- CI hard gate.

## Универсальный урок не только для Krieger

Это правило относится ко всем референсным задачам World Server.

Если пользователь показывает:

- полноценный 3D-город — нельзя подменять его heightfield;
- 3D-персонажа — нельзя подменять billboard;
- физический объект — нельзя подменять декоративным HUD;
- реальный dynamic light — нельзя подменять screen overlay;
- анимированную сцену — нельзя доказывать статичным loading screenshot.

**Нельзя оптимизировать похожесть поверх неверного представления. Сначала должен совпасть класс мира, затем его внешний вид.**

## Короткая формула для будущего AI

`REFERENCE → CAPABILITIES → DIMENSIONALITY GATE → TRUE IMPLEMENTATION → BEHAVIORAL SMOKE → SIDE-BY-SIDE → SCORE → DELIVERY`

Если переставить `SCORE` или `DELIVERY` раньше `DIMENSIONALITY GATE`, есть риск повторить именно эту ошибку.
