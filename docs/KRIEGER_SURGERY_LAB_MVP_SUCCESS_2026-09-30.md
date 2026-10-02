# Krieger Surgery Lab MVP — SUCCESS record

**Дата:** 30 сентября 2026  
**Статус:** VERIFIED SUCCESS  
**Назначение:** зафиксировать воспроизводимый способ управлять нативным графическим operator graph Krieger и проверять это автоматикой, чтобы другие чаты/агенты World Server могли повторно использовать результат.

## Канонические точки

- Scratch/Krieger repo: https://github.com/mpaykin1/scratch-chain-reaction
- PR: https://github.com/mpaykin1/scratch-chain-reaction/pull/52
- Verified branch head: `012857fb9e572295f7cdf8d1f952edc6cac134ec`
- Squash merge commit: `73911a2232acecd40b03d982c58fd2b3d34132b2`
- Published main after autonomous HTML commit: `9e4f58b9d837cbd66bffcedca885e68213a76075`
- Public permanent MVP: https://mpaykin1.github.io/scratch-chain-reaction/kkrieger-surgery-lab/
- Main verification run: https://github.com/mpaykin1/scratch-chain-reaction/actions/runs/36672773919
- Upstream Krieger source is pinned to `MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`.

## Что доказал MVP

Это не отдельная имитация графики и не JS replacement mesh.

MVP сохраняет настоящий Krieger C++/WASM rendering path, настоящие `WeaponOptics`, `WeaponShot`, scene/material/bitmap dependencies и меняет только один нативный `Scene_Transform` operator:

- target KOp: **219**;
- он находится внутри weapon-0 optics graph;
- graph root: **224**;
- режим ORIGINAL оставляет исходные параметры;
- режим MODIFIED меняет scale / translation / rotation этого operator в реальном runtime;
- весь остальной Krieger operator graph продолжает работать штатно.

Это важно: доказан контроль не над нарисованной поверх Krieger декорацией, а над внутренним оператором, который участвует в реальном weapon rendering path.

## Автоматические доказательства

CI собрал автономный single-file HTML и прогнал реальный Chromium/WASM test.

### Portrait / visibility

Проверенный viewport:

- browser: `390 × 844`;
- canvas backing: `390 × 844`;
- engine config: `390 × 844`;
- master viewport: `0,0,390,844`;
- projection aspect: `0.46208531`.

Visibility gate:

- original height coverage: **1.0**;
- modified height coverage: **1.0**;
- fired height coverage: **1.0**.

Это выше требуемого пользовательского порога **85%**. Верхняя и нижняя часть vertical viewport реально заполнены рендером.

### Доказательство локальной графической хирургии

ORIGINAL и MODIFIED сравниваются по framebuffer:

- full-frame changed pixels ratio: **0.031957**;
- full-frame mean delta: **2.951**;
- weapon-region changed pixels ratio: **0.100930**;
- weapon-region mean delta: **6.876**.

Правильный признак: изменение заметно в области оружия, но не разрушает весь кадр.

Runtime telemetry:

- ORIGINAL KOp 219 scale: `[1.000,1.000,1.000]`;
- ORIGINAL translate: `[0.170,0.015,-0.005]`;
- MODIFIED scale: `[1.220,1.100,1.350]`;
- MODIFIED translate: `[0.275,0.035,-0.005]`.

## Доказательство настоящей стрельбы

После выбора настоящего weapon slot 0:

- `WeaponOptics[0]` bound = **1**;
- `WeaponShot[0]` bound = **1**;
- `FireShot()` реально достигнут;
- player fire counter: **0 -> 1**;
- ammo: **100 -> 99**;
- runtime shot operator: **744**.

То есть кнопка FIRE проходит через настоящий игровой путь Krieger, а не через визуальный mock.

## Почему получилось

Успех получился из сочетания пяти решений.

1. **Изменяется один нативный operator, а не подменяется renderer.**  
   Это сохраняет materials, procedural bitmaps, normals, scene transforms, weapon events и весь исходный pipeline.

2. **Оператор выбран по разобранному KX graph, а не наугад.**  
   KOp 219 прослежен как часть weapon-0 optics subtree, rooted at KOp 224.

3. **Runtime toggle ORIGINAL/MODIFIED находится внутри C++ path.**  
   JS только вызывает exported C function; геометрическая модификация происходит в `Exec_Scene_Transform`.

4. **Тест проверяет не только картинку, но и внутренние bindings.**  
   `WeaponOptics`, `WeaponShot`, FireShot counter, ammo decrement и framebuffer delta проверяются одновременно.

5. **Публикация считается завершённой только после public re-proof.**  
   Workflow сначала сравнивает точные public bytes с локальным build, затем заново запускает smoke test уже по GitHub Pages URL.

## Какие промежуточные ошибки были полезны

### Ошибка 1: тест ожидал, что CurrentWeapon сразу будет 0

Фактически после reset состояние было:

- CurrentWeapon = 1;
- NextWeapon = 0;
- optics/shot bindings ещё не готовы.

Вывод: нельзя строить acceptance test на предположении о transient weapon state. Тест должен входить через настоящий input path и дождаться фактического native state.

### Ошибка 2: отправить key "1" было недостаточно, пока игра оставалась в intro mode

Даже правильный weapon input не делает gameplay path активным, если first-time reset оставляет `KGS_GAME_INTRO`.

Исправление: для Surgery Lab введён отдельный JS flag `__kkSurgeryLab`, и только для него first-time reset переводит game switch в `KGS_GAME_RUN`.

Вывод: при отладочных/исследовательских вертикальных срезах нужно явно контролировать state machine, а не обходить её визуальными хаками.

## Переносимый паттерн для следующего Krieger MVP

Использовать последовательность:

```
KX graph archaeology
-> выбрать конкретный KOp / subtree
-> минимальная C++ runtime mutation
-> сохранить исходные material/effect dependencies
-> ORIGINAL/MODIFIED toggle
-> internal telemetry
-> framebuffer-locality gate
-> real gameplay action gate
-> portrait visibility gate >= 85%
-> exact public bytes gate
-> public browser re-proof
```

## Regression rules

Следующие свойства теперь считаются обязательными для Krieger-control MVP:

1. не подменять Krieger примитивным JS/Canvas/WebGL mock, если цель — доказать контроль Krieger;
2. каждое графическое изменение должно быть привязано к конкретному native operator/subtree;
3. ORIGINAL должен оставаться доступен рядом с MODIFIED;
4. изменение должно быть локально измеримо, а не просто субъективно заметно;
5. реальные `WeaponOptics` / `WeaponShot` bindings не должны пропадать;
6. FIRE должен доходить до реального `KKriegerGame::FireShot`;
7. mobile portrait render должен занимать >85% высоты, текущий доказанный результат = 100%;
8. autonomous HTML должен быть single-file;
9. public build должен совпадать по bytes с протестированным local artifact;
10. после публикации нужен повторный browser smoke test по постоянному URL.

## Следующий правильный шаг

Не рисовать новый “похожий на Krieger” уровень с нуля.

Следующий шаг — расширить тот же Surgery Lab с одного KOp на маленький контролируемый набор native operators:

- weapon transform;
- material/bitmap parameter;
- one light/effect parameter;
- один scene object transform;

и для каждого сохранить ORIGINAL/MODIFIED + automated evidence.

Так мы постепенно получаем карту управляемых native primitives Krieger, из которых затем можно безопасно собирать собственные уровни с настоящим Krieger-quality rendering path.
