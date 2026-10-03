# Krieger Surgery → Location Rebuild learning record

**Дата:** 30 сентября 2026  
**Статус:** VERIFIED LEARNING RECORD  
**Финальная пользовательская власть:** физический iPhone важнее синтетического pixel-diff PASS.

## 1. Что было успехом в Surgery Lab

Surgery Lab впервые доказал нативный контроль над настоящим Krieger operator graph без подмены рендера примитивами.

Мы смогли:

- выбрать конкретный native KOp;
- изменить его параметры внутри C++/WASM runtime;
- сохранить исходные procedural materials/bitmaps/scene dependencies;
- сохранить WeaponOptics и WeaponShot;
- сохранить реальный FIRE path до `KKriegerGame::FireShot`;
- сохранить full-height portrait renderer.

Архитектурный успех:

```
real KX graph
 -> exact native KOp/subtree
 -> runtime mutation
 -> original downstream material/effect dependencies
 -> normal Krieger renderer
```

Это настоящий шаг к total control.

## 2. Что было неудачей в Surgery Lab

Физический iPhone показал, что ORIGINAL и MODIFIED почти неразличимы для человека.

Автотест видел около 10% changed pixels в зоне оружия и поэтому дал PASS. Но пользователю изменение не было очевидно.

### Ошибка acceptance gate

Было неверно считать:

```
statistically measurable framebuffer delta
≈
visually obvious design change
```

Pixel diff реагирует на субпиксельные сдвиги, антиалиасинг и небольшие изменения света. Человек на телефоне оценивает, действительно ли дизайн заметно изменился.

Поэтому нужно разделять:

- **native-control PASS** — конкретный Krieger operator реально изменён;
- **human-visible authoring PASS** — человек сразу видит новую форму/композицию.

Surgery Lab прошёл первое и не доказал второе.

## 3. Новый permanent gate

Для графических MVP теперь нужны три независимых доказательства:

```
SOURCE CONTROL PROOF
native operator/subgraph реально изменён

RENDER PROOF
ожидаемая область framebuffer существенно изменилась

HUMAN PROOF
разница очевидна на физическом iPhone
```

Первые два автоматизируются. Третий — финальный.

## 4. Следующий MVP: Krieger Location Rebuild Lab

Канонический repo:

https://github.com/mpaykin1/scratch-chain-reaction

PR:

https://github.com/mpaykin1/scratch-chain-reaction/pull/55

Merge commit:

`3e1c8739251673eb28fef0ddbd61072792a8a172`

Published-main commit:

`fc25502e412bdec8ca08689a36f642c60786d125`

Permanent public MVP:

https://mpaykin1.github.io/scratch-chain-reaction/kkrieger-rebuild-lab/

Main verification run:

https://github.com/mpaykin1/scratch-chain-reaction/actions/runs/36676985477

## 5. Что именно перестраивается

Rebuild Lab больше не меняет один weapon optics operator.

Он содержит целевой набор из **86 native `Scene_Transform` operators** из gameplay-location branch.

В REBUILT mode:

- сохраняются исходные meshes;
- сохраняются original procedural textures/materials;
- сохраняются lights;
- сохраняются native sectors/portals в graph;
- сохраняются weapon/effect graphs;
- меняются X/Z scale, yaw и X/Z offsets у реальных location transforms;
- вертикальный envelope специально не ломается, чтобы location продолжала занимать весь portrait frame.

То есть это уже не «сдвинули одно оружие», а массовая управляемая перестройка layout на настоящем Krieger scene graph.

## 6. Полезная промежуточная неудача

Первая версия Rebuild Lab была слишком агрессивной.

Она меняла также vertical scale/offset/roll. Результат:

- nonBlackRatio ~0.53;
- heightCoverage упал до ~0.673;
- верхние ~33% кадра стали пустыми.

Gate правильно заблокировал MVP.

### Вывод

«Большая разница» сама по себе не является успехом.

Нужно одновременно держать:

```
large visual delta
+
scene still fills viewport
+
Krieger material fidelity survives
+
weapon/effect path survives
```

Исправление: rebuild теперь меняет планировку через X/Z rhythm + yaw, но сохраняет vertical envelope.

## 7. Финальный автоматический PASS

Локальный verified run:

- target transforms: **86**
- реально исполнено в кадре: **48**
- ORIGINAL height coverage: **1.0**
- REBUILT height coverage: **1.0**
- full-frame changed-pixel ratio: **~0.461**
- full-frame mean delta: **~30.3**
- center-scene changed-pixel ratio: **~0.478**
- center-scene mean delta: **~34.4**
- WeaponOptics bound: **1**
- WeaponShot bound: **1**
- FIRE count: **0 → 1**
- ammo: **100 → 99**
- real shot op: **744**

Public exact-bytes gate passed, затем тот же smoke test повторно прошёл уже на GitHub Pages URL.

Public re-proof:

- full-frame diff ratio: **~0.462**
- center-scene diff ratio: **~0.479**
- ORIGINAL/REBUILT height coverage: **1.0**
- touched native transforms: **48**
- real firing still works.

## 8. Почему этот MVP важнее предыдущего

Surgery Lab доказал:

> «мы можем менять один нативный Krieger operator».

Location Rebuild Lab доказывает:

> «мы можем менять десятки нативных location operators одновременно, сохраняя настоящий Krieger rendering/material/weapon pipeline».

Это уже переход от точечной хирургии к управлению layout language.

## 9. Что этот MVP ещё НЕ доказывает

Нельзя считать, что полная custom-level система уже готова.

Runtime Scene_Transform mutation доказывает визуальный layout control, но ещё не гарантирует, что:

- collision topology перестроена идеально синхронно;
- sector/portal connectivity соответствует новой геометрии;
- AI navigation использует уже новую архитектуру;
- новая location является полностью независимым authored KX recipe.

Это следующий уровень Native Level Lab v2.

## 10. Следующий правильный шаг после физического iPhone PASS

Если пользователь подтверждает, что ORIGINAL ↔ REBUILT действительно очевидно отличается на iPhone, следующий шаг:

1. превратить rebuild из runtime override в `WorldRecipe -> KOp recipe`;
2. перестраивать один полноценный sector;
3. синхронно перестраивать collision mesh;
4. перестраивать portal connections;
5. сохранять lights/material/effects;
6. создать первый собственный room/sector из native Krieger recipes;
7. затем связать 2–3 таких sector в новую location.

## 11. Permanent regression rules

1. Нельзя называть pixel-diff PASS пользовательским визуальным PASS.
2. Physical iPhone имеет финальное слово.
3. Большой visual delta не должен уничтожать viewport coverage.
4. Location transformation должна оставаться native KOp operation.
5. Не использовать JS replacement geometry для доказательства Krieger control.
6. WeaponOptics/WeaponShot должны оставаться bound.
7. FIRE обязан доходить до real FireShot.
8. Automated gate location rebuild должен проверять full-frame delta, а не маленькую область.
9. Нельзя ломать original mode — сравнение всегда должно быть доступно.
10. Следующий milestone — collision/sector/portal parity, а не ещё более большой pixel diff.
