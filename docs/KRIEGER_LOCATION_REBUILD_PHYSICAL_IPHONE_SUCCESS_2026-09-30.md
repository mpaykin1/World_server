# Krieger Location Rebuild — подтверждённый успех на physical iPhone

**Дата:** 30 сентября 2026  
**Статус:** USER-CONFIRMED PARTIAL SUCCESS  
**Канонический MVP:** https://mpaykin1.github.io/scratch-chain-reaction/kkrieger-rebuild-lab/

## Что подтвердил пользователь

После проверки опубликованного MVP на физическом iPhone пользователь сообщил:

> «Локация немножко меняется — это уже хорошо»

Это первый human-visible success для нативного Krieger location rebuild: изменение больше не существует только в телеметрии или pixel-diff — пользователь реально видит, что сама локация меняется.

## Что технически было доказано до пользовательской проверки

Публичный workflow Krieger Location Rebuild прошёл полный цикл:

- real KX/C++/WASM path;
- target native transforms: 86;
- реально затронутые transforms: 48;
- full-frame delta: около 46%;
- center-scene delta: около 48%;
- portrait height coverage: 100%;
- `WeaponOptics` остаётся bound;
- `WeaponShot` остаётся bound;
- FIRE доходит до настоящего `KKriegerGame::FireShot`;
- ammo `100 -> 99`;
- exact public bytes PASS;
- повторный smoke test уже по публичному GitHub Pages URL PASS.

Канонический workflow:

https://github.com/mpaykin1/scratch-chain-reaction/actions/runs/36679495033

## Почему это важнее предыдущего Surgery Lab

Surgery Lab доказал native KOp control, но на physical iPhone пользователь почти не видел разницы между ORIGINAL и MODIFIED.

Location Rebuild исправляет именно этот провал:

```
native operator control
+
large framebuffer delta
+
physical-iPhone visible change
=
первый подтверждённый шаг к authoring control
```

## Важное ограничение

Пользователь специально сказал: локация меняется **немножко**.

Поэтому нельзя записывать этот этап как «полный контроль над графикой Krieger».

Корректный статус:

**мы умеем заметно менять настоящую локацию Krieger через её native operator path, но ещё не умеем создавать очевидно новую архитектуру уровня Krieger с полным контролем над геометрией, материалами, светом, collision и portal semantics.**

## Что сохранять

Следующие решения считаются успешными и должны переиспользоваться:

1. не заменять Krieger на JS/WebGL mock;
2. менять native KOp/Scene_Transform path;
3. сохранять исходные materials/textures/effects;
4. сохранять родное оружие и FireShot;
5. проверять public bytes и публичный URL;
6. automated pixel diff использовать только вместе с physical-device judgment;
7. ORIGINAL/REBUILT должны оставаться доступными для сравнения.

## Следующий уровень

Следующий MVP должен перейти от «локация немного деформируется» к **явно другой архитектурной композиции**.

Минимальный human-visible target:

- другая ширина помещения;
- другой ритм колонн/арок;
- другая высота/профиль потолка;
- другое положение крупных архитектурных элементов;
- при этом сохраняется узнаваемый Krieger material/light/effect pipeline.

Пользователь должен заметить различие за 1–2 секунды без объяснения, что именно искать.

## Канонический исходник знания

Полный source-side record:

https://github.com/mpaykin1/scratch-chain-reaction/blob/main/KRIEGER_LOCATION_REBUILD_PHYSICAL_IPHONE_SUCCESS_2026-09-30.md

Merge commit в scratch-chain-reaction:

`76bf8af403b40ff0d4e8ffd09cf17ec8a686206c`
